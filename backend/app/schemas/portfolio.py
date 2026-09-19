from typing import Literal

from pydantic import BaseModel

from .common import Confidence


class Contribution(BaseModel):
    symbol: str
    weight: float
    return_pct: float
    contribution_pct: float  # deterministic


class Attribution(BaseModel):
    portfolio_return_pct: float
    contributions: list[Contribution]
    sectors: dict[str, float]


class PositionNote(BaseModel):
    symbol: str
    event_id: str | None
    explanation: str
    confidence: Confidence


class PortfolioImpact(BaseModel):
    summary: str
    position_notes: list[PositionNote]
    concepts: list[str]


class PortfolioImpactResponse(BaseModel):
    attribution: Attribution  # deterministic
    narrative: PortfolioImpact | None  # AI, labelled
    narrative_status: Literal["ok", "unavailable"]
