"""Daily session + learning cycle contracts. The roadmap is the long cycle; the unit of progress is the day."""
from typing import Literal

from pydantic import BaseModel, Field

from .common import DataMode, Level
from .markets import Headline, Move, SectionId

TaskKind = Literal["brief", "focus", "analysis", "practice", "review", "recap"]
TaskStatus = Literal["todo", "done"]
Verdict = Literal["on_track", "slipping", "behind"]
DayStatus = Literal["met", "partial", "missed", "today", "future", "rest"]
NOTE_PROMPT_IDS = ("moved", "evidence", "chain", "affected", "wrong_if")


class DailyTask(BaseModel):
    id: TaskKind
    kind: TaskKind
    title: str
    blurb: str
    minutes: int
    status: TaskStatus = "todo"
    result: dict | None = None  # what the learner did (their call, score, watch item...)
    done_at: str | None = None


class PhaseTopic(BaseModel):
    id: str  # roadmap node id
    title: str
    section_id: SectionId | None = None


class PhaseInfo(BaseModel):
    index: int
    title: str
    theme: str
    topics: list[PhaseTopic]


class NotePrompt(BaseModel):
    id: str
    title: str
    hint: str


class AnalysisBrief(BaseModel):
    """The evidence pool the analyst note is written from (and graded against)."""
    target: Move
    related: list[Move]
    headlines: list[Headline]
    prompts: list[NotePrompt]


class WeekSummary(BaseModel):
    days_met: int
    market_days: int
    notes_written: int
    avg_note_score: int | None
    minutes: int


class DailyToday(BaseModel):
    date: str
    weekday: str
    is_market_day: bool
    theme: str
    day_number: int  # goal days completed in this cycle, plus today
    total_goal_days: int
    phase: PhaseInfo
    focus_node_id: str
    focus_title: str
    focus_section_id: SectionId | None = None
    tasks: list[DailyTask]
    minutes_planned: int
    minutes_done: int
    goal_met: bool
    streak: int
    best_streak: int
    verdict: Verdict
    behind_by: int
    cycle_complete: bool
    as_of: str | None
    data_mode: DataMode
    top_moves: list[Move]
    analysis: AnalysisBrief | None = None
    week: WeekSummary | None = None  # set on weekends for the recap
    due_concepts: list[str] = Field(default_factory=list)


class CompleteTaskRequest(BaseModel):
    level: Level | None = None
    today: str | None = None
    call: str | None = None  # brief: your own read of the market
    watch: str | None = None  # review: what you will watch tomorrow
    answered: int | None = None  # practice
    correct: int | None = None  # practice


class AnalysisSubmit(BaseModel):
    level: Level | None = None
    today: str | None = None
    answers: dict[str, str]  # NOTE_PROMPT_IDS -> text


class PromptScore(BaseModel):
    prompt_id: str
    score: int = Field(ge=0, le=4)
    comment: str


class AnalysisFeedback(BaseModel):
    score: int
    observed: Literal["correct", "partial", "incorrect"]
    passed: bool  # counts toward today's goal
    prompt_scores: list[PromptScore]
    strengths: list[str]
    gaps: list[str]
    model_note: str
    graded_by: Literal["llm", "fallback"]
    today: DailyToday


class CalendarDay(BaseModel):
    date: str
    weekday: str
    status: DayStatus
    minutes: int = 0


class PhaseProgress(BaseModel):
    index: int
    title: str
    theme: str
    topics: list[str]
    days_done: int
    days_total: int
    state: Literal["done", "current", "upcoming"]


class CycleStatus(BaseModel):
    started_on: str
    level: Level
    completed_days: int
    total_days: int
    day_number: int
    phase_index: int
    phase_title: str
    focus_node_id: str
    streak: int
    best_streak: int
    verdict: Verdict
    behind_by: int
    week_minutes: int
    complete: bool
    phases: list[PhaseProgress]
    calendar: list[CalendarDay]
