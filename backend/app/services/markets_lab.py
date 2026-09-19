"""Market Lab orchestration: today's snapshot -> questions (learning.market_lab) -> checked answers,
LLM-graded explanations, and mastery updates. The answer key is rebuilt server-side from the same
snapshot on every answer, so the client never receives it."""
import asyncio
import re

from ..config import get_settings
from ..db import knowledge
from ..db.client import service_client
from ..errors import ApiError
from ..learning import market_lab as lab
from ..llm.client import LLMError
from ..llm.prompts import lab_explain as prompt
from ..llm.structured import generate
from ..market.snapshot import get_snapshot
from ..market.universe import INSTRUMENTS
from ..schemas.ai import QuizEvalLLM
from ..schemas.markets import LabAnswerRequest, LabFeedback, LabMastery, LabRequest, LabSet, Move
from . import markets as markets_service
from . import quiz as quiz_service


async def _pool(section, watch: list[str]):
    g = markets_service.guide()
    symbols = list(dict.fromkeys(
        [i.symbol for i in INSTRUMENTS] + [x for r in g.relationships for x in (r.cause, r.effect)]))
    snap = await get_snapshot(symbols)
    moves = {m.symbol: m for m in snap.moves}
    return snap, lab.build_pool(moves, g, snap.as_of, section)


async def get_lab(req: LabRequest) -> LabSet:
    snap, pool = await _pool(req.section, req.watch)
    if not pool:
        raise ApiError("no_questions", "Not enough market data to build questions right now", 503, True)
    picked = lab.select(pool, req.level, req.count, list(req.interests), list(req.kinds) if req.kinds else None)
    return LabSet(as_of=snap.as_of, data_mode=snap.data_mode, questions=[it.public for it in picked])


def _fact_rows(facts: list[Move]) -> list[dict]:
    return [markets_service._fact_row(m) for m in facts]


def _keywords(rubric: list[str]) -> set[str]:
    words = {w for r in rubric for w in re.findall(r"[a-z]{5,}", r.lower())}
    return words - {"which", "there", "their", "these", "those", "because", "usually", "about", "other"}


def _fallback_grade(item: lab.LabItem, text: str) -> tuple[str, int, str]:
    """No LLM: a rough keyword check, honest about being unable to grade properly."""
    hits = len(_keywords(item.rubric) & set(re.findall(r"[a-z]{5,}", text.lower())))
    long_enough = len(text.split()) >= 15
    observed, score = ("partial", 55) if (long_enough and hits >= 2) else ("incorrect", 25)
    return observed, score, "The AI grader was unavailable, so this is a rough check only. Compare with the model answer below."


async def answer(user_id: str, token: str | None, req: LabAnswerRequest) -> LabFeedback:
    _, pool = await _pool(req.section, req.watch)
    item = next((i for i in pool if i.public.id == req.question_id), None)
    if item is None:
        raise ApiError("question_expired", "Today's data changed. Start a new set.", 409, True)
    q = item.public
    if q.kind == "explain" and (not isinstance(req.answer, str) or len(req.answer.strip()) < 8):
        raise ApiError("answer_too_short", "Write at least a sentence or two.", 422)

    strengths: list[str] = []
    gaps: list[str] = []
    graded_by = "rule"
    verdict = lab.check(item, req.answer)
    if verdict is None:  # explain: LLM-graded against the rubric and today's facts
        text = str(req.answer).strip()
        s = get_settings()
        audit = {"user_id": user_id, "route": "markets.lab.grade", "prompt_version": prompt.PROMPT_VERSION}
        try:
            res = await asyncio.to_thread(
                generate, QuizEvalLLM, system=prompt.SYSTEM, model=s.xai_model_fast,
                prompt_version=prompt.PROMPT_VERSION, max_tokens=900,
                user=prompt.build_user(prompt=q.prompt, facts=_fact_rows(q.facts), rubric=item.rubric,
                                       model_answer=item.model_answer, concept_ids=q.concept_ids, answer_text=text),
            )
            v = res.value
            verdict = lab.Verdict(v.observed == "correct", v.observed, v.score,
                                  markets_service.strip_numbers(v.explanation))
            strengths = [markets_service.strip_numbers(x) for x in v.strengths]
            gaps = [markets_service.strip_numbers(x) for x in v.gaps]
            graded_by = "llm"
            markets_service._audit({**audit, "model": res.model, "latency_ms": res.latency_ms, "ok": True,
                                    "input_tokens": res.input_tokens, "output_tokens": res.output_tokens})
        except LLMError as e:
            observed, score, msg = _fallback_grade(item, text)
            verdict = lab.Verdict(False, observed, score, msg)
            graded_by = "fallback"
            markets_service._audit({**audit, "model": s.xai_model_fast, "ok": False, "error": str(e)[:300]})

    mastery: list[LabMastery] = []
    if graded_by != "fallback":  # a keyword guess is not evidence of understanding
        try:
            mastery = [LabMastery(concept_id=d.concept_id, mastery_before=d.mastery_before,
                                  mastery_after=d.mastery_after)
                       for d in quiz_service.record_observation(user_id, token, q.concept_ids, verdict.observed)]
        except Exception:  # noqa: BLE001 - never lose the feedback because progress storage failed
            mastery = []
    reveal = item.reveal.model_copy(update={"parts": verdict.parts}) if verdict.parts else item.reveal
    return LabFeedback(
        question_id=q.id, correct=verdict.correct, observed=verdict.observed,  # type: ignore[arg-type]
        score=verdict.score, explanation=verdict.explanation, strengths=strengths, gaps=gaps,
        reveal=reveal, mastery=mastery, graded_by=graded_by,  # type: ignore[arg-type]
        concept_ids=q.concept_ids,
    )
