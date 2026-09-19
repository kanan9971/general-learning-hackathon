"""Adaptive infinite quiz routes."""
from fastapi import APIRouter

from ..deps import BearerToken, CurrentUser
from ..schemas.quiz import (
    EndSessionResponse,
    LearnProgress,
    QuizPreferencesResponse,
    RefillResponse,
    StartSessionRequest,
    StartSessionResponse,
    SubmitAnswerRequest,
    SubmitAnswerResponse,
    UpdatePreferencesRequest,
)
from ..services import quiz as quiz_service

router = APIRouter(prefix="/v1", tags=["quiz"])


@router.get("/quiz/preferences", response_model=QuizPreferencesResponse)
def get_preferences(user_id: CurrentUser, token: BearerToken) -> QuizPreferencesResponse:
    return quiz_service.get_preferences_response(user_id, token)


@router.put("/quiz/preferences", response_model=QuizPreferencesResponse)
def put_preferences(
    req: UpdatePreferencesRequest, user_id: CurrentUser, token: BearerToken,
) -> QuizPreferencesResponse:
    return quiz_service.update_preferences(user_id, token, req)


@router.post("/quiz/sessions", response_model=StartSessionResponse)
def start_session(
    req: StartSessionRequest, user_id: CurrentUser, token: BearerToken,
) -> StartSessionResponse:
    return quiz_service.start_session(
        user_id,
        token,
        formats=list(req.formats),
        concept_ids=list(req.concept_ids),
        custom_topics=list(req.custom_topics),
        level=req.level,
    )


@router.post("/quiz/sessions/{session_id}/answers", response_model=SubmitAnswerResponse)
def submit_answer(
    session_id: str,
    req: SubmitAnswerRequest,
    user_id: CurrentUser,
    token: BearerToken,
) -> SubmitAnswerResponse:
    return quiz_service.submit_answer(
        user_id, token, session_id, question_id=req.question_id, answer=req.answer,
    )


@router.post("/quiz/sessions/{session_id}/refill", response_model=RefillResponse)
def refill_session(
    session_id: str, user_id: CurrentUser, token: BearerToken,
) -> RefillResponse:
    return quiz_service.refill(user_id, token, session_id)


@router.post("/quiz/sessions/{session_id}/end", response_model=EndSessionResponse)
def end_session(
    session_id: str, user_id: CurrentUser, token: BearerToken,
) -> EndSessionResponse:
    return quiz_service.end_session(user_id, token, session_id)


@router.get("/learn/progress", response_model=LearnProgress)
def learn_progress(user_id: CurrentUser, token: BearerToken) -> LearnProgress:
    return quiz_service.learn_progress(user_id, token)
