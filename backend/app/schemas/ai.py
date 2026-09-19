"""Pydantic models the LLM must return. Validated before anything downstream sees them."""
from typing import Literal

from pydantic import BaseModel, Field

SectionKind = Literal["supported", "synthesis", "assumption", "uncertainty"]


class TutorSection(BaseModel):
    kind: SectionKind = Field(description="supported = directly backed by cited sources; synthesis = AI explanation; assumption; uncertainty")
    heading: str = Field(max_length=80)
    text: str = Field(max_length=1200)
    source_ids: list[str] = Field(default_factory=list, description="IDs like S1, only from the provided sources")


class TutorLessonLLM(BaseModel):
    sections: list[TutorSection] = Field(min_length=1, max_length=6)
    check_question: str = Field(max_length=300)
    follow_up_question: str = Field(max_length=300)
    insufficient_evidence: bool = False


class QuizMcqOptionLLM(BaseModel):
    id: str = Field(max_length=8)
    text: str = Field(max_length=280)


class QuizQuestionLLM(BaseModel):
    """Structured question draft from the LLM. Correctness is sealed server-side."""
    format: Literal["mcq", "case_study", "short_answer", "analysis"]
    prompt: str = Field(max_length=1200)
    difficulty: int = Field(ge=1, le=3)
    concept_ids: list[str] = Field(min_length=1, max_length=3)
    skill: str = Field(default="causal_chain", max_length=40)
    options: list[QuizMcqOptionLLM] = Field(default_factory=list, max_length=4)
    correct_option_id: str | None = Field(default=None, max_length=8)
    context: str | None = Field(default=None, max_length=1500)
    expected_elements: list[str] = Field(default_factory=list, max_length=6)
    hints: list[str] = Field(default_factory=list, max_length=3)
    explanation: str = Field(max_length=800)


class QuizEvalLLM(BaseModel):
    observed: Literal["correct", "partial", "incorrect"]
    score: int = Field(ge=0, le=100)
    explanation: str = Field(max_length=800)
    strengths: list[str] = Field(default_factory=list, max_length=4)
    gaps: list[str] = Field(default_factory=list, max_length=4)
    review_concept_ids: list[str] = Field(default_factory=list, max_length=3)


class MarketStepLLM(BaseModel):
    from_: str = Field(max_length=120)
    to: str = Field(max_length=120)
    why: str = Field(max_length=300)


class MarketDriverLLM(BaseModel):
    explanation: str = Field(max_length=500)
    fact_ids: list[str] = Field(default_factory=list, max_length=4, description="Only fact_ids from <facts>")
    headline_ids: list[str] = Field(default_factory=list, max_length=4, description="Only IDs like H1 from the headlines")


class DeskViewLLM(BaseModel):
    strategy: str = Field(max_length=160, description="Short name of a trade archetype (a few words), framed hypothetically")
    rationale: str = Field(max_length=400)
    risk: str = Field(max_length=300, description="What would make this view wrong")


class MarketSectionLLM(BaseModel):
    """Desk-note style explanation of one market section. References facts by id; never restates numbers."""
    summary: str = Field(max_length=700)
    drivers: list[MarketDriverLLM] = Field(min_length=1, max_length=4)
    chain: list[MarketStepLLM] = Field(min_length=2, max_length=5)
    desk_views: list[DeskViewLLM] = Field(min_length=1, max_length=3)
    watch_next: list[str] = Field(default_factory=list, max_length=3)
    confidence: Literal["low", "medium", "high"]
    confidence_reason: str = Field(max_length=300)
    concept_ids: list[str] = Field(default_factory=list, max_length=4)


class OverviewPointLLM(BaseModel):
    section_id: Literal["macro", "rates", "fx", "commodities", "equities", "sectors", "companies", "portfolio"]
    point: str = Field(max_length=220, description="One-line claim, e.g. 'Short-dated yields led a rates sell-off'")
    explanation: str = Field(max_length=800, description="2-3 sentences: why it happened / why it matters, in plain words")
    fact_ids: list[str] = Field(default_factory=list, max_length=5, description="Evidence: fact_ids from <facts>")
    headline_ids: list[str] = Field(default_factory=list, max_length=3, description="Evidence: IDs like H3")


class OverviewLinkLLM(BaseModel):
    from_: str = Field(max_length=120)
    to: str = Field(max_length=120)
    why: str = Field(max_length=300)
    fact_ids: list[str] = Field(default_factory=list, max_length=3)


class OverviewDeskLLM(BaseModel):
    desk: str = Field(max_length=60, description="Rates | FX | Commodities | Equities | Macro")
    strategy: str = Field(max_length=160, description="Short name of a trade archetype (a few words)")
    rationale: str = Field(max_length=600)
    risk: str = Field(max_length=400)
    fact_ids: list[str] = Field(default_factory=list, max_length=3)


class MarketOverviewLLM(BaseModel):
    """Cross-market morning note. Every key point must cite facts and/or headlines as evidence."""
    headline: str = Field(max_length=200, description="The story of the day in one line")
    summary: str = Field(max_length=1400)
    key_points: list[OverviewPointLLM] = Field(min_length=3, max_length=6)
    connections: list[OverviewLinkLLM] = Field(min_length=2, max_length=5)
    desk_views: list[OverviewDeskLLM] = Field(min_length=1, max_length=3)
    watch_next: list[str] = Field(default_factory=list, max_length=4)
    confidence: Literal["low", "medium", "high"]
    confidence_reason: str = Field(max_length=300)
    concept_ids: list[str] = Field(default_factory=list, max_length=5)
