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
