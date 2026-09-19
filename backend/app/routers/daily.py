"""Long-term learning cycle and the daily session (the 30-45 minute market analysis)."""
from typing import Annotated

from fastapi import APIRouter, Query

from ..deps import BearerToken, CurrentUser
from ..schemas.common import Level
from ..schemas.daily import AnalysisFeedback, AnalysisSubmit, CompleteTaskRequest, CycleStatus, DailyToday
from ..services import daily as daily_service

router = APIRouter(prefix="/v1/daily", tags=["daily"])
LevelQ = Annotated[Level | None, Query(description="Learner level (from the placement plan)")]
TodayQ = Annotated[str | None, Query(description="Override today's date, YYYY-MM-DD (tests, timezones)")]


@router.get("/today", response_model=DailyToday)
async def today(user_id: CurrentUser, token: BearerToken, level: LevelQ = None, today: TodayQ = None) -> DailyToday:
    return await daily_service.get_today(user_id, token, level, today)


@router.post("/tasks/{task_id}/complete", response_model=DailyToday)
async def complete_task(task_id: str, req: CompleteTaskRequest, user_id: CurrentUser, token: BearerToken) -> DailyToday:
    return await daily_service.complete_task(user_id, token, task_id, req)


@router.post("/analysis", response_model=AnalysisFeedback)
async def submit_analysis(req: AnalysisSubmit, user_id: CurrentUser, token: BearerToken) -> AnalysisFeedback:
    """Grade the structured analyst note against today's real data; passing completes the block."""
    return await daily_service.submit_analysis(user_id, token, req)


@router.get("/cycle", response_model=CycleStatus)
def cycle(user_id: CurrentUser, token: BearerToken, level: LevelQ = None, today: TodayQ = None) -> CycleStatus:
    return daily_service.get_cycle(user_id, token, level, today)


@router.post("/cycle/restart", response_model=CycleStatus)
def restart(user_id: CurrentUser, token: BearerToken, level: LevelQ = None, today: TodayQ = None) -> CycleStatus:
    """Start a fresh cycle (e.g. after retaking placement). History and streaks are kept."""
    return daily_service.restart_cycle(user_id, token, level, today)
