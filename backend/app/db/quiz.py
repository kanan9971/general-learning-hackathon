"""User-JWT data access for adaptive quiz + learner memory."""
from __future__ import annotations

from typing import Any

from supabase import Client

from ..errors import ApiError


def _data(res) -> list[dict]:
    return res.data or []


def get_preferences(db: Client, user_id: str) -> dict | None:
    rows = _data(db.table("learner_preferences").select("*").eq("user_id", user_id).limit(1).execute())
    return rows[0] if rows else None


def upsert_preferences(db: Client, user_id: str, row: dict) -> dict:
    payload = {"user_id": user_id, **row}
    rows = _data(db.table("learner_preferences").upsert(payload).execute())
    return rows[0] if rows else payload


def list_concepts(db: Client) -> list[dict]:
    """Reference read via user JWT (concepts are readable by authenticated)."""
    return _data(
        db.table("concepts")
        .select("id,name,asset_class,level,summary")
        .order("name")
        .execute()
    )


def get_mastery_rows(db: Client, user_id: str) -> list[dict]:
    return _data(
        db.table("concept_mastery")
        .select("concept_id,mastery,confidence,attempts,correct,box,next_review_at,misconceptions,last_reviewed_at")
        .eq("user_id", user_id)
        .execute()
    )


def upsert_mastery(db: Client, user_id: str, concept_id: str, fields: dict) -> dict:
    payload = {"user_id": user_id, "concept_id": concept_id, **fields}
    rows = _data(db.table("concept_mastery").upsert(payload).execute())
    return rows[0] if rows else payload


def insert_mastery_event(db: Client, row: dict) -> None:
    db.table("mastery_events").insert(row).execute()


def create_session(db: Client, row: dict) -> dict:
    rows = _data(db.table("quiz_sessions").insert(row).execute())
    if not rows:
        raise ApiError("session_create_failed", "Could not create quiz session", 500, True)
    return rows[0]


def get_session(db: Client, user_id: str, session_id: str) -> dict | None:
    rows = _data(
        db.table("quiz_sessions")
        .select("*")
        .eq("id", session_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return rows[0] if rows else None


def update_session(db: Client, session_id: str, fields: dict) -> dict:
    rows = _data(db.table("quiz_sessions").update(fields).eq("id", session_id).execute())
    return rows[0] if rows else fields


def insert_questions(db: Client, rows: list[dict]) -> list[dict]:
    if not rows:
        return []
    return _data(db.table("quiz_questions").insert(rows).execute())


def get_question(db: Client, user_id: str, question_id: str) -> dict | None:
    rows = _data(
        db.table("quiz_questions")
        .select("*")
        .eq("id", question_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return rows[0] if rows else None


def update_question(db: Client, question_id: str, fields: dict) -> dict:
    rows = _data(db.table("quiz_questions").update(fields).eq("id", question_id).execute())
    return rows[0] if rows else fields


def list_session_questions(db: Client, session_id: str, statuses: list[str] | None = None) -> list[dict]:
    q = db.table("quiz_questions").select("*").eq("session_id", session_id).order("sequence")
    if statuses:
        q = q.in_("status", statuses)
    return _data(q.execute())


def ready_count(db: Client, session_id: str) -> int:
    rows = list_session_questions(db, session_id, statuses=["ready", "current"])
    return len(rows)


def next_sequence(db: Client, session_id: str) -> int:
    rows = _data(
        db.table("quiz_questions")
        .select("sequence")
        .eq("session_id", session_id)
        .order("sequence", desc=True)
        .limit(1)
        .execute()
    )
    return (rows[0]["sequence"] + 1) if rows else 1


def insert_attempt(db: Client, row: dict) -> dict:
    rows = _data(db.table("quiz_attempts").insert(row).execute())
    if not rows:
        raise ApiError("attempt_create_failed", "Could not save answer", 500, True)
    return rows[0]


def get_attempt_for_question(db: Client, question_id: str) -> dict | None:
    rows = _data(
        db.table("quiz_attempts").select("*").eq("question_id", question_id).limit(1).execute()
    )
    return rows[0] if rows else None


def update_attempt(db: Client, attempt_id: str, fields: dict) -> dict:
    rows = _data(db.table("quiz_attempts").update(fields).eq("id", attempt_id).execute())
    return rows[0] if rows else fields


def recent_attempts(db: Client, user_id: str, limit: int = 12) -> list[dict]:
    return _data(
        db.table("quiz_attempts")
        .select("id,question_id,session_id,observed,score,submitted_at,answer")
        .eq("user_id", user_id)
        .order("submitted_at", desc=True)
        .limit(limit)
        .execute()
    )


def recent_question_meta(db: Client, user_id: str, limit: int = 20) -> list[dict]:
    return _data(
        db.table("quiz_questions")
        .select("id,format,concept_ids,custom_topic,status,created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )


def pop_current_or_next_ready(db: Client, session_id: str) -> dict | None:
    """Return current question, or promote the earliest ready one to current."""
    current = list_session_questions(db, session_id, statuses=["current"])
    if current:
        return current[0]
    ready = list_session_questions(db, session_id, statuses=["ready"])
    if not ready:
        return None
    q = ready[0]
    return update_question(db, q["id"], {"status": "current"})
