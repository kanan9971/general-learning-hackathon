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
