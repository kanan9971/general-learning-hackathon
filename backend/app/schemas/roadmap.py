"""Personalised learning roadmap + adaptive placement quiz contracts."""
from typing import Literal

from pydantic import BaseModel, Field

from .common import Level
from .markets import LabQuestion, SectionId

NodeState = Literal["not_started", "in_progress", "priority", "mastered"]
NodeAction = Literal["section", "connect", "lab_explain", "lab_scenario"]


class RoadmapNode(BaseModel):
    id: str
    title: str
    tagline: str
    tier: int
    order: int  # position within its tier, left to right
    requires: list[str]
    action: NodeAction
    section_id: SectionId | None = None
    concept_ids: list[str]
    progress: float  # 0..1, mean mastery of the concepts attempted (0 if none)
    coverage: float  # 0..1, share of the node's concepts attempted
    state: NodeState
    recommended: bool = False  # "you are here": the next step
    collapsed: bool = False  # already known at your level: shown compact
    test_out: bool = False  # you may prove you know it and skip ahead
    hint: str | None = None


class Roadmap(BaseModel):
    level: Level
    track: str  # "Beginner track"
    rationale: str  # why the path looks like this, in one or two sentences
    needs_placement: bool  # nothing to personalise from yet
    next_id: str | None
    mastered_count: int
    total_count: int
    nodes: list[RoadmapNode]


class PlacementAnswered(BaseModel):
    question_id: str
    observed: Literal["correct", "partial", "incorrect"]


class PlacementRequest(BaseModel):
    history: list[PlacementAnswered] = Field(default_factory=list, max_length=20)


class PlacementTopic(BaseModel):
    section_id: SectionId
    title: str
    observed: Literal["correct", "partial", "incorrect"]
    difficulty: int


class PlacementStep(BaseModel):
    done: bool
    index: int  # 0-based position of `question`, or the total when done
    total: int
    question: LabQuestion | None = None
    level: Level | None = None  # set when done
    percent: int | None = None
    topics: list[PlacementTopic] = Field(default_factory=list)  # set when done
    focus_concept_ids: list[str] = Field(default_factory=list)  # weakest topics' concepts, set when done
