"""Writes for the knowledge base (documents/chunks). Service-role callers only."""
from supabase import Client


def _vec(v: list[float]) -> str:
    return "[" + ",".join(f"{x:.7f}" for x in v) + "]"


def upsert_document(db: Client, doc: dict, chunks: list[dict]) -> None:
    """Replace a document and its chunks atomically enough for ingest: upsert doc, delete old chunks, insert new."""
    db.table("documents").upsert(doc).execute()
    db.table("chunks").delete().eq("document_id", doc["id"]).execute()
    rows = [{**c, "embedding": _vec(c["embedding"])} for c in chunks]
    for i in range(0, len(rows), 50):
        db.table("chunks").insert(rows[i : i + 50]).execute()


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
