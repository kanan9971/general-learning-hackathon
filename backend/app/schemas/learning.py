from typing import Literal

from pydantic import BaseModel, Field

from .common import Level

QuestionType = Literal[
    "explain_move", "causal_chain", "compare_explanations", "confirming_evidence",
    "contradicting_evidence", "cross_asset", "short_term_view", "priced_in",
    "client_question", "walk_me_through",
]
RubricCategory = Literal[
    "factual_accuracy", "main_catalyst", "causal_mechanism", "market_evidence",
    "cross_asset", "alternatives", "risk_awareness", "clarity",
    "calibrated_confidence", "conclusion_follows",
]


class AnalystQuestion(BaseModel):
    event_id: str
    question_type: QuestionType
    prompt: str
    difficulty: int
    word_range: tuple[int, int] = (100, 300)
    expected_elements: list[str]
    hints: list[str]


class Challenge(BaseModel):
    id: str
    question: AnalystQuestion


class SubmitResponse(BaseModel):
    answer_text: str
    parent_response_id: str | None = None


class CategoryScore(BaseModel):
    category: RubricCategory
    score: int  # 0-4
    justification: str


class Misconception(BaseModel):
    concept_id: str
    description: str
    evidence_quote: str


class Evaluation(BaseModel):
    id: str
    category_scores: list[CategoryScore]
    overall_score: int  # 0-100, computed server-side
    strengths: list[str]
    gaps: list[str]
    misconceptions: list[Misconception]
    stronger_answer: str
    follow_up_question: str
    review_concept_ids: list[str]


class LessonSection(BaseModel):
    kind: Literal["supported", "synthesis", "assumption", "uncertainty"]
    heading: str
    text: str
    source_ids: list[str]


class TeachingLesson(BaseModel):
    concept_id: str
    level: Level
    sections: list[LessonSection]
    check_question: str
    insufficient_evidence: bool = False


class ConceptUpdate(BaseModel):
    concept_id: str
    observed: Literal["correct", "partial", "incorrect"]
    mastery_before: float
    mastery_after: float
    next_review_at: str


class LessonResponse(BaseModel):
    lesson: TeachingLesson
    citations: list["SourceRefLite"]
    follow_up: str
    mastery_updates: list[ConceptUpdate]
    generated_by: Literal["llm", "fallback"] = "llm"
    retrieval: "RetrievalInfo | None" = None


class SourceRefLite(BaseModel):
    source_id: str
    title: str
    publisher: str
    url: str | None = None
    chunk_id: str | None = None
    section_path: str | None = None
    excerpt: str | None = None
    content_type: str | None = None
    published_at: str | None = None


class RetrievalInfo(BaseModel):
    chunks_considered: int
    top_similarity: float | None
    sufficient: bool


class TutorLessonRequest(BaseModel):
    concept_id: str = Field(min_length=1, max_length=80)
    level: Level = "beginner"
    misconception: str | None = Field(default=None, max_length=500)
    question: str | None = Field(default=None, max_length=500)


class KbSearchRequest(BaseModel):
    query: str = Field(min_length=3, max_length=500)
    layer: Literal["foundation", "market"] | None = "foundation"
    concept_ids: list[str] | None = None
    level: Level = "advanced"
    k: int = Field(default=5, ge=1, le=10)


class SearchHit(BaseModel):
    chunk_id: str
    document_id: str
    title: str
    section_path: str | None
    excerpt: str
    similarity: float
    score: float
    difficulty: int | None
    content_type: str | None


class Mastery(BaseModel):
    concept_id: str
    name: str
    mastery: float
    attempts: int
    next_review_at: str | None = None


class Progress(BaseModel):
    concepts: list[Mastery]
    due_reviews: list[str]
    streak_days: int
    recent_scores: list[int]


LessonResponse.model_rebuild()
