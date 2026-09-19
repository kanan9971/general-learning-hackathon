"""Quiz orchestration: selection → generate → queue → grade → mastery."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from ..config import Settings, get_settings
from ..db import quiz as quiz_db
from ..db.client import service_client, user_client
from ..db.memory_quiz import STORE, deep, new_id
from ..errors import ApiError
from ..learning.adaptive import ConceptState, recommend_concepts, select_targets
from ..learning.market_lab import scenario_quiz_draft
from ..learning.mastery import apply_observation, overall_level_from_mastery
from ..market.guide import load_guide, rules_for_concept
from ..learning.seals import seal_option, verify_option
from ..llm import structured
from ..llm.client import LLMError
from ..llm.fallbacks import quiz as quiz_fallback
from ..llm.prompts import quiz_eval, quiz_question
from ..schemas.ai import QuizEvalLLM, QuizQuestionLLM
from ..schemas.quiz import (
    FORMAT_LABELS,
    FORMATS,
    AnswerFeedback,
    EndSessionResponse,
    LearnConcept,
    LearnProgress,
    MasteryDelta,
    McqOptionPublic,
    QuizPreferences,
    QuizPreferencesResponse,
    QuizQuestionPublic,
    QuizSession,
    RecentAttempt,
    RefillResponse,
    StartSessionResponse,
    SubmitAnswerResponse,
    TopicOption,
    UpdatePreferencesRequest,
)

QUEUE_TARGET = 3  # unanswered (current + ready) capped at 3


def _use_memory(settings: Settings, token: str | None) -> bool:
    if settings.quiz_use_memory:
        return True
    if not token:
        return True  # AUTH_DEV_BYPASS without JWT → memory
    if not settings.supabase_url or not settings.supabase_anon_key:
        return True
    return False


def _db(token: str | None, settings: Settings):
    if _use_memory(settings, token):
        return None
    assert token
    return user_client(token)


# ---------- preferences ----------

def get_preferences_response(user_id: str, token: str | None) -> QuizPreferencesResponse:
    s = get_settings()
    concepts = _list_concepts(user_id, token, s)
    prefs = _get_prefs(user_id, token, s) or {
        "preferred_formats": [],
        "preferred_concept_ids": [],
        "custom_topics": [],
        "level": "beginner",
    }
    return QuizPreferencesResponse(
        preferences=QuizPreferences(
            preferred_formats=list(prefs.get("preferred_formats") or []),
            preferred_concept_ids=list(prefs.get("preferred_concept_ids") or []),
            custom_topics=list(prefs.get("custom_topics") or []),
            level=prefs.get("level") or "beginner",
        ),
        available_formats=[{"id": f, "label": FORMAT_LABELS[f]} for f in FORMATS],
        available_topics=[
            TopicOption(
                id=c["id"],
                name=c["name"],
                asset_class=c.get("asset_class"),
                level=c.get("level") or "beginner",
                summary=c.get("summary"),
            )
            for c in concepts
        ],
    )


def update_preferences(user_id: str, token: str | None, req: UpdatePreferencesRequest) -> QuizPreferencesResponse:
    s = get_settings()
    current = _get_prefs(user_id, token, s) or {
        "preferred_formats": [],
        "preferred_concept_ids": [],
        "custom_topics": [],
        "level": "beginner",
    }
    row = {
        "preferred_formats": req.preferred_formats if req.preferred_formats is not None else current.get("preferred_formats") or [],
        "preferred_concept_ids": req.preferred_concept_ids if req.preferred_concept_ids is not None else current.get("preferred_concept_ids") or [],
        "custom_topics": _clean_topics(req.custom_topics if req.custom_topics is not None else current.get("custom_topics") or []),
        "level": req.level or current.get("level") or "beginner",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    _save_prefs(user_id, token, s, row)
    return get_preferences_response(user_id, token)


def _clean_topics(topics: list[str]) -> list[str]:
    out: list[str] = []
    for t in topics:
        t = (t or "").strip()[:80]
        if t and t.lower() not in {x.lower() for x in out}:
            out.append(t)
        if len(out) >= 20:
            break
    return out


# ---------- sessions ----------

def start_session(
    user_id: str,
    token: str | None,
    *,
    formats: list[str],
    concept_ids: list[str],
    custom_topics: list[str],
    level: str | None,
) -> StartSessionResponse:
    s = get_settings()
    if not formats:
        raise ApiError("invalid_request", "Select at least one question format", 422)
    prefs = _get_prefs(user_id, token, s) or {}
    lvl = level or prefs.get("level") or "beginner"
    topics = _clean_topics(custom_topics or list(prefs.get("custom_topics") or []))
    cids = concept_ids or list(prefs.get("preferred_concept_ids") or [])

    session_row = {
        "id": new_id(),
        "user_id": user_id,
        "status": "active",
        "formats": formats,
        "concept_ids": cids,
        "custom_topics": topics,
        "level": lvl,
        "answered_count": 0,
        "correct_count": 0,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "ended_at": None,
    }
    _create_session(user_id, token, s, session_row)

    generated = _generate_batch(
        user_id, token, s,
        session_id=session_row["id"],
        formats=formats,
        concept_ids=cids,
        custom_topics=topics,
        level=lvl,
        n=QUEUE_TARGET,
        start_seq=1,
    )
    if not generated:
        raise ApiError("generation_failed", "Could not prepare quiz questions", 503, True)

    # First becomes current
    first = generated[0]
    _update_question(user_id, token, s, first["id"], {"status": "current"})
    first["status"] = "current"

    session = _session_public(session_row, ready_count=len(generated))
    return StartSessionResponse(
        session=session,
        question=_to_public(first),
        queue_depth=len(generated),
    )


def submit_answer(
    user_id: str,
    token: str | None,
    session_id: str,
    *,
    question_id: str,
    answer: dict[str, Any],
) -> SubmitAnswerResponse:
    s = get_settings()
    session = _require_active_session(user_id, token, s, session_id)
    question = _get_question(user_id, token, s, question_id)
    if not question or question["session_id"] != session_id:
        raise ApiError("not_found", "Question not found", 404)
    if question["status"] == "answered":
        existing = _get_attempt(user_id, token, s, question_id)
        if existing:
            return _rebuild_submit_response(user_id, token, s, session, existing, question)
        raise ApiError("already_answered", "Question already answered", 409)

    # Save answer first (pending), then grade.
    attempt_id = new_id()
    pending = {
        "id": attempt_id,
        "question_id": question_id,
        "session_id": session_id,
        "user_id": user_id,
        "answer": answer,
        "observed": "incorrect",
        "score": 0,
        "feedback": {},
        "grading_status": "pending",
        "submitted_at": datetime.now(timezone.utc).isoformat(),
    }
    _insert_attempt(user_id, token, s, pending)

    feedback, observed, score = _grade(s, question, answer)
    mastery_updates = _apply_mastery(user_id, token, s, question, observed, attempt_id)

    fb_dict = feedback.model_dump()
    _update_attempt(user_id, token, s, attempt_id, {
        "observed": observed,
        "score": score,
        "feedback": fb_dict,
        "grading_status": "complete",
        "model": question.get("model"),
        "prompt_version": question.get("prompt_version"),
    })
    _update_question(user_id, token, s, question_id, {"status": "answered"})

    answered = int(session.get("answered_count") or 0) + 1
    correct = int(session.get("correct_count") or 0) + (1 if observed == "correct" else 0)
    session = _update_session(user_id, token, s, session_id, {
        "answered_count": answered,
        "correct_count": correct,
    })

    next_q = _pop_next(user_id, token, s, session_id)
    depth = _ready_depth(user_id, token, s, session_id)
    return SubmitAnswerResponse(
        attempt_id=attempt_id,
        feedback=feedback,
        mastery_updates=mastery_updates,
        next_question=_to_public(next_q) if next_q else None,
        queue_depth=depth,
        session=_session_public(session, ready_count=depth),
    )


def refill(user_id: str, token: str | None, session_id: str) -> RefillResponse:
    s = get_settings()
    session = _require_active_session(user_id, token, s, session_id)
    depth = _ready_depth(user_id, token, s, session_id)
    added = 0
    if depth < QUEUE_TARGET:
        need = QUEUE_TARGET - depth
        start_seq = _next_seq(user_id, token, s, session_id)
        generated = _generate_batch(
            user_id, token, s,
            session_id=session_id,
            formats=list(session.get("formats") or ["mcq"]),
            concept_ids=list(session.get("concept_ids") or []),
            custom_topics=list(session.get("custom_topics") or []),
            level=session.get("level") or "beginner",
            n=need,
            start_seq=start_seq,
        )
        added = len(generated)
        depth = _ready_depth(user_id, token, s, session_id)
    next_q = _pop_next(user_id, token, s, session_id)
    depth = _ready_depth(user_id, token, s, session_id)
    return RefillResponse(
        added=added,
        queue_depth=depth,
        session=_session_public(session, ready_count=depth),
        question=_to_public(next_q) if next_q else None,
    )


def end_session(user_id: str, token: str | None, session_id: str) -> EndSessionResponse:
    s = get_settings()
    session = _require_session(user_id, token, s, session_id)
    session = _update_session(user_id, token, s, session_id, {
        "status": "ended",
        "ended_at": datetime.now(timezone.utc).isoformat(),
    })
    answered = int(session.get("answered_count") or 0)
    correct = int(session.get("correct_count") or 0)
    pct = int(round(100 * correct / answered)) if answered else 0
    mastery = _mastery_states(user_id, token, s)
    weak = [c.concept_id for c in sorted(mastery, key=lambda x: x.mastery)[:3]]
    return EndSessionResponse(
        session=_session_public(session, ready_count=0),
        answered_count=answered,
        correct_count=correct,
        percent_correct=pct,
        weak_concept_ids=weak,
    )


def learn_progress(user_id: str, token: str | None) -> LearnProgress:
    s = get_settings()
    prefs = _get_prefs(user_id, token, s) or {}
    concepts_meta = {c["id"]: c for c in _list_concepts(user_id, token, s)}
    mastery = _mastery_states(user_id, token, s)
    focus = set(prefs.get("preferred_concept_ids") or [])
    values = [c.mastery for c in mastery]
    level = prefs.get("level") or overall_level_from_mastery(values, "beginner")
    recommended = recommend_concepts(mastery, limit=5)
    weak = [c.concept_id for c in sorted(mastery, key=lambda x: x.mastery)[:5]]
    strong = [c.concept_id for c in sorted(mastery, key=lambda x: x.mastery, reverse=True) if c.mastery >= 0.7][:5]
    due = [c.concept_id for c in mastery if c.next_review_at]
    # Filter due to actually due
    now = datetime.now(timezone.utc)
    due_ids = []
    for c in mastery:
        if not c.next_review_at:
            continue
        try:
            ts = datetime.fromisoformat(c.next_review_at.replace("Z", "+00:00"))
            if ts <= now:
                due_ids.append(c.concept_id)
        except ValueError:
            pass

    recent = _recent_attempt_views(user_id, token, s)
    scores = [a.score for a in recent[:8]]

    learn_concepts = []
    seen = set()
    for c in mastery:
        seen.add(c.concept_id)
        meta = concepts_meta.get(c.concept_id, {})
        learn_concepts.append(LearnConcept(
            concept_id=c.concept_id,
            name=meta.get("name") or c.name or c.concept_id,
            mastery=c.mastery,
            attempts=c.attempts,
            next_review_at=c.next_review_at,
            is_focus=c.concept_id in focus,
        ))
    for cid in focus:
        if cid not in seen:
            meta = concepts_meta.get(cid, {})
            learn_concepts.append(LearnConcept(
                concept_id=cid,
                name=meta.get("name") or cid,
                mastery=0.35,
                attempts=0,
                is_focus=True,
            ))

    return LearnProgress(
        level=level,  # type: ignore[arg-type]
        concepts=learn_concepts,
        recommended_concept_ids=recommended or weak[:3],
        weak_concept_ids=weak,
        strong_concept_ids=strong,
        due_reviews=due_ids,
        recent_attempts=recent,
        streak_days=1 if recent else 0,
        recent_scores=scores,
        preferred_formats=list(prefs.get("preferred_formats") or []),
        custom_topics=list(prefs.get("custom_topics") or []),
    )


# ---------- generation / grading ----------

def _generate_batch(
    user_id: str,
    token: str | None,
    s: Settings,
    *,
    session_id: str,
    formats: list[str],
    concept_ids: list[str],
    custom_topics: list[str],
    level: str,
    n: int,
    start_seq: int,
) -> list[dict]:
    mastery = _mastery_states(user_id, token, s)
    recent_ids, mistake_ids = _recent_patterns(user_id, token, s)
    targets = select_targets(
        formats=formats,
        preferred_concept_ids=concept_ids,
        custom_topics=custom_topics,
        mastery=mastery,
        recent_concept_ids=recent_ids,
        recent_mistake_ids=mistake_ids,
        level=level,
        n=n,
    )
    concepts = {c["id"]: c for c in _list_concepts(user_id, token, s)}
    rows: list[dict] = []
    for i, t in enumerate(targets):
        meta = concepts.get(t.concept_id or "", {})
        draft, generated_by, model = _draft_question(
            s,
            format=t.format,
            level=level,
            difficulty=t.difficulty,
            concept_id=t.concept_id,
            concept_name=meta.get("name"),
            concept_summary=meta.get("summary"),
            custom_topic=t.custom_topic,
            recent_mistakes=[m for m in mistake_ids[:3]],
            market_rules=rules_for_concept(t.concept_id),
        )
        qid = new_id()
        public_payload, private_payload = _split_payload(s, qid, draft)
        row = {
            "id": qid,
            "session_id": session_id,
            "user_id": user_id,
            "sequence": start_seq + i,
            "status": "ready",
            "format": draft.format,
            "skill": draft.skill,
            "difficulty": draft.difficulty,
            "concept_ids": [c for c in draft.concept_ids if c != "custom"] or ([t.concept_id] if t.concept_id else []),
            "custom_topic": t.custom_topic,
            "prompt": draft.prompt,
            "public_payload": public_payload,
            "private_payload": private_payload,
            "prompt_version": quiz_question.PROMPT_VERSION,
            "model": model,
            "generated_by": generated_by,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        rows.append(row)
    _insert_questions(user_id, token, s, rows)
    return rows


def _draft_question(
    s: Settings,
    **kwargs,
) -> tuple[QuizQuestionLLM, str, str | None]:
    try:
        result = structured.generate(
            QuizQuestionLLM,
            system=quiz_question.SYSTEM,
            user=quiz_question.build_user(**kwargs),
            model=s.xai_model_fast,
            prompt_version=quiz_question.PROMPT_VERSION,
            temperature=0.4,
            max_tokens=1200,
        )
        draft = result.value
        # Soft-validate MCQ shape
        if draft.format == "mcq":
            if len(draft.options) < 2 or not draft.correct_option_id:
                raise LLMError("mcq incomplete")
            ids = {o.id for o in draft.options}
            if draft.correct_option_id not in ids:
                raise LLMError("correct option missing")
        return draft, "llm", result.model
    except (LLMError, Exception):
        # No LLM: a deterministic what-if from the market scenario library when one teaches this concept.
        whatif = scenario_quiz_draft(load_guide(), kwargs.get("concept_id"), kwargs["format"], kwargs["difficulty"],
                                     seed=str(kwargs.get("recent_mistakes")))
        if whatif is not None:
            return whatif, "fallback", None
        fb = quiz_fallback.fallback_question(
            format=kwargs["format"],
            concept_id=kwargs.get("concept_id"),
            custom_topic=kwargs.get("custom_topic"),
            difficulty=kwargs["difficulty"],
        )
        return fb, "fallback", None


def _split_payload(s: Settings, question_id: str, draft: QuizQuestionLLM) -> tuple[dict, dict]:
    public: dict[str, Any] = {
        "hints": draft.hints,
        "context": draft.context,
    }
    private: dict[str, Any] = {
        "explanation": draft.explanation,
        "expected_elements": draft.expected_elements,
        "skill": draft.skill,
    }
    if draft.format == "mcq":
        public["options"] = [{"id": o.id, "text": o.text} for o in draft.options]
        correct = draft.correct_option_id or draft.options[0].id
        private["correct_option_seal"] = seal_option(s.quiz_hmac_secret, question_id, correct)
        # Keep plaintext only for server-side fallback grading path under memory; never sent to client.
        private["correct_option_id_server"] = correct
    else:
        public["word_range"] = [40, 120] if draft.format == "short_answer" else [80, 180]
    return public, private


def _grade(s: Settings, question: dict, answer: dict) -> tuple[AnswerFeedback, str, int]:
    fmt = question["format"]
    private = question.get("private_payload") or {}
    public = question.get("public_payload") or {}

    if fmt == "mcq":
        option_id = str(answer.get("option_id") or "")
        seal = private.get("correct_option_seal") or ""
        ok = bool(option_id) and verify_option(s.quiz_hmac_secret, question["id"], option_id, seal)
        # Memory-store backup if seal missing
        if not seal and private.get("correct_option_id_server"):
            ok = option_id == private["correct_option_id_server"]
        observed = "correct" if ok else "incorrect"
        score = 100 if ok else 0
        correct_id = private.get("correct_option_id_server") if ok or True else None
        # Reveal correct option id only in feedback after grading
        if not correct_id and seal:
            # Brute options from public payload
            for o in public.get("options") or []:
                if verify_option(s.quiz_hmac_secret, question["id"], o["id"], seal):
                    correct_id = o["id"]
                    break
        return (
            AnswerFeedback(
                observed=observed,  # type: ignore[arg-type]
                score=score,
                explanation=private.get("explanation") or ("Correct." if ok else "Not quite — review the concept and try the next one."),
                correct_option_id=correct_id,
                review_concept_ids=list(question.get("concept_ids") or []),
            ),
            observed,
            score,
        )

    text = str(answer.get("text") or "").strip()
    if not text:
        return (
            AnswerFeedback(
                observed="incorrect",
                score=0,
                explanation="No answer was provided.",
                gaps=["Empty response"],
                review_concept_ids=list(question.get("concept_ids") or []),
            ),
            "incorrect",
            0,
        )

    try:
        result = structured.generate(
            QuizEvalLLM,
            system=quiz_eval.SYSTEM,
            user=quiz_eval.build_user(
                format=fmt,
                prompt=question["prompt"],
                context=public.get("context"),
                expected_elements=list(private.get("expected_elements") or []),
                concept_ids=list(question.get("concept_ids") or []),
                answer_text=text,
            ),
            model=s.xai_model_fast,
            prompt_version=quiz_eval.PROMPT_VERSION,
            temperature=0.2,
            max_tokens=900,
        )
        ev = result.value
        return (
            AnswerFeedback(
                observed=ev.observed,
                score=ev.score,
                explanation=ev.explanation,
                strengths=ev.strengths,
                gaps=ev.gaps,
                review_concept_ids=ev.review_concept_ids or list(question.get("concept_ids") or []),
            ),
            ev.observed,
            ev.score,
        )
    except (LLMError, Exception):
        # Heuristic fallback: keyword overlap with expected elements
        expected = [e.lower() for e in (private.get("expected_elements") or [])]
        hits = sum(1 for e in expected if any(w in text.lower() for w in e.split()[:2]))
        if expected and hits >= max(1, len(expected) // 2 + 1):
            observed, score = "correct", 80
        elif hits >= 1:
            observed, score = "partial", 55
        else:
            observed, score = "incorrect", 25
        return (
            AnswerFeedback(
                observed=observed,  # type: ignore[arg-type]
                score=score,
                explanation=private.get("explanation") or "Graded with a simple keyword check (model unavailable).",
                strengths=["Covered some key ideas"] if hits else [],
                gaps=["Missed expected elements"] if observed != "correct" else [],
                review_concept_ids=list(question.get("concept_ids") or []),
            ),
            observed,
            score,
        )


def _apply_mastery(
    user_id: str, token: str | None, s: Settings, question: dict, observed: str, attempt_id: str,
) -> list[MasteryDelta]:
    updates: list[MasteryDelta] = []
    concept_ids = list(question.get("concept_ids") or [])
    if not concept_ids and question.get("custom_topic"):
        return updates
    rows = {r.concept_id: r for r in _mastery_states(user_id, token, s)}
    for cid in concept_ids:
        prev = rows.get(cid)
        mastery = prev.mastery if prev else 0.35
        box = 1
        conf = prev.confidence if prev else 0.0
        # Pull box from store if available
        raw = _get_mastery_row(user_id, token, s, cid)
        if raw:
            box = int(raw.get("box") or 1)
            conf = float(raw.get("confidence") or 0)
            mastery = float(raw.get("mastery") or mastery)
        result = apply_observation(mastery, observed, box=box, confidence=conf)  # type: ignore[arg-type]
        attempts = int((raw or {}).get("attempts") or 0) + 1
        correct = int((raw or {}).get("correct") or 0) + (1 if observed == "correct" else 0)
        fields = {
            "mastery": result["mastery"],
            "confidence": result["confidence"],
            "box": result["box"],
            "attempts": attempts,
            "correct": correct,
            "last_reviewed_at": result["last_reviewed_at"],
            "next_review_at": result["next_review_at"],
        }
        _upsert_mastery(user_id, token, s, cid, fields)
        _insert_mastery_event(user_id, token, s, {
            "id": new_id(),
            "user_id": user_id,
            "concept_id": cid,
            "delta": result["delta"],
            "reason": f"quiz:{observed}",
            "quiz_attempt_id": attempt_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        updates.append(MasteryDelta(
            concept_id=cid,
            observed=observed,  # type: ignore[arg-type]
            mastery_before=result["mastery_before"],
            mastery_after=result["mastery_after"],
        ))
    return updates


def record_observation(user_id: str, token: str | None, concept_ids: list[str], observed: str):
    """Update concept mastery from an answer given outside a quiz session (e.g. the Market Lab)."""
    return _apply_mastery(user_id, token, get_settings(), {"concept_ids": concept_ids}, observed, None)  # type: ignore[arg-type]


def mastery_map(user_id: str, token: str | None) -> dict[str, tuple[float, int]]:
    """concept_id -> (mastery, attempts): the single progress model behind Learn, roadmap and Lab."""
    return {c.concept_id: (c.mastery, c.attempts) for c in _mastery_states(user_id, token, get_settings())}


def current_level(user_id: str, token: str | None) -> str:
    s = get_settings()
    prefs = _get_prefs(user_id, token, s) or {}
    values = [c.mastery for c in _mastery_states(user_id, token, s)]
    return prefs.get("level") or overall_level_from_mastery(values, "beginner")


_PLACEMENT_TARGET = {"correct": 0.62, "partial": 0.5, "incorrect": 0.2}


def seed_placement(user_id: str, token: str | None, concept_ids: list[str], observed: str, difficulty: int):
    """Placement answers set mastery directly (a right answer at difficulty d -> 0.62 + 0.1*d), because
    the incremental update would need many answers before a topic you already know reads as known."""
    s = get_settings()
    updates: list[MasteryDelta] = []
    for cid in concept_ids:
        raw = _get_mastery_row(user_id, token, s, cid) or {}
        prev = float(raw.get("mastery") or 0.35)
        attempts = int(raw.get("attempts") or 0)
        target = _PLACEMENT_TARGET[observed] + (0.1 * difficulty if observed == "correct" else 0.0)
        new = target if attempts == 0 else 0.5 * prev + 0.5 * target
        sched = apply_observation(prev, observed, box=int(raw.get("box") or 1),  # type: ignore[arg-type]
                                  confidence=float(raw.get("confidence") or 0))
        _upsert_mastery(user_id, token, s, cid, {
            "mastery": round(new, 4), "confidence": sched["confidence"], "box": sched["box"], "attempts": attempts + 1,
            "correct": int(raw.get("correct") or 0) + (1 if observed == "correct" else 0),
            "last_reviewed_at": sched["last_reviewed_at"], "next_review_at": sched["next_review_at"],
        })
        _insert_mastery_event(user_id, token, s, {
            "id": new_id(), "user_id": user_id, "concept_id": cid, "delta": round(new - prev, 4),
            "reason": f"placement:{observed}", "quiz_attempt_id": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        updates.append(MasteryDelta(concept_id=cid, observed=observed, mastery_before=prev, mastery_after=round(new, 4)))  # type: ignore[arg-type]
    return updates


# ---------- public helpers ----------

def _to_public(q: dict) -> QuizQuestionPublic:
    pub = q.get("public_payload") or {}
    options = None
    if q["format"] == "mcq":
        options = [McqOptionPublic(**o) for o in (pub.get("options") or [])]
    wr = pub.get("word_range")
    word_range = (int(wr[0]), int(wr[1])) if wr and len(wr) == 2 else None
    return QuizQuestionPublic(
        id=q["id"],
        sequence=int(q["sequence"]),
        format=q["format"],
        difficulty=int(q["difficulty"]),
        concept_ids=list(q.get("concept_ids") or []),
        custom_topic=q.get("custom_topic"),
        prompt=q["prompt"],
        options=options,
        context=pub.get("context"),
        word_range=word_range,
        hints=list(pub.get("hints") or []),
    )


def _session_public(row: dict, ready_count: int = 0) -> QuizSession:
    return QuizSession(
        id=row["id"],
        status=row.get("status") or "active",
        formats=list(row.get("formats") or []),
        concept_ids=list(row.get("concept_ids") or []),
        custom_topics=list(row.get("custom_topics") or []),
        level=row.get("level") or "beginner",
        answered_count=int(row.get("answered_count") or 0),
        correct_count=int(row.get("correct_count") or 0),
        ready_count=ready_count,
    )


def _rebuild_submit_response(user_id, token, s, session, attempt, question) -> SubmitAnswerResponse:
    fb = attempt.get("feedback") or {}
    feedback = AnswerFeedback(
        observed=attempt["observed"],
        score=int(attempt["score"]),
        explanation=fb.get("explanation") or "",
        strengths=fb.get("strengths") or [],
        gaps=fb.get("gaps") or [],
        correct_option_id=fb.get("correct_option_id"),
        review_concept_ids=fb.get("review_concept_ids") or [],
    )
    next_q = _pop_next(user_id, token, s, session["id"])
    depth = _ready_depth(user_id, token, s, session["id"])
    return SubmitAnswerResponse(
        attempt_id=attempt["id"],
        feedback=feedback,
        mastery_updates=[],
        next_question=_to_public(next_q) if next_q else None,
        queue_depth=depth,
        session=_session_public(session, ready_count=depth),
    )


# ---------- storage adapters ----------

def _list_concepts(user_id, token, s) -> list[dict]:
    db = _db(token, s)
    if db is None:
        return deep(STORE.concepts)
    try:
        return quiz_db.list_concepts(db)
    except Exception:
        # Fall back to service-role reference read if RLS/anon path fails
        try:
            return quiz_db.list_concepts(service_client())
        except Exception:
            return deep(STORE.concepts)


def _get_prefs(user_id, token, s) -> dict | None:
    db = _db(token, s)
    if db is None:
        return deep(STORE.preferences.get(user_id))
    try:
        return quiz_db.get_preferences(db, user_id)
    except Exception:
        return deep(STORE.preferences.get(user_id))


def _save_prefs(user_id, token, s, row: dict) -> None:
    db = _db(token, s)
    if db is None:
        STORE.preferences[user_id] = {**row, "user_id": user_id}
        return
    try:
        quiz_db.upsert_preferences(db, user_id, row)
    except Exception as e:
        STORE.preferences[user_id] = {**row, "user_id": user_id}
        if not s.allow_tokenless:
            raise ApiError("prefs_save_failed", str(e)[:200], 503, True) from e


def _create_session(user_id, token, s, row: dict) -> None:
    db = _db(token, s)
    if db is None:
        STORE.sessions[row["id"]] = deep(row)
        return
    try:
        created = quiz_db.create_session(db, row)
        row.update(created)
    except Exception:
        STORE.sessions[row["id"]] = deep(row)


def _require_session(user_id, token, s, session_id: str) -> dict:
    db = _db(token, s)
    if db is None:
        row = STORE.sessions.get(session_id)
        if not row or row["user_id"] != user_id:
            raise ApiError("not_found", "Session not found", 404)
        return deep(row)
    row = quiz_db.get_session(db, user_id, session_id)
    if not row:
        # memory fallback
        mem = STORE.sessions.get(session_id)
        if mem and mem["user_id"] == user_id:
            return deep(mem)
        raise ApiError("not_found", "Session not found", 404)
    return row


def _require_active_session(user_id, token, s, session_id: str) -> dict:
    row = _require_session(user_id, token, s, session_id)
    if row.get("status") != "active":
        raise ApiError("session_ended", "This quiz session has ended", 409)
    return row


def _update_session(user_id, token, s, session_id: str, fields: dict) -> dict:
    db = _db(token, s)
    if db is None:
        STORE.sessions[session_id] = {**STORE.sessions[session_id], **fields}
        return deep(STORE.sessions[session_id])
    try:
        return quiz_db.update_session(db, session_id, fields)
    except Exception:
        if session_id in STORE.sessions:
            STORE.sessions[session_id] = {**STORE.sessions[session_id], **fields}
            return deep(STORE.sessions[session_id])
        raise


def _insert_questions(user_id, token, s, rows: list[dict]) -> None:
    db = _db(token, s)
    if db is None:
        for r in rows:
            STORE.questions[r["id"]] = deep(r)
        return
    try:
        quiz_db.insert_questions(db, rows)
    except Exception:
        for r in rows:
            STORE.questions[r["id"]] = deep(r)


def _update_question(user_id, token, s, question_id: str, fields: dict) -> dict:
    db = _db(token, s)
    if db is None:
        STORE.questions[question_id] = {**STORE.questions[question_id], **fields}
        return deep(STORE.questions[question_id])
    try:
        return quiz_db.update_question(db, question_id, fields)
    except Exception:
        if question_id in STORE.questions:
            STORE.questions[question_id] = {**STORE.questions[question_id], **fields}
            return deep(STORE.questions[question_id])
        raise


def _get_question(user_id, token, s, question_id: str) -> dict | None:
    db = _db(token, s)
    if db is None:
        q = STORE.questions.get(question_id)
        return deep(q) if q and q["user_id"] == user_id else None
    q = quiz_db.get_question(db, user_id, question_id)
    if q:
        return q
    mem = STORE.questions.get(question_id)
    return deep(mem) if mem and mem["user_id"] == user_id else None


def _insert_attempt(user_id, token, s, row: dict) -> None:
    db = _db(token, s)
    if db is None:
        STORE.attempts[row["id"]] = deep(row)
        return
    try:
        quiz_db.insert_attempt(db, row)
    except Exception:
        STORE.attempts[row["id"]] = deep(row)


def _update_attempt(user_id, token, s, attempt_id: str, fields: dict) -> None:
    db = _db(token, s)
    if db is None:
        STORE.attempts[attempt_id] = {**STORE.attempts[attempt_id], **fields}
        return
    try:
        quiz_db.update_attempt(db, attempt_id, fields)
    except Exception:
        if attempt_id in STORE.attempts:
            STORE.attempts[attempt_id] = {**STORE.attempts[attempt_id], **fields}


def _get_attempt(user_id, token, s, question_id: str) -> dict | None:
    db = _db(token, s)
    if db is None:
        for a in STORE.attempts.values():
            if a["question_id"] == question_id and a["user_id"] == user_id:
                return deep(a)
        return None
    a = quiz_db.get_attempt_for_question(db, question_id)
    if a:
        return a
    for a in STORE.attempts.values():
        if a["question_id"] == question_id and a["user_id"] == user_id:
            return deep(a)
    return None


def _ready_depth(user_id, token, s, session_id: str) -> int:
    db = _db(token, s)
    if db is None:
        return sum(
            1 for q in STORE.questions.values()
            if q["session_id"] == session_id and q["status"] in ("ready", "current")
        )
    try:
        return quiz_db.ready_count(db, session_id)
    except Exception:
        return sum(
            1 for q in STORE.questions.values()
            if q["session_id"] == session_id and q["status"] in ("ready", "current")
        )


def _next_seq(user_id, token, s, session_id: str) -> int:
    db = _db(token, s)
    if db is None:
        seqs = [q["sequence"] for q in STORE.questions.values() if q["session_id"] == session_id]
        return (max(seqs) + 1) if seqs else 1
    try:
        return quiz_db.next_sequence(db, session_id)
    except Exception:
        seqs = [q["sequence"] for q in STORE.questions.values() if q["session_id"] == session_id]
        return (max(seqs) + 1) if seqs else 1


def _pop_next(user_id, token, s, session_id: str) -> dict | None:
    db = _db(token, s)
    if db is None:
        current = [
            q for q in STORE.questions.values()
            if q["session_id"] == session_id and q["status"] == "current"
        ]
        if current:
            return deep(sorted(current, key=lambda x: x["sequence"])[0])
        ready = sorted(
            [q for q in STORE.questions.values() if q["session_id"] == session_id and q["status"] == "ready"],
            key=lambda x: x["sequence"],
        )
        if not ready:
            return None
        q = ready[0]
        STORE.questions[q["id"]]["status"] = "current"
        return deep(STORE.questions[q["id"]])
    try:
        return quiz_db.pop_current_or_next_ready(db, session_id)
    except Exception:
        return None


def _mastery_states(user_id, token, s) -> list[ConceptState]:
    db = _db(token, s)
    rows: list[dict] = []
    if db is None:
        rows = [v for (uid, _), v in STORE.mastery.items() if uid == user_id]
    else:
        try:
            rows = quiz_db.get_mastery_rows(db, user_id)
        except Exception:
            rows = [v for (uid, _), v in STORE.mastery.items() if uid == user_id]
    concepts = {c["id"]: c for c in _list_concepts(user_id, token, s)}
    out = []
    for r in rows:
        cid = r["concept_id"]
        out.append(ConceptState(
            concept_id=cid,
            name=(concepts.get(cid) or {}).get("name") or cid,
            mastery=float(r.get("mastery") or 0),
            confidence=float(r.get("confidence") or 0),
            attempts=int(r.get("attempts") or 0),
            correct=int(r.get("correct") or 0),
            next_review_at=r.get("next_review_at"),
        ))
    return out


def _get_mastery_row(user_id, token, s, concept_id: str) -> dict | None:
    for c in _mastery_states(user_id, token, s):
        if c.concept_id == concept_id:
            raw = STORE.mastery.get((user_id, concept_id))
            if raw:
                return deep(raw)
    db = _db(token, s)
    if db is None:
        return deep(STORE.mastery.get((user_id, concept_id)))
    try:
        rows = quiz_db.get_mastery_rows(db, user_id)
        for r in rows:
            if r["concept_id"] == concept_id:
                return r
    except Exception:
        pass
    return deep(STORE.mastery.get((user_id, concept_id)))


def _upsert_mastery(user_id, token, s, concept_id: str, fields: dict) -> None:
    db = _db(token, s)
    STORE.mastery[(user_id, concept_id)] = {
        "user_id": user_id,
        "concept_id": concept_id,
        **fields,
    }
    if db is None:
        return
    try:
        quiz_db.upsert_mastery(db, user_id, concept_id, fields)
    except Exception:
        pass


def _insert_mastery_event(user_id, token, s, row: dict) -> None:
    STORE.mastery_events.append(deep(row))
    db = _db(token, s)
    if db is None:
        return
    try:
        quiz_db.insert_mastery_event(db, row)
    except Exception:
        pass


def _recent_patterns(user_id, token, s) -> tuple[list[str], list[str]]:
    recent_ids: list[str] = []
    mistakes: list[str] = []
    db = _db(token, s)
    attempts: list[dict] = []
    if db is None:
        attempts = sorted(
            [a for a in STORE.attempts.values() if a["user_id"] == user_id],
            key=lambda a: a.get("submitted_at") or "",
            reverse=True,
        )[:20]
    else:
        try:
            attempts = quiz_db.recent_attempts(db, user_id, limit=20)
        except Exception:
            attempts = sorted(
                [a for a in STORE.attempts.values() if a["user_id"] == user_id],
                key=lambda a: a.get("submitted_at") or "",
                reverse=True,
            )[:20]
    for a in attempts:
        q = _get_question(user_id, token, s, a["question_id"])
        if not q:
            continue
        for cid in q.get("concept_ids") or []:
            recent_ids.append(cid)
            if a.get("observed") in ("incorrect", "partial"):
                mistakes.append(cid)
    return recent_ids, mistakes


def _recent_attempt_views(user_id, token, s) -> list[RecentAttempt]:
    out: list[RecentAttempt] = []
    _, _ = [], []
    db = _db(token, s)
    attempts: list[dict] = []
    if db is None:
        attempts = sorted(
            [a for a in STORE.attempts.values() if a["user_id"] == user_id],
            key=lambda a: a.get("submitted_at") or "",
            reverse=True,
        )[:12]
    else:
        try:
            attempts = quiz_db.recent_attempts(db, user_id, limit=12)
        except Exception:
            attempts = []
    for a in attempts:
        q = _get_question(user_id, token, s, a["question_id"])
        if not q:
            continue
        out.append(RecentAttempt(
            question_id=a["question_id"],
            format=q["format"],
            concept_ids=list(q.get("concept_ids") or []),
            observed=a["observed"],
            score=int(a["score"]),
            submitted_at=a.get("submitted_at") or "",
        ))
    return out
