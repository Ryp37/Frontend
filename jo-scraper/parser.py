"""
HTML parser for individual JO decision pages.

Extracts:
- myndighet       – the authority under review
- lagrum          – cited legal statutes
- klagandens_situation – complainant's background / situation
- jo_bedomning    – JO's assessment
- utfall          – outcome classification
"""
import re
from typing import List, Optional, Tuple
from bs4 import BeautifulSoup, Tag

from models import JOBeslut
from config import MAX_SITUATION_CHARS, MAX_BEDOMNING_CHARS


# ---------------------------------------------------------------------------
# Outcome classification
# ---------------------------------------------------------------------------

# Ordered from most specific to least specific
_UTFALL_RULES: List[Tuple[str, List[str]]] = [
    ("allvarlig_kritik", [
        r"allvarlig\s+kritik",
        r"mycket\s+allvarlig",
        r"synnerligen\s+allvarlig",
    ]),
    ("atal", [
        r"\båtal\b",
        r"anmäler.*\båtal\b",
        r"väcker\s+åtal",
    ]),
    ("initiativ", [
        r"eget\s+initiativ",
        r"initiativärende",
        r"på\s+eget\s+initiativ",
    ]),
    ("inte_kritik", [
        r"inte\s+kritik",
        r"ej\s+kritik",
        r"ingen\s+kritik",
        r"inte\s+skäl\s+att\s+kritisera",
        r"avslutar\s+ärendet\s+utan\s+åtgärd",
        r"vidtar\s+ingen\s+åtgärd",
    ]),
    ("kritik", [
        r"\bkritik\b",
        r"riktar\s+kritik",
        r"kritiserar",
    ]),
]


def classify_utfall(title: str) -> str:
    """Classify the JO decision outcome from the decision title."""
    t = title.lower()
    for utfall_type, patterns in _UTFALL_RULES:
        for pattern in patterns:
            if re.search(pattern, t):
                return utfall_type
    return "okand"


# ---------------------------------------------------------------------------
# Section keywords (Swedish)
# ---------------------------------------------------------------------------

_BACKGROUND_KEYWORDS = [
    "bakgrund", "klagan", "klagomål", "anmälan", "ärendet",
    "inledning", "vad som kom fram", "omständigheter",
]
_INVESTIGATION_KEYWORDS = [
    "utredning", "remiss", "yttrande", "inhämtat",
]
_ASSESSMENT_KEYWORDS = [
    "bedömning", "jo:s bedömning", "ombudsmannens bedömning",
    "justitieombudsmannens bedömning", "min bedömning",
    "skäl för beslutet", "motivering",
]
_DECISION_KEYWORDS = [
    "beslut", "utfall", "slutsats", "sammanfattning",
]


# ---------------------------------------------------------------------------
# Metadata extraction
# ---------------------------------------------------------------------------

def _clean(text: str) -> str:
    """Normalise whitespace."""
    return re.sub(r"\s+", " ", text).strip()


def _split_lagrum(raw: str) -> List[str]:
    """Split a raw lagrum string into individual statute references."""
    # Split on newlines, semicolons, or 'och' between statute patterns
    items = re.split(r"[\n;]+|(?<=\§\s\w{2,})\s+och\s+(?=\d)", raw)
    return [_clean(i) for i in items if _clean(i)]


def _extract_from_dl(soup: BeautifulSoup) -> dict:
    """Try to extract metadata from <dt>/<dd> definition lists."""
    meta = {}
    for dt in soup.find_all("dt"):
        label = dt.get_text(separator=" ", strip=True).lower()
        dd = dt.find_next_sibling("dd")
        if not dd:
            continue
        value = _clean(dd.get_text(separator=" "))

        if any(k in label for k in ("diarienummer", "dnr", "ärendenummer")):
            meta.setdefault("diarienummer", value)
        elif any(k in label for k in ("beslutsdatum", "datum", "beslutad den")):
            meta.setdefault("beslutsdatum", value)
        elif any(k in label for k in ("myndighet", "anmäld", "granskad", "anmält organ")):
            meta.setdefault("myndighet", value)
        elif "lagrum" in label:
            meta.setdefault("lagrum", _split_lagrum(dd.get_text("\n", strip=True)))
        elif any(k in label for k in ("ombudsman", "handläggare", "föredragande")):
            meta.setdefault("ombudsman", value)
        elif any(k in label for k in ("ämne", "ämnesområde", "kategori", "nyckelord")):
            existing = meta.get("amnesomrade", [])
            meta["amnesomrade"] = existing + [value]

    return meta


