"""
Data models for JO decisions.
"""
from dataclasses import dataclass, field, asdict
from typing import List, Optional


@dataclass
class JOBeslut:
    """Represents a single JO decision."""

    # Identifiers
    diarienummer: str = ""
    beslutsdatum: str = ""
    titel: str = ""
    url: str = ""

    # Core extraction targets
    myndighet: str = ""          # Which authority was reviewed
    lagrum: List[str] = field(default_factory=list)  # Legal statutes cited
    klagandens_situation: str = ""  # Background / complainant's situation
    jo_bedomning: str = ""       # JO's assessment text

    # Outcome classification
    utfall: str = ""             # kritik | allvarlig_kritik | inte_kritik | initiativ | atal | okand

    # Optional extras
    pdf_url: Optional[str] = None
    ombudsman: str = ""          # Which ombudsman handled the case
    amnesomrade: List[str] = field(default_factory=list)  # Subject area tags

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ScraperResult:
    """Aggregated scraper output."""
    beslut: List[JOBeslut] = field(default_factory=list)
    scraped_at: str = ""
    total_beslut: int = 0
    errors: List[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "metadata": {
                "scraped_at": self.scraped_at,
                "total_beslut": self.total_beslut,
                "errors": len(self.errors),
            },
            "beslut": [b.to_dict() for b in self.beslut],
            "_errors": self.errors,
        }
