"""Public quiz API contracts. Private grading payloads stay server-side."""
from typing import Any, Literal

from pydantic import BaseModel, Field

from .common import Level

QuizFormat = Literal["mcq", "case_study", "short_answer", "analysis"]
Observed = Literal["correct", "partial", "incorrect"]
SessionStatus = Literal["active", "ended"]
QuestionStatus = Literal["ready", "current", "answered", "skipped"]

FORMATS: list[QuizFormat] = ["mcq", "case_study", "short_answer", "analysis"]
FORMAT_LABELS: dict[QuizFormat, str] = {
    "mcq": "Multiple choice",
    "case_study": "Case study",
    "short_answer": "Short answer",
    "analysis": "Analysis",
}


class TopicOption(BaseModel):
    id: str
    name: str
    asset_class: str | None = None
    level: Level = "beginner"
    summary: str | None = None


class QuizPreferences(BaseModel):
    preferred_formats: list[QuizFormat] = Field(default_factory=list)
    preferred_concept_ids: list[str] = Field(default_factory=list)
    custom_topics: list[str] = Field(default_factory=list)
    level: Level = "beginner"


class QuizPreferencesResponse(BaseModel):
    preferences: QuizPreferences
    available_formats: list[dict[str, str]]
    available_topics: list[TopicOption]


class UpdatePreferencesRequest(BaseModel):
    preferred_formats: list[QuizFormat] | None = None
    preferred_concept_ids: list[str] | None = None
    custom_topics: list[str] | None = Field(default=None, max_length=20)
    level: Level | None = None


class McqOptionPublic(BaseModel):
    id: str
    text: str


class QuizQuestionPublic(BaseModel):
    id: str
    sequence: int
    format: QuizFormat
    difficulty: int
    concept_ids: list[str]
    custom_topic: str | None = None
    prompt: str
    # Format-specific public fields (options without correctness, case context, etc.)
    options: list[McqOptionPublic] | None = None
    context: str | None = None
    word_range: tuple[int, int] | None = None
    hints: list[str] = Field(default_factory=list)


class StartSessionRequest(BaseModel):
    formats: list[QuizFormat] = Field(min_length=1, max_length=4)
    concept_ids: list[str] = Field(default_factory=list)
    custom_topics: list[str] = Field(default_factory=list, max_length=10)
    level: Level | None = None


class QuizSession(BaseModel):
    id: str
    status: SessionStatus
    formats: list[QuizFormat]
    concept_ids: list[str]
    custom_topics: list[str]
    level: Level
    answered_count: int
    correct_count: int
    ready_count: int = 0


class StartSessionResponse(BaseModel):
    session: QuizSession
    question: QuizQuestionPublic
    queue_depth: int


class SubmitAnswerRequest(BaseModel):
    question_id: str
    # MCQ: {"option_id": "a"} · written: {"text": "..."}
    answer: dict[str, Any]


class AnswerFeedback(BaseModel):
    observed: Observed
    score: int
    explanation: str
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    correct_option_id: str | None = None
    review_concept_ids: list[str] = Field(default_factory=list)


class MasteryDelta(BaseModel):
    concept_id: str
    observed: Observed
    mastery_before: float
    mastery_after: float


class SubmitAnswerResponse(BaseModel):
    attempt_id: str
    feedback: AnswerFeedback
    mastery_updates: list[MasteryDelta]
    next_question: QuizQuestionPublic | None = None
    queue_depth: int
    session: QuizSession


class RefillResponse(BaseModel):
    added: int
    queue_depth: int
    session: QuizSession
    question: QuizQuestionPublic | None = None


class EndSessionResponse(BaseModel):
    session: QuizSession
    answered_count: int
    correct_count: int
    percent_correct: int
    weak_concept_ids: list[str]


class RecentAttempt(BaseModel):
    question_id: str
    format: QuizFormat
    concept_ids: list[str]
    observed: Observed
    score: int
    submitted_at: str


class LearnConcept(BaseModel):
    concept_id: str
    name: str
    mastery: float
    attempts: int
    next_review_at: str | None = None
    is_focus: bool = False


class LearnProgress(BaseModel):
    level: Level
    concepts: list[LearnConcept]
    recommended_concept_ids: list[str]
    weak_concept_ids: list[str]
    strong_concept_ids: list[str]
    due_reviews: list[str]
    recent_attempts: list[RecentAttempt]
    streak_days: int = 0
    recent_scores: list[int] = Field(default_factory=list)
    preferred_formats: list[QuizFormat] = Field(default_factory=list)
    custom_topics: list[str] = Field(default_factory=list)
