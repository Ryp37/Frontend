"""
Configuration for JO-scraper.
"""
import os

BASE_URL = "https://www.jo.se"

# Listing/search page (Swedish)
LISTING_URL = f"{BASE_URL}/sv/jo-beslut/sokresultat/"

# Individual decision base path
BESLUT_BASE_PATH = "/besluten/"

# Output
OUTPUT_DIR = os.getenv("JO_OUTPUT_DIR", "output")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "jo_beslut.json")
CHECKPOINT_FILE = os.path.join(OUTPUT_DIR, "checkpoint.json")

# Rate limiting (seconds between page requests)
MIN_DELAY = float(os.getenv("JO_MIN_DELAY", "2.0"))
MAX_DELAY = float(os.getenv("JO_MAX_DELAY", "5.0"))

# Playwright
HEADLESS = os.getenv("JO_HEADLESS", "true").lower() == "true"
VIEWPORT = {"width": 1280, "height": 900}
LOCALE = "sv-SE"
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

# Scraping limits (0 = no limit)
MAX_DECISIONS = int(os.getenv("JO_MAX_DECISIONS", "0"))

# Timeouts (ms)
PAGE_LOAD_TIMEOUT = 45_000
LOAD_MORE_TIMEOUT = 15_000
SELECTOR_TIMEOUT = 8_000

# Text truncation limits (characters)
MAX_SITUATION_CHARS = 4_000
MAX_BEDOMNING_CHARS = 4_000
