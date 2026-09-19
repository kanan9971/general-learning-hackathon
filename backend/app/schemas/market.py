"""Deterministic market facts. Numbers originate here, never from the LLM."""
from pydantic import BaseModel

from .common import Confidence, DataMode


class Fact(BaseModel):
    fact_id: str  # e.g. "US10Y.change_bp.1d"
    symbol: str
    label: str
    metric: str  # pct_change | bp_change | level
    value: float
    unit: str  # % | bp | pts | usd
    period: str  # 1d, 5d ...
    source: str  # yahoo | fred | golden
    as_of: str  # ISO timestamp


class ChainStep(BaseModel):
    from_: str
    to: str
    explanation: str


class Alternative(BaseModel):
    explanation: str
    evidence_that_would_confirm: str


class SourceRef(BaseModel):
    source_id: str
    title: str
    publisher: str
    url: str | None = None
    published_at: str | None = None
    section_path: str | None = None
    excerpt: str | None = None
    trust_level: int = 4


class MarketEvent(BaseModel):
    id: str
    title: str
    fact_ids: list[str]
    period: str
    catalyst: str
    mechanism_chain: list[ChainStep]
    positively_affected: list[str]
    negatively_affected: list[str]
    alternatives: list[Alternative]
    confidence: Confidence
    confidence_reason: str
    source_ids: list[str]
    concept_ids: list[str]


class Brief(BaseModel):
    as_of_date: str
    data_mode: DataMode
    strip: list[Fact]
    events: list[MarketEvent]
    sources: list[SourceRef]