def _extract_from_table(soup: BeautifulSoup) -> dict:
    """Try to extract metadata from <table> rows."""
    meta = {}
    for row in soup.find_all("tr"):
        cells = row.find_all(["th", "td"])
        if len(cells) < 2:
            continue
        label = cells[0].get_text(strip=True).lower()
        value = _clean(cells[1].get_text(separator=" "))

        if any(k in label for k in ("diarienummer", "dnr")):
            meta.setdefault("diarienummer", value)
        elif any(k in label for k in ("datum", "beslutsdatum")):
            meta.setdefault("beslutsdatum", value)
        elif any(k in label for k in ("myndighet", "anmäld")):
            meta.setdefault("myndighet", value)
        elif "lagrum" in label:
            meta.setdefault("lagrum", _split_lagrum(cells[1].get_text("\n", strip=True)))

    return meta


def _extract_from_data_attrs(soup: BeautifulSoup) -> dict:
    """Try to extract metadata from data-* attributes."""
    meta = {}
    for elem in soup.find_all(attrs={"data-field": True}):
        field = elem["data-field"].lower()
        value = _clean(elem.get_text(separator=" "))
        if "diarienummer" in field:
            meta.setdefault("diarienummer", value)
        elif "myndighet" in field:
            meta.setdefault("myndighet", value)
        elif "datum" in field:
            meta.setdefault("beslutsdatum", value)
        elif "lagrum" in field:
            meta.setdefault("lagrum", _split_lagrum(value))
    return meta


def _extract_from_classes(soup: BeautifulSoup) -> dict:
    """Try to extract metadata from elements with revealing CSS class names."""
    meta = {}
    CLASS_MAP = {
        "diarienummer": ["diarienummer", "case-number", "dnr", "arendenummer"],
        "myndighet": ["myndighet", "authority", "anmald-myndighet", "anmald_myndighet"],
        "beslutsdatum": ["beslutsdatum", "decision-date", "datum", "beslut-datum"],
    }
    for field_name, classes in CLASS_MAP.items():
        if field_name in meta:
            continue
        for cls in classes:
            elem = soup.find(
                class_=lambda c, _cls=cls: (
                    c is not None
                    and _cls in (c if isinstance(c, str) else " ".join(c)).lower()
                )
            )
            if elem:
                meta[field_name] = _clean(elem.get_text(separator=" "))
                break
    return meta


def _extract_diarienummer_fallback(soup: BeautifulSoup) -> Optional[str]:
    """Last-resort: find diarienummer via regex in page text."""
    text = soup.get_text()
    match = re.search(r"\b(\d{3,6}-\d{4})\b", text)
    return match.group(1) if match else None


def extract_metadata(soup: BeautifulSoup) -> dict:
    """Merge metadata from all extraction strategies."""
    meta: dict = {}

    for strategy in (
        _extract_from_dl,
        _extract_from_table,
        _extract_from_data_attrs,
        _extract_from_classes,
    ):
        partial = strategy(soup)
        for key, value in partial.items():
            if key not in meta or not meta[key]:
                meta[key] = value

    if not meta.get("diarienummer"):
        fallback = _extract_diarienummer_fallback(soup)
        if fallback:
            meta["diarienummer"] = fallback

    return meta


# ---------------------------------------------------------------------------
# Content section extraction
# ---------------------------------------------------------------------------

_HEADING_TAGS = ["h2", "h3", "h4", "h5"]


