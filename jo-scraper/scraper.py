#!/usr/bin/env python3
"""
JO-scraper – extraherar JO-beslut från jo.se som träningsdata.

Extraherar per beslut:
  - myndighet           : Anmäld myndighet/organ
  - lagrum              : Tillämpade lagrum/paragrafer
  - klagandens_situation: Bakgrund och klagandens situation
  - jo_bedomning        : JO:s bedömning
  - utfall              : Utfallsklassificering (kritik/allvarlig_kritik/inte_kritik/…)

Användning:
  python scraper.py                        # Scrapa alla beslut
  python scraper.py --max 50              # Max 50 beslut
  python scraper.py --max 50 --no-resume  # Börja om från scratch
  python scraper.py --output data.json    # Eget filnamn

Miljövariabler:
  JO_MAX_DECISIONS  : Max antal beslut (0 = obegränsat)
  JO_OUTPUT_DIR     : Katalog för output (default: output/)
  JO_MIN_DELAY      : Minsta fördröjning i sekunder (default: 2.0)
  JO_MAX_DELAY      : Maximal fördröjning i sekunder (default: 5.0)
  JO_HEADLESS       : Kör browser headless (default: true)
"""
import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

import config
from crawler import run_scraper


def _setup_logging(verbose: bool):
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(Path(config.OUTPUT_DIR) / "scraper.log", encoding="utf-8"),
        ],
    )


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scrapa JO-beslut från jo.se",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--max",
        type=int,
        default=config.MAX_DECISIONS,
        metavar="N",
        help="Max antal beslut att scrapa (0 = obegränsat, default: %(default)s)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=config.OUTPUT_FILE,
        metavar="FILE",
        help="Output JSON-fil (default: %(default)s)",
    )
    parser.add_argument(
        "--no-resume",
        action="store_true",
        help="Börja om från scratch (ignorera checkpoint)",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Debug-loggning",
    )
    return parser.parse_args()


def _print_summary(result_path: str):
    """Print a human-readable summary of the scraped output."""
    try:
        data = json.loads(Path(result_path).read_text(encoding="utf-8"))
        beslut_list = data.get("beslut", [])
        meta = data.get("metadata", {})

        print("\n" + "=" * 60)
        print("  JO-SCRAPER – SAMMANFATTNING")
        print("=" * 60)
        print(f"  Totalt beslut scraped : {meta.get('total_beslut', len(beslut_list))}")
        print(f"  Fel                  : {meta.get('errors', 0)}")
        print(f"  Scrapad              : {meta.get('scraped_at', '–')}")
        print(f"  Output               : {result_path}")
        print()

        # Utfall distribution
        from collections import Counter
        utfall_count = Counter(b.get("utfall", "okand") for b in beslut_list)
        print("  Utfallsfördelning:")
        for utfall, count in sorted(utfall_count.items(), key=lambda x: -x[1]):
            bar = "█" * min(count, 30)
            print(f"    {utfall:<20} {count:>4}  {bar}")

        print()

        # Top myndigheter
        myndigheter = Counter(
            b.get("myndighet", "").strip()
            for b in beslut_list
            if b.get("myndighet", "").strip()
        )
        print("  Topp 10 myndigheter:")
        for myndighet, count in myndigheter.most_common(10):
            print(f"    {myndighet:<40} {count:>4}")

        print()

        # Sample decision
        if beslut_list:
            sample = beslut_list[0]
            print("  Exempelbeslut (första):")
            print(f"    Titel      : {sample.get('titel', '')[:70]}")
            print(f"    Diarienr   : {sample.get('diarienummer', '')}")
            print(f"    Datum      : {sample.get('beslutsdatum', '')}")
            print(f"    Myndighet  : {sample.get('myndighet', '')}")
            print(f"    Utfall     : {sample.get('utfall', '')}")
            lagrum = sample.get("lagrum", [])
            print(f"    Lagrum     : {'; '.join(lagrum[:3])}")
            situation = sample.get("klagandens_situation", "")
            print(f"    Situation  : {situation[:120]}…" if len(situation) > 120 else f"    Situation  : {situation}")

        print("=" * 60 + "\n")

    except Exception as exc:
        print(f"[Kunde inte visa sammanfattning: {exc}]")


async def main():
    args = _parse_args()

    # Ensure output dir exists before setting up file logger
    Path(config.OUTPUT_DIR).mkdir(parents=True, exist_ok=True)

    _setup_logging(args.verbose)
    logger = logging.getLogger("scraper.main")

    logger.info("=" * 50)
    logger.info("JO-SCRAPER startar")
    logger.info("Max beslut : %s", args.max or "obegränsat")
    logger.info("Output     : %s", args.output)
    logger.info("Resume     : %s", not args.no_resume)
    logger.info("=" * 50)

    result = await run_scraper(
        max_decisions=args.max,
        output_file=args.output,
        resume=not args.no_resume,
    )

    _print_summary(args.output)

    return 0 if not result.errors else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
