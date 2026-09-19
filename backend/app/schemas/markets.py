"""Markets feed: deterministic moves + RSS headlines + static teaching guide per section.
Numbers (level, change) originate in `app/market`, never in the LLM."""
from typing import Literal

from pydantic import BaseModel, Field

from .common import Confidence, DataMode, Level
from .portfolio import Attribution

SectionId = Literal["macro", "rates", "fx", "commodities", "equities", "sectors", "companies", "portfolio"]
SectionGroup = Literal["macro", "micro", "company", "portfolio"]
ProviderStatus = Literal["ok", "partial", "failed", "skipped"]


class Move(BaseModel):
    """One instrument's latest level and change. `fact_id` is what LLM output may reference."""
    fact_id: str  # e.g. "^TNX.chg.1d", "UST10Y.chg.1d"
    symbol: str
    label: str
    section: SectionId
    asset_class: str  # equity_index | sector_etf | stock | yield | spread | fx | commodity | vol
    level: float
    level_unit: str  # "%" for yields, "pts" for indices, "usd" for prices, "bp" for spreads, "" for fx
    change: float
    change_unit: Literal["%", "bp"]
    change_5d: float | None = None
    source: Literal["yahoo", "treasury", "golden"]
    as_of: str  # ISO date/time of the last observation
    unusual: bool = False  # |change| well above a typical day (see market/ranking.py)
    score: float = 0.0


class Headline(BaseModel):
    id: str  # stable hash of the URL
    title: str
    summary: str = ""
    url: str
    publisher: str  # Federal Reserve | WSJ | Yahoo Finance
    published_at: str | None = None
    sections: list[SectionId] = Field(default_factory=list)
    tickers: list[str] = Field(default_factory=list)
    concept_ids: list[str] = Field(default_factory=list)
    is_official: bool = False  # Fed releases


class GuideDriver(BaseModel):
    name: str
    why: str


class GuideStep(BaseModel):
    from_: str
    to: str
    why: str


class GuideStrategy(BaseModel):
    """An educational trade archetype: how desks express a view. Never a recommendation."""
    name: str
    idea: str
    how_expressed: str
    what_breaks_it: str
    concept_ids: list[str] = Field(default_factory=list)


class SectionGuide(BaseModel):
    id: SectionId
    group: SectionGroup
    title: str
    tagline: str
    desk: str
    how_it_works: list[str]
    key_drivers: list[GuideDriver]
    transmission: list[GuideStep]
    strategies: list[GuideStrategy]
    watch: list[str]
    glossary: dict[str, str] = Field(default_factory=dict)
    concept_ids: list[str]


class Primer(BaseModel):
    title: str
    intro: str
    steps: list[GuideStep]


class MarketsGuide(BaseModel):
    primer: Primer
    sections: list[SectionGuide]


class MarketSection(BaseModel):
    id: SectionId
    group: SectionGroup
    title: str
    tagline: str
    pinned: bool  # the learner said they're interested in it
    moves: list[Move]
    headlines: list[Headline]
    guide: SectionGuide
    attribution: Attribution | None = None  # portfolio section only (deterministic)
    note: str | None = None  # e.g. "Prices unavailable right now"


class ProvidersStatus(BaseModel):
    prices: ProviderStatus
    treasury: ProviderStatus
    fed_news: ProviderStatus
    wsj_news: ProviderStatus
    ticker_news: ProviderStatus


class InterestOption(BaseModel):
    id: SectionId
    group: SectionGroup
    title: str
    tagline: str


class MarketsFeed(BaseModel):
    as_of: str | None  # latest observation date across moves
    data_mode: DataMode
    generated_at: str
    providers: ProvidersStatus
    primer: Primer
    top_moves: list[Move]
    sections: list[MarketSection]
    interest_options: list[InterestOption]
    portfolio_source: str  # "demo" until a broker is connected


class ExplainSectionRequest(BaseModel):
    level: Level = "beginner"
    watch: list[str] = Field(default_factory=list, max_length=10)


class ExplainDriver(BaseModel):
    explanation: str
    fact_ids: list[str] = Field(default_factory=list)
    headline_ids: list[str] = Field(default_factory=list)


class DeskView(BaseModel):
    strategy: str
    rationale: str
    risk: str


class SectionExplanation(BaseModel):
    summary: str
    drivers: list[ExplainDriver]
    chain: list[GuideStep]
    desk_views: list[DeskView]
    watch_next: list[str]
    confidence: Confidence
    confidence_reason: str
    concept_ids: list[str]


class ExplainSectionResponse(BaseModel):
    section_id: SectionId
    as_of: str | None
    data_mode: DataMode
    explanation: SectionExplanation
    moves: list[Move]  # the facts the explanation was allowed to reference
    headlines: list[Headline]
    generated_by: Literal["llm", "fallback"]


class Evidence(BaseModel):
    fact_ids: list[str] = Field(default_factory=list)
    headline_ids: list[str] = Field(default_factory=list)


class OverviewPoint(BaseModel):
    section_id: SectionId
    point: str
    explanation: str
    evidence: Evidence
    supported: bool  # False when none of the cited evidence exists -> UI labels it as unsupported


class OverviewLink(BaseModel):
    from_: str
    to: str
    why: str
    fact_ids: list[str] = Field(default_factory=list)


class OverviewDeskView(BaseModel):
    desk: str
    strategy: str
    rationale: str
    risk: str
    fact_ids: list[str] = Field(default_factory=list)


class MarketOverview(BaseModel):
    headline: str
    summary: str
    key_points: list[OverviewPoint]
    connections: list[OverviewLink]
    desk_views: list[OverviewDeskView]
    watch_next: list[str]
    confidence: Confidence
    confidence_reason: str
    concept_ids: list[str]


class OverviewRequest(BaseModel):
    level: Level = "beginner"
    interests: list[SectionId] = Field(default_factory=list)
    watch: list[str] = Field(default_factory=list, max_length=10)


class OverviewResponse(BaseModel):
    as_of: str | None
    data_mode: DataMode
    overview: MarketOverview
    moves: list[Move]  # every fact the overview may cite (render numbers from here)
    headlines: list[Headline]  # every headline it may cite
    generated_by: Literal["llm", "fallback"]
    generated_at: str
