"""Writes for the knowledge base (documents/chunks). Service-role callers only."""
from supabase import Client

_VERSIONING: bool | None = None


def _vec(v: list[float]) -> str:
    return "[" + ",".join(f"{x:.7f}" for x in v) + "]"


def supports_chunk_versioning(db: Client) -> bool:
    """True after migration 0008 (chunks.version + activate_document_version)."""
    global _VERSIONING
    if _VERSIONING is not None:
        return _VERSIONING
    try:
        db.table("chunks").select("id,version").limit(1).execute()
        _VERSIONING = True
    except Exception:  # noqa: BLE001 - PostgREST errors when the column is absent
        _VERSIONING = False
    return _VERSIONING


def document_checksum(db: Client, doc_id: str) -> str | None:
    rows = db.table("documents").select("checksum").eq("id", doc_id).limit(1).execute().data or []
    return rows[0].get("checksum") if rows else None


def document_chunk_count(db: Client, doc_id: str) -> int:
    r = db.table("chunks").select("id", count="exact").eq("document_id", doc_id).limit(1).execute()
    return r.count or 0


def _chunk_rows(chunks: list[dict], extra: dict | None = None) -> list[dict]:
    extra = extra or {}
    rows = []
    for c in chunks:
        row = {
            **c,
            "content": (c.get("content") or "").replace("\x00", ""),
            "embedding": _vec(c["embedding"]),
            **extra,
        }
        rows.append(row)
    return rows


def upsert_document(db: Client, doc: dict, chunks: list[dict]) -> str:
    """Versioned upsert when 0008 is applied. Otherwise insert new documents only — never
    delete existing chunks (that would invalidate stored cited_chunk_ids).
    Returns skipped|inserted|updated."""
    if not chunks:
        raise ValueError(f"{doc['id']}: no chunks to store")
    existing = (
        db.table("documents").select("id,checksum,version").eq("id", doc["id"]).limit(1).execute().data
        or []
    )
    old = existing[0] if existing else None
    existing_chunks = document_chunk_count(db, doc["id"]) if old else 0
    if old and old.get("checksum") == doc.get("checksum") and existing_chunks:
        return "skipped"

    if not supports_chunk_versioning(db):
        if old and existing_chunks:
            return "skipped"
        db.table("documents").upsert(doc).execute()
        rows = _chunk_rows(chunks)
        for i in range(0, len(rows), 50):
            db.table("chunks").insert(rows[i : i + 50]).execute()
        return "inserted"

    new_version = int(old["version"] if old and old.get("version") is not None else 0) + 1
    meta = {k: v for k, v in doc.items() if k not in ("checksum", "version")}
    if old:
        db.table("documents").update(meta).eq("id", doc["id"]).execute()
    else:
        db.table("documents").insert(
            {**meta, "version": new_version, "checksum": None, "is_active": True}
        ).execute()

    db.table("chunks").delete().eq("document_id", doc["id"]).eq("version", new_version).eq(
        "is_active", False
    ).execute()
    rows = _chunk_rows(chunks, {"version": new_version, "is_active": False})
    for i in range(0, len(rows), 50):
        db.table("chunks").insert(rows[i : i + 50]).execute()

    db.rpc(
        "activate_document_version",
        {"p_document_id": doc["id"], "p_version": new_version, "p_checksum": doc["checksum"]},
    ).execute()
    return "updated" if old else "inserted"


# ---- Reads (reference data only; never user-owned tables) ----

def match_chunks(db: Client, *, embedding: list[float], text: str, layer: str | None,
                 concept_ids: list[str] | None, max_difficulty: int,
                 published_after: str | None = None, published_before: str | None = None,
                 match_count: int = 20) -> list[dict]:
    return db.rpc("match_chunks", {
        "query_embedding": _vec(embedding), "query_text": text, "p_layer": layer,
        "p_concepts": concept_ids, "p_max_difficulty": max_difficulty,
        "p_published_after": published_after, "p_published_before": published_before,
        "match_count": match_count,
    }).execute().data or []


def get_documents(db: Client, ids: list[str]) -> dict[str, dict]:
    if not ids:
        return {}
    rows = db.table("documents").select(
        "id,title,publisher,source_url,content_type,published_at,trust_level"
    ).in_("id", list(set(ids))).execute().data or []
    return {r["id"]: r for r in rows}


def get_concept(db: Client, concept_id: str) -> dict | None:
    rows = db.table("concepts").select("id,name,level,summary").eq("id", concept_id).limit(1).execute().data
    return rows[0] if rows else None


def get_chunk(db: Client, chunk_id: str) -> dict | None:
    rows = db.table("chunks").select(
        "id,document_id,section_path,content,is_active,injection_flag"
    ).eq("id", chunk_id).limit(1).execute().data
    return rows[0] if rows else None


def log_llm_call(db: Client, row: dict) -> None:
    """Best-effort audit row; never fails the request."""
    try:
        db.table("llm_calls").insert(row).execute()
    except Exception:  # noqa: BLE001 - audit must not break the user flow
        pass
