"""Paper classroom book: simulated fills, never live brokerage."""
from typing import Annotated

from fastapi import APIRouter, Query

from ..deps import BearerToken, CurrentUser
from ..schemas.common import Level
from ..schemas.portfolio import (
    PaperAnalysisResponse,
    PaperBookResponse,
    PaperFillsResponse,
    PaperTicketRequest,
    PaperTicketResponse,
)
from ..services import paper as paper_svc

router = APIRouter(prefix="/v1/portfolio", tags=["portfolio"])
LevelQ = Annotated[Level | None, Query(description="Placement level; used only when the book is first created")]


@router.get("/", response_model=PaperBookResponse)
async def get_book(user_id: CurrentUser, token: BearerToken, level: LevelQ = None) -> PaperBookResponse:
    return await paper_svc.get_book(user_id, token, level)


@router.get("/fills", response_model=PaperFillsResponse)
async def get_fills(user_id: CurrentUser, token: BearerToken) -> PaperFillsResponse:
    return PaperFillsResponse(fills=await paper_svc.list_fills(user_id, token))


@router.post("/orders", response_model=PaperTicketResponse)
async def submit_order(req: PaperTicketRequest, user_id: CurrentUser, token: BearerToken) -> PaperTicketResponse:
    return await paper_svc.submit_ticket(user_id, token, req)


@router.post("/orders/{fill_id}/cancel", response_model=PaperBookResponse)
async def cancel_order(fill_id: str, user_id: CurrentUser, token: BearerToken) -> PaperBookResponse:
    return await paper_svc.cancel_working(user_id, token, fill_id)


@router.post("/analysis", response_model=PaperAnalysisResponse)
async def analysis(user_id: CurrentUser, token: BearerToken) -> PaperAnalysisResponse:
    return await paper_svc.analyse(user_id, token)
