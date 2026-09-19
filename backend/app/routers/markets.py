"""Markets feed: deterministic moves + Fed/WSJ/Yahoo headlines + how-it-works guide per section."""
from typing import Annotated

from fastapi import APIRouter, Query

from ..deps import CurrentUser
from ..schemas.markets import (
    ExplainSectionRequest, ExplainSectionResponse, MarketsFeed, OverviewRequest, OverviewResponse, SectionId,
)
from ..services import markets as markets_service

router = APIRouter(prefix="/v1", tags=["markets"])


def _csv(raw: str | None) -> list[str]:
    return [x.strip() for x in (raw or "").split(",") if x.strip()]


@router.get("/markets/feed", response_model=MarketsFeed)
async def markets_feed(
    user_id: CurrentUser,
    interests: Annotated[str | None, Query(description="Comma-separated section ids to pin first")] = None,
    watch: Annotated[str | None, Query(description="Comma-separated tickers for company analysis")] = None,
) -> MarketsFeed:
    return await markets_service.build_feed(user_id, _csv(interests), _csv(watch))


@router.post("/markets/sections/{section_id}/explain", response_model=ExplainSectionResponse)
async def explain_section(section_id: SectionId, req: ExplainSectionRequest, user_id: CurrentUser) -> ExplainSectionResponse:
    return await markets_service.explain_section(user_id, section_id, req.level, req.watch)


@router.post("/markets/overview", response_model=OverviewResponse)
async def market_overview(req: OverviewRequest, user_id: CurrentUser) -> OverviewResponse:
    """AI summary of the whole market; every key point carries its evidence (fact_ids + headline ids)."""
    return await markets_service.market_overview(user_id, req.level, list(req.interests), req.watch)

