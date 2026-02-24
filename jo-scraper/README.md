# JO-scraper

Scraper mot [jo.se](https://www.jo.se) som extraherar JO-beslut som träningsdata för ett system som hjälper vanliga människor navigera svenska myndigheter.

## Vad extraheras

Per beslut extraheras:

| Fält | Beskrivning |
|------|-------------|
| `diarienummer` | Ärendets diarienummer, t.ex. `6413-2024` |
| `beslutsdatum` | Datum då beslutet fattades |
| `titel` | Beslutets rubrik |
| `myndighet` | Anmäld/granskad myndighet, t.ex. `Polismyndigheten` |
| `lagrum` | Lista med tillämpade lagrum, t.ex. `["8 § FL", "2 kap. 6 § RF"]` |
| `klagandens_situation` | Bakgrund och klagandens situation (från "Bakgrund"-sektionen) |
| `jo_bedomning` | JO:s bedömning (från "Bedömning"-sektionen) |
| `utfall` | Klassificerat utfall (se nedan) |
| `pdf_url` | Länk till PDF-versionen av beslutet |
| `ombudsman` | Ansvarig ombudsman |
| `amnesomrade` | Ämnesområdestagg(ar) |

### Utfallsklassificering

| Värde | Betydelse |
|-------|-----------|
| `kritik` | JO riktar kritik |
| `allvarlig_kritik` | JO riktar allvarlig kritik |
| `inte_kritik` | JO riktar inte kritik |
| `initiativ` | Initiativärende |
| `atal` | JO väcker åtal |
| `okand` | Okänt/övrigt |

## Output-format

```json
{
  "metadata": {
    "scraped_at": "2025-01-15T10:30:00Z",
    "total_beslut": 247,
    "errors": 2
  },
  "beslut": [
    {
      "diarienummer": "6413-2024",
      "beslutsdatum": "2025-08-27",
      "titel": "Kritik mot Polismyndigheten för bristfällig handläggning",
      "url": "https://www.jo.se/besluten/kritik-mot-polismyndigheten-...",
      "myndighet": "Polismyndigheten",
      "lagrum": ["23 § FL", "7 § FL"],
      "klagandens_situation": "Klaganden anmälde att Polismyndigheten...",
      "jo_bedomning": "JO konstaterar att myndigheten...",
      "utfall": "kritik",
      "pdf_url": "https://www.jo.se/app/uploads/resolve_pdfs/...",
      "ombudsman": "",
      "amnesomrade": []
    }
  ]
}
```

## Installation

```bash
# Skapa virtuell miljö
python -m venv .venv
source .venv/bin/activate   # Linux/Mac
# .venv\Scripts\activate    # Windows

# Installera beroenden
pip install -r requirements.txt

# Installera Playwright-browsers
playwright install chromium
```

## Användning

```bash
# Scrapa alla tillgängliga beslut
python scraper.py

# Max 50 beslut (bra för test)
python scraper.py --max 50

# Starta om från scratch (ignorera checkpoint)
python scraper.py --no-resume

# Anpassad output-fil
python scraper.py --output mitt_dataset.json

# Verbose-loggning
python scraper.py --max 50 -v
```

### Miljövariabler

| Variabel | Default | Beskrivning |
|----------|---------|-------------|
| `JO_MAX_DECISIONS` | `0` (obegränsat) | Max antal beslut |
| `JO_OUTPUT_DIR` | `output/` | Output-katalog |
| `JO_MIN_DELAY` | `2.0` | Min sekunder mellan requests |
| `JO_MAX_DELAY` | `5.0` | Max sekunder mellan requests |
| `JO_HEADLESS` | `true` | Headless browser |

## Arkitektur

```
scraper.py   – CLI entry point, argument-parsning, sammanfattning
crawler.py   – Playwright-crawler (listing + per-sida scraping, checkpoint)
parser.py    – HTML-parsning med flera fallback-strategier
models.py    – Dataklasser (JOBeslut, ScraperResult)
config.py    – Konfiguration och konstanter
```

### Parsnings-strategier

Parser:n försöker extrahera metadata i denna prioritetsordning:
1. `<dt>/<dd>` definition-listor
2. `<table>` rader
3. `data-*` attribut
4. CSS-klasser med semantiska namn
5. Regex-fallback för diarienummer

Sektionsinnehåll (klagandens situation, bedömning) hittas via rubrik-skanninig (`h2–h5`) följt av insamling av efterföljande paragraf-text tills nästa rubrik.

## Etik och robots.txt

- Scrapern respekterar rate limiting (2–5 sekunder per request)
- Kör inte parallellt mot servern
- Används enbart för laglig datainsamling för utbildningsändamål
- Kontrollera jo.se/robots.txt innan körning i produktion
