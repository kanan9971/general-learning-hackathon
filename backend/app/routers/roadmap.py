"""Personalised roadmap and adaptive placement quiz."""
from typing import Annotated

from fastapi import APIRouter, Query

from ..deps import BearerToken, CurrentUser
from ..schemas.common import Level
from ..schemas.roadmap import PlacementRequest, PlacementStep, Roadmap
from ..services import roadmap as roadmap_service

router = APIRouter(prefix="/v1", tags=["roadmap"])


@router.get("/roadmap", response_model=Roadmap)
def get_roadmap(
    user_id: CurrentUser, token: BearerToken,
    level: Annotated[Level | None, Query(description="Override the learner's level (e.g. from the placement plan)")] = None,
) -> Roadmap:
    return roadmap_service.get_roadmap(user_id, token, level)


@router.post("/roadmap/placement/next", response_model=PlacementStep)
def placement_next(req: PlacementRequest, user_id: CurrentUser) -> PlacementStep:
    """Next placement question (or the result). Answers go through /v1/markets/lab/answer with placement=true."""
    return roadmap_service.placement_next(req)
