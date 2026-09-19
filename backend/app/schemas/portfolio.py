from typing import Literal

from pydantic import BaseModel, Field

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


LevelName = Literal["beginner", "intermediate", "advanced"]
PaperSide = Literal["buy", "sell", "short", "cover"]
TicketKind = Literal["market", "limit", "stop"]
InstrumentKind = Literal["equity", "option"]
FillStatus = Literal["filled", "working", "cancelled"]
OptionRight = Literal["call", "put"]


class PaperLot(BaseModel):
    id: str
    kind: InstrumentKind
    symbol: str
    quantity: float
    cost_basis: float
    market_price: float | None = None
    market_value: float | None = None
    unrealized_pct: float | None = None
    option_right: OptionRight | None = None
    option_strike: float | None = None
    option_expiry: str | None = None


class PaperFill(BaseModel):
    id: str
    symbol: str
    side: PaperSide
    quantity: float
    fill_price: float | None = None
    notional: float | None = None
    ticket_kind: TicketKind
    limit_price: float | None = None
    status: FillStatus
    instrument_kind: InstrumentKind = "equity"
    option_right: OptionRight | None = None
    option_strike: float | None = None
    option_expiry: str | None = None
    fact_id: str | None = None
    as_of_date: str | None = None
    filled_at: str
    analysis_ready: bool = False


class PaperWhitelistItem(BaseModel):
    symbol: str
    name: str
    sector: str


class ListedOption(BaseModel):
    underlying: str
    right: OptionRight
    strike: float
    expiry: str
    mark: float


class PaperBookResponse(BaseModel):
    level: LevelName
    cash_usd: float
    starting_cash: float
    equity_value: float
    nav: float
    data_mode: str
    as_of: str | None
    source: Literal["paper"]
    attribution: Attribution | None = None
    lots: list[PaperLot]
    fills: list[PaperFill]
    whitelist: list[PaperWhitelistItem]
    allowed_sides: list[PaperSide]
    allowed_ticket_kinds: list[TicketKind]
    options_allowed: bool
    custom_tickers_allowed: bool = False
    option_underlyings: list[str]
    listed_options: list[ListedOption] = []
    analysis_available: bool = False
    analysis_unlocks_on: str | None = None
    educational: str = "Paper classroom. Simulated fills only. Not a live brokerage."


class PaperTicketRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=16)
    side: PaperSide
    quantity: float = Field(gt=0, le=1_000_000)
    ticket_kind: TicketKind = "market"
    limit_price: float | None = None
    instrument_kind: InstrumentKind = "equity"
    option_right: OptionRight | None = None
    option_strike: float | None = None
    option_expiry: str | None = None
    level: LevelName | None = None  # used only when creating the book


class PaperTicketResponse(BaseModel):
    fill: PaperFill
    book: PaperBookResponse


class PaperFillsResponse(BaseModel):
    fills: list[PaperFill]


class PaperAnalysisPoint(BaseModel):
    symbol: str
    point: str
    explanation: str
    fact_ids: list[str] = []
    headline_ids: list[str] = []
    supported: bool = True


class PaperAnalysis(BaseModel):
    headline: str
    summary: str
    points: list[PaperAnalysisPoint]
    confidence: Literal["low", "medium", "high"]
    confidence_reason: str
    concept_ids: list[str] = []
    status: Literal["ok", "fallback"] = "ok"


class PaperAnalysisEvidence(BaseModel):
    fact_id: str
    symbol: str
    label: str
    change: float
    change_unit: str
    return_since_fill: float | None = None
    fill_price: float | None = None
    last: float | None = None


class PaperAnalysisHeadline(BaseModel):
    id: str
    title: str
    url: str
    publisher: str


class PaperAnalysisResponse(BaseModel):
    as_of: str | None
    data_mode: str
    unlocks_on: str | None = None
    eligible_fill_ids: list[str]
    facts: list[PaperAnalysisEvidence]
    headlines: list[PaperAnalysisHeadline]
    analysis: PaperAnalysis
    prompt_version: str