def _find_section_by_heading(soup: BeautifulSoup, keywords: List[str]) -> str:
    """
    Locate a content section by scanning headings for keyword matches and
    collecting sibling text until the next heading of the same or higher level.
    """
    for tag in _HEADING_TAGS:
        for heading in soup.find_all(tag):
            heading_text = heading.get_text(strip=True).lower()
            if not any(kw in heading_text for kw in keywords):
                continue

            parts: List[str] = []
            for sibling in heading.find_next_siblings():
                if sibling.name in _HEADING_TAGS:
                    break
                text = sibling.get_text(separator=" ", strip=True) if isinstance(sibling, Tag) else str(sibling).strip()
                if text:
                    parts.append(text)
            if parts:
                return "\n\n".join(parts)

    return ""


def _extract_main_content(soup: BeautifulSoup) -> str:
    """
    Fallback: return all text from the main article/content area.
    """
    for selector in ["article", "main", ".entry-content", ".post-content",
                      ".beslut-content", ".page-content", "#content"]:
        elem = soup.select_one(selector)
        if elem:
            return elem.get_text(separator="\n", strip=True)
    return soup.get_text(separator="\n", strip=True)


def _split_background_assessment(full_text: str) -> Tuple[str, str]:
    """
    When no structured sections are found, attempt a regex-based split between
    background and JO's assessment in the full text.
    """
    split_pattern = re.compile(
        r"\n(?=(?:Bedömning|JO:s\s+bedömning|Ombudsmannens\s+bedömning"
        r"|Min\s+bedömning|Skäl\s+för\s+beslutet))",
        re.IGNORECASE,
    )
    parts = split_pattern.split(full_text, maxsplit=1)
    if len(parts) == 2:
        return parts[0].strip(), parts[1].strip()
    return full_text.strip(), ""


# ---------------------------------------------------------------------------
# PDF URL extraction
# ---------------------------------------------------------------------------

def extract_pdf_url(soup: BeautifulSoup, base_url: str) -> Optional[str]:
    link = soup.find("a", href=re.compile(r"\.pdf$", re.IGNORECASE))
    if link:
        href = link["href"]
        if href.startswith("http"):
            return href
        return base_url.rstrip("/") + "/" + href.lstrip("/")
    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def parse_beslut_page(html: str, url: str, title: str, base_url: str = "https://www.jo.se") -> JOBeslut:
    """
    Parse a complete JO decision page and return a structured JOBeslut.

    Parameters
    ----------
    html     : Raw HTML of the decision page.
    url      : Canonical URL of the page.
    title    : Decision title (used for utfall classification).
    base_url : Site root for resolving relative URLs.

    Returns
    -------
    JOBeslut with all fields populated to the best extent possible.
    """
    soup = BeautifulSoup(html, "html.parser")

    # Strip noise elements
    for tag in soup.find_all(["nav", "footer", "header", "script", "style", "noscript"]):
        tag.decompose()

    meta = extract_metadata(soup)

    # Extract content sections
    klagandens_situation = _find_section_by_heading(soup, _BACKGROUND_KEYWORDS)
    jo_bedomning = _find_section_by_heading(soup, _ASSESSMENT_KEYWORDS)

    # Fallback: split main content by common assessment heading
    if not klagandens_situation and not jo_bedomning:
        full = _extract_main_content(soup)
        klagandens_situation, jo_bedomning = _split_background_assessment(full)

    return JOBeslut(
        diarienummer=meta.get("diarienummer", ""),
        beslutsdatum=meta.get("beslutsdatum", ""),
        titel=title,
        url=url,
        myndighet=meta.get("myndighet", ""),
        lagrum=meta.get("lagrum", []),
        klagandens_situation=klagandens_situation[:MAX_SITUATION_CHARS],
        jo_bedomning=jo_bedomning[:MAX_BEDOMNING_CHARS],
        utfall=classify_utfall(title),
        pdf_url=extract_pdf_url(soup, base_url),
        ombudsman=meta.get("ombudsman", ""),
        amnesomrade=meta.get("amnesomrade", []),
    )
