"""Markets feed: deterministic moves + RSS headlines + static teaching guide per section.
Numbers (level, change) originate in `app/market`, never in the LLM."""
from typing import Literal

from pydantic import BaseModel, Field

from .common import Confidence, DataMode, Level
from .portfolio import Attribution

SectionId = Literal[
    "macro", "rates", "fx", "commodities", "equities", "sectors", "companies", "portfolio",
    "desk", "valuation", "risk",
]
SectionGroup = Literal["macro", "micro", "company", "portfolio", "foundations"]
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


class GuideRule(BaseModel):
    """A rule of thumb: the intuition a trader carries, and when it breaks."""
    when: str
    then: str
    why: str
    exception: str


class Relationship(BaseModel):
    """Cross-asset rule: when `cause` moves in `cause_dir`, `effect` usually moves in `effect_dir`."""
    cause: str  # symbol (see market/universe.py)
    cause_dir: Literal["up", "down"]
    effect: str
    effect_dir: Literal["up", "down"]
    why: str
    exception: str
    concept_ids: list[str] = Field(default_factory=list)


class ScenarioEffect(BaseModel):
    label: str
    dir: Literal["up", "down", "flat"]
    why: str
    symbol: str | None = None  # lets the Lab show how the same asset really moved today


class Scenario(BaseModel):
    """A what-if: change one thing (a Fed decision, an oil shock...) and predict the ripple."""
    id: str
    section_id: SectionId
    title: str
    premise: str
    shock: str
    effects: list[ScenarioEffect]
    chain: list[GuideStep]
    twist: str  # what would make the usual outcome NOT happen
    concept_ids: list[str]
    level: int = 1  # 1 beginner .. 3 advanced


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
    mental_model: str = ""
    rules: list[GuideRule] = Field(default_factory=list)
    mistakes: list[str] = Field(default_factory=list)
    interview: list[str] = Field(default_factory=list)


class Primer(BaseModel):
    title: str
    intro: str
    steps: list[GuideStep]


class MarketsGuide(BaseModel):
    primer: Primer
    sections: list[SectionGuide]
    relationships: list[Relationship] = Field(default_factory=list)
    scenarios: list[Scenario] = Field(default_factory=list)


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


# ---------- Market Lab: questions built from today's data, answers checked server-side ----------
LabKind = Literal["predict", "driver", "chain", "explain", "scenario"]


class LabOption(BaseModel):
    id: str
    text: str


class LabPart(BaseModel):
    id: str
    label: str


class LabQuestion(BaseModel):
    id: str
    kind: LabKind
    section_id: SectionId
    title: str | None = None  # scenarios: "The Fed cuts instead of holding"
    prompt: str
    context: str | None = None
    facts: list[Move] = Field(default_factory=list)  # evidence shown WITH the question
    options: list[LabOption] = Field(default_factory=list)  # predict / driver
    items: list[LabOption] = Field(default_factory=list)  # chain: shuffled steps to put in order
    parts: list[LabPart] = Field(default_factory=list)  # scenario: each asset to call (options apply to every part)
    hint: str | None = None
    word_range: tuple[int, int] | None = None
    concept_ids: list[str] = Field(default_factory=list)
    difficulty: int = 1
    surprise: bool = False  # today broke the usual pattern (advanced learners get these first)


class LabRequest(BaseModel):
    level: Level = "beginner"
    kinds: list[LabKind] | None = None  # e.g. ["scenario"] for a what-if-only set
    section: SectionId | None = None
    interests: list[SectionId] = Field(default_factory=list)
    watch: list[str] = Field(default_factory=list, max_length=10)
    count: int = Field(default=6, ge=1, le=10)


class LabSet(BaseModel):
    as_of: str | None
    data_mode: DataMode
    questions: list[LabQuestion]


class LabAnswerRequest(BaseModel):
    question_id: str
    answer: str | list[str] | dict[str, str]  # option id, ordered item ids, {part id: option id}, or free text
    level: Level = "beginner"
    section: SectionId | None = None
    watch: list[str] = Field(default_factory=list, max_length=10)


class LabPartResult(BaseModel):
    id: str
    label: str
    expected: Literal["up", "down", "flat"]
    picked: str | None = None
    correct: bool
    why: str
    fact_id: str | None = None  # today's real move for this asset, if we have one


class LabReveal(BaseModel):
    facts: list[Move] = Field(default_factory=list)  # what actually happened
    facts_note: str | None = None  # how to read `facts` (e.g. "today's real moves, a different event")
    parts: list[LabPartResult] = Field(default_factory=list)  # scenario: per-asset results
    chain: list[GuideStep] = Field(default_factory=list)  # scenario: the causal chain, for the diagram
    shock: str | None = None
    textbook: str | None = None  # the usual rule, in words
    followed: bool | None = None  # did today follow the textbook? None = not applicable
    exception: str | None = None  # when the rule breaks
    correct_order: list[str] = Field(default_factory=list)
    model_answer: str | None = None


class LabMastery(BaseModel):
    concept_id: str
    mastery_before: float
    mastery_after: float


class LabFeedback(BaseModel):
    question_id: str
    correct: bool
    observed: Literal["correct", "partial", "incorrect"]
    score: int
    explanation: str
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    reveal: LabReveal
    mastery: list[LabMastery] = Field(default_factory=list)
    graded_by: Literal["rule", "llm", "fallback"]
    concept_ids: list[str] = Field(default_factory=list)
