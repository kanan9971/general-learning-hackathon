"""User-JWT paper book rows (RLS: own portfolios / lots / fills)."""
from __future__ import annotations

from supabase import Client

from ..errors import ApiError


def _data(res) -> list[dict]:
    return res.data or []


def get_book(db: Client, user_id: str) -> dict | None:
    rows = _data(
        db.table("portfolios").select("*").eq("user_id", user_id).eq("kind", "paper").limit(1).execute()
    )
    return rows[0] if rows else None


def insert_book(db: Client, row: dict) -> dict:
    rows = _data(db.table("portfolios").insert(row).execute())
    if not rows:
        raise ApiError("paper_create_failed", "Could not create paper book", 500, True)
    return rows[0]


def update_book(db: Client, book_id: str, fields: dict) -> dict:
    rows = _data(db.table("portfolios").update(fields).eq("id", book_id).execute())
    return rows[0] if rows else fields


def list_lots(db: Client, portfolio_id: str) -> list[dict]:
    return _data(db.table("paper_lots").select("*").eq("portfolio_id", portfolio_id).execute())


def upsert_lot(db: Client, row: dict) -> dict:
    rows = _data(db.table("paper_lots").upsert(row).execute())
    return rows[0] if rows else row


def delete_lot(db: Client, lot_id: str) -> None:
    db.table("paper_lots").delete().eq("id", lot_id).execute()


def insert_fill(db: Client, row: dict) -> dict:
    rows = _data(db.table("paper_fills").insert(row).execute())
    if not rows:
        raise ApiError("paper_fill_failed", "Could not record the paper fill", 500, True)
    return rows[0]


def list_fills(db: Client, user_id: str) -> list[dict]:
    return _data(
        db.table("paper_fills").select("*").eq("user_id", user_id).order("filled_at", desc=True).execute()
    )


def get_fill(db: Client, user_id: str, fill_id: str) -> dict | None:
    rows = _data(
        db.table("paper_fills").select("*").eq("id", fill_id).eq("user_id", user_id).limit(1).execute()
    )
    return rows[0] if rows else None


def update_fill(db: Client, fill_id: str, fields: dict) -> dict:
    rows = _data(db.table("paper_fills").update(fields).eq("id", fill_id).execute())
    return rows[0] if rows else fields
