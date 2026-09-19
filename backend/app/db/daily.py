"""User-JWT data access for learning cycles and daily sessions (RLS: own rows only)."""
from __future__ import annotations

from supabase import Client


def _rows(res) -> list[dict]:
    return res.data or []


def get_active_cycle(db: Client, user_id: str) -> dict | None:
    r = _rows(db.table("learning_cycles").select("*").eq("user_id", user_id).eq("is_active", True)
              .order("created_at", desc=True).limit(1).execute())
    return r[0] if r else None


def deactivate_cycles(db: Client, user_id: str) -> None:
    db.table("learning_cycles").update({"is_active": False}).eq("user_id", user_id).eq("is_active", True).execute()


def insert_cycle(db: Client, row: dict) -> None:
    db.table("learning_cycles").insert(row).execute()


def list_sessions(db: Client, user_id: str, since: str) -> list[dict]:
    return _rows(db.table("daily_sessions").select("*").eq("user_id", user_id)
                 .gte("session_date", since).order("session_date").execute())


def upsert_session(db: Client, row: dict) -> None:
    db.table("daily_sessions").upsert(row, on_conflict="user_id,session_date").execute()
