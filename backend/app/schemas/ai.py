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
