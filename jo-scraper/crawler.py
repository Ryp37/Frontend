"""
Playwright-based crawler for jo.se.

Handles:
- Bot-detection avoidance (realistic browser fingerprint, human-like delays)
- JavaScript-rendered listing page with "Visa fler beslut" pagination
- Per-decision page scraping with content extraction
- Checkpoint/resume support
"""
import asyncio
import json
import logging
import os
import random
import re
import time
from pathlib import Path
from typing import List, Optional, Set

from playwright.async_api import (
    Browser,
    BrowserContext,
    Page,
    Playwright,
    async_playwright,
)

import config
from models import JOBeslut, ScraperResult
from parser import parse_beslut_page

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Browser helpers
# ---------------------------------------------------------------------------

async def _make_context(playwright: Playwright) -> tuple[Browser, BrowserContext]:
    """Launch browser with realistic fingerprint."""
    browser = await playwright.chromium.launch(
        headless=config.HEADLESS,
        args=[
            "--no-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
        ],
    )
    context = await browser.new_context(
        user_agent=config.USER_AGENT,
        locale=config.LOCALE,
        viewport=config.VIEWPORT,
        extra_http_headers={
            "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
            "Accept": "text/html,application/xhtml+xml,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    # Hide webdriver flag
    await context.add_init_script(
        "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
    )
    return browser, context


async def _human_delay(min_s: float = None, max_s: float = None):
    """Wait a randomised, human-like interval."""
    lo = min_s if min_s is not None else config.MIN_DELAY
    hi = max_s if max_s is not None else config.MAX_DELAY
    await asyncio.sleep(random.uniform(lo, hi))


# ---------------------------------------------------------------------------
# Listing page: collect decision URLs
# ---------------------------------------------------------------------------

# CSS selectors to try when looking for decision links on the listing page
_LINK_SELECTORS = [
    f"a[href*='{config.BESLUT_BASE_PATH}']",
    "a[href*='/beslut/']",
    "a[href*='/jo-beslut/']",
    ".search-result a",
    ".beslut-list a",
    ".decision-list a",
    "article a",
    ".wp-block-post a",
]

# Selectors for the "load more" button
_LOAD_MORE_SELECTORS = [
    "button:has-text('Visa fler')",
    "button:has-text('Visa fler beslut')",
    "button:has-text('Ladda fler')",
    "a:has-text('Visa fler')",
    ".load-more",
    "#load-more",
    "[data-load-more]",
]


async def _collect_decision_links(page: Page, max_decisions: int = 0) -> List[dict]:
    """
    Scroll the listing page and collect all decision links.

    Returns a list of dicts: {url, title, diarienummer (if visible)}
    """
    logger.info("Navigating to listing page: %s", config.LISTING_URL)
    await page.goto(config.LISTING_URL, timeout=config.PAGE_LOAD_TIMEOUT, wait_until="networkidle")
    await _human_delay(1.5, 3.0)

    seen_urls: Set[str] = set()
    results: List[dict] = []

    async def _harvest():
        """Harvest links currently visible on the page."""
        for selector in _LINK_SELECTORS:
            try:
                anchors = await page.query_selector_all(selector)
                for a in anchors:
                    href = await a.get_attribute("href") or ""
                    # Skip non-beslut links
                    if not any(p in href for p in ["/besluten/", "/beslut/", "/jo-beslut/"]):
                        continue
                    # Resolve relative URL
                    if href.startswith("/"):
                        href = config.BASE_URL + href
                    if href in seen_urls:
                        continue
                    seen_urls.add(href)

                    title = _clean_text(await a.inner_text())
                    # Try to find a nearby diarienummer
                    dnr = ""
                    dnr_match = re.search(r"\d{3,6}-\d{4}", title)
                    if dnr_match:
                        dnr = dnr_match.group()
                        title = title.replace(dnr, "").strip(" –-")

                    results.append({"url": href, "title": title, "diarienummer": dnr})
                if results:
                    break  # Stop after first selector that yields results
            except Exception as exc:
                logger.debug("Selector %r failed: %s", selector, exc)

    await _harvest()
    logger.info("Found %d links on first load", len(results))

    # Click "Visa fler" repeatedly until exhausted or limit reached
    rounds = 0
    while True:
        if max_decisions and len(results) >= max_decisions:
            break

        clicked = False
        for btn_selector in _LOAD_MORE_SELECTORS:
            try:
                btn = page.locator(btn_selector).first
                if await btn.is_visible(timeout=2_000):
                    await btn.scroll_into_view_if_needed()
                    await btn.click()
                    rounds += 1
                    logger.info("Clicked 'Visa fler' (#%d), waiting for new content…", rounds)
                    await page.wait_for_load_state("networkidle", timeout=config.LOAD_MORE_TIMEOUT)
                    await _human_delay(1.0, 2.5)
                    prev_count = len(results)
                    await _harvest()
                    if len(results) == prev_count:
                        logger.info("No new links after click – possibly end of list")
                        clicked = False
                    else:
                        clicked = True
                    break
            except Exception:
                pass

        if not clicked:
            logger.info("No more 'Visa fler' button found – listing complete")
            break

    if max_decisions:
        results = results[:max_decisions]

    logger.info("Total decision links collected: %d", len(results))
    return results


# ---------------------------------------------------------------------------
# Individual decision page scraping
# ---------------------------------------------------------------------------

async def _scrape_decision(page: Page, entry: dict) -> Optional[JOBeslut]:
    """Navigate to and parse a single decision page."""
    url = entry["url"]
    try:
        logger.debug("Scraping: %s", url)
        await page.goto(url, timeout=config.PAGE_LOAD_TIMEOUT, wait_until="domcontentloaded")
        await _human_delay(0.5, 1.5)

        html = await page.content()

        # Use title from listing if not empty, otherwise read from page
        title = entry.get("title", "")
        if not title:
            try:
                title = await page.title()
            except Exception:
                pass

        beslut = parse_beslut_page(html, url, title, config.BASE_URL)

        # Backfill diarienummer from listing entry if parser couldn't find it
        if not beslut.diarienummer and entry.get("diarienummer"):
            beslut.diarienummer = entry["diarienummer"]

        return beslut

    except Exception as exc:
        logger.warning("Failed to scrape %s: %s", url, exc)
        return None


# ---------------------------------------------------------------------------
# Checkpoint support
# ---------------------------------------------------------------------------

def _load_checkpoint() -> Set[str]:
    path = Path(config.CHECKPOINT_FILE)
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return set(data.get("scraped_urls", []))
        except Exception:
            pass
    return set()


def _save_checkpoint(scraped_urls: Set[str]):
    Path(config.OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
    path = Path(config.CHECKPOINT_FILE)
    path.write_text(
        json.dumps({"scraped_urls": list(scraped_urls)}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def run_scraper(
    max_decisions: int = 0,
    output_file: str = None,
    resume: bool = True,
) -> ScraperResult:
    """
    Full scraper pipeline:
      1. Collect all decision URLs from the listing page.
      2. For each URL (skipping already-scraped if resume=True), parse the decision.
      3. Save incremental JSON after every decision.

    Parameters
    ----------
    max_decisions : int
        Maximum number of decisions to scrape. 0 = no limit.
    output_file : str
        Path to the output JSON file.
    resume : bool
        If True, skip URLs found in the checkpoint file.
    """
    import datetime

    output_path = Path(output_file or config.OUTPUT_FILE)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    scraped_urls = _load_checkpoint() if resume else set()
    logger.info("Resuming from checkpoint: %d already scraped", len(scraped_urls))

    result = ScraperResult(scraped_at=datetime.datetime.utcnow().isoformat() + "Z")

    # Load existing results if resuming
    if resume and output_path.exists():
        try:
            existing = json.loads(output_path.read_text(encoding="utf-8"))
            for b in existing.get("beslut", []):
                result.beslut.append(JOBeslut(**b))
            logger.info("Loaded %d existing beslut from output file", len(result.beslut))
        except Exception as exc:
            logger.warning("Could not load existing output: %s", exc)

    async with async_playwright() as playwright:
        browser, context = await _make_context(playwright)
        page = await context.new_page()

        try:
            # Step 1: Collect listing
            entries = await _collect_decision_links(page, max_decisions=max_decisions)

            # Step 2: Scrape each decision
            for i, entry in enumerate(entries, 1):
                url = entry["url"]
                if url in scraped_urls:
                    logger.debug("[%d/%d] Skipping (already scraped): %s", i, len(entries), url)
                    continue

                logger.info("[%d/%d] Scraping: %s", i, len(entries), url)
                beslut = await _scrape_decision(page, entry)

                if beslut:
                    result.beslut.append(beslut)
                    scraped_urls.add(url)
                else:
                    result.errors.append({"url": url, "title": entry.get("title", "")})

                # Save incrementally
                _flush(result, output_path)
                _save_checkpoint(scraped_urls)

                # Respectful rate limiting
                await _human_delay()

        finally:
            await browser.close()

    result.total_beslut = len(result.beslut)
    _flush(result, output_path)
    logger.info("Done. Scraped %d decisions → %s", result.total_beslut, output_path)
    return result


def _flush(result: ScraperResult, path: Path):
    """Write current result to disk atomically (write-then-rename)."""
    import datetime
    result.scraped_at = datetime.datetime.utcnow().isoformat() + "Z"
    result.total_beslut = len(result.beslut)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(
        json.dumps(result.to_dict(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    tmp.replace(path)
