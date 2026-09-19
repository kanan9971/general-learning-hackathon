"""Hybrid retrieval: SQL does vector + full-text + RRF (match_chunks); Python applies
metadata boosts, per-document diversity and the sufficiency threshold."""
import math
from dataclasses import dataclass
from datetime import datetime, timezone

from supabase import Client

from ..db import knowledge
from ..llm.embed import embed_query

LEVEL_NUM = {"beginner": 1, "intermediate": 2, "advanced": 3}
RRF_K = 60
MIN_SIMILARITY = 0.50   # calibrated 2026-09-19: on-topic queries 0.67-0.91, off-topic 0.26-0.40
MIN_CHUNKS = 2
MAX_PER_DOC = 3


@dataclass
class RetrievedChunk:
    chunk_id: str
    document_id: str
    section_path: str | None
    content: str
    concept_ids: list[str]
    difficulty: int | None
    trust_level: int
    published_at: str | None
    layer: str
    similarity: float
    rrf_score: float
    score: float = 0.0
    title: str = ""
    publisher: str = ""
    source_url: str | None = None
    content_type: str | None = None


@dataclass
class Retrieval:
    chunks: list[RetrievedChunk]
    considered: int
    top_similarity: float | None
    sufficient: bool


def max_difficulty_for(level: str) -> int:
    """Learners see content up to one step above their level (papers are difficulty 3)."""
    return min(3, LEVEL_NUM.get(level, 1) + 1)


def score_chunk(c: RetrievedChunk, *, level: str, focus: set[str], now: datetime | None = None) -> float:
    base = c.rrf_score / (2.0 / (RRF_K + 1))          # 1.0 = rank 1 in both lists
    s = 0.5 * base + 0.5 * c.similarity
    if focus and focus.intersection(c.concept_ids):
        s += 0.10                                       # learner's weak / target concept
    s += 0.05 * (4 - c.trust_level) / 3                 # official > internal > news
    s -= 0.10 * max(0, (c.difficulty or 1) - LEVEL_NUM.get(level, 1))
    if c.layer == "market" and c.published_at:
        age_h = ((now or datetime.now(timezone.utc)) - datetime.fromisoformat(c.published_at)).total_seconds() / 3600
        s += 0.10 * math.exp(-max(0.0, age_h) / 48)
    return s


def rank(chunks: list[RetrievedChunk], *, level: str, focus: set[str], k: int) -> list[RetrievedChunk]:
    for c in chunks:
        c.score = score_chunk(c, level=level, focus=focus)
    out, per_doc = [], {}
    for c in sorted(chunks, key=lambda c: -c.score):
        if per_doc.get(c.document_id, 0) >= MAX_PER_DOC:
            continue
        per_doc[c.document_id] = per_doc.get(c.document_id, 0) + 1
        out.append(c)
        if len(out) == k:
            break
    # After papers land, RRF can fill top-k with research and drop the lesson that
    # actually teaches the concept. Keep one lesson in the window when one cleared the bar.
    lesson_candidates = [c for c in sorted(chunks, key=lambda c: -c.score) if c.content_type == "lesson"]
    if lesson_candidates and out and all(c.content_type != "lesson" for c in out):
        lesson = lesson_candidates[0]
        if per_doc.get(lesson.document_id, 0) < MAX_PER_DOC:
            displaced = out[-1]
            per_doc[displaced.document_id] = per_doc.get(displaced.document_id, 1) - 1
            per_doc[lesson.document_id] = per_doc.get(lesson.document_id, 0) + 1
            out[-1] = lesson
    return out


def select_top(chunks: list[RetrievedChunk], *, level: str, focus: set[str], k: int) -> list[RetrievedChunk]:
    """Filter by similarity first, then take k. Ranking-then-filter can starve top-k."""
    strong = [c for c in chunks if c.similarity >= MIN_SIMILARITY]
    return rank(strong, level=level, focus=focus, k=k)


def retrieve(db: Client, query: str, *, layer: str | None = "foundation", concept_ids: list[str] | None = None,
             level: str = "beginner", focus_concepts: list[str] | None = None,
             published_after: str | None = None, published_before: str | None = None, k: int = 5,
             query_hint: str | None = None) -> Retrieval:
    # Documents were embedded as "{section_path}\\n{content}" (`Title > Section` then prose).
    embed_text = f"{query_hint}\n{query}" if query_hint else query
    emb = embed_query(embed_text)
    rows = knowledge.match_chunks(
        db, embedding=emb, text=query, layer=layer, concept_ids=concept_ids,
        max_difficulty=max_difficulty_for(level),
        published_after=published_after, published_before=published_before,
    )
    docs = knowledge.get_documents(db, [r["document_id"] for r in rows])
    chunks = []
    for r in rows:
        d = docs.get(r["document_id"], {})
        chunks.append(RetrievedChunk(
            chunk_id=r["id"], document_id=r["document_id"], section_path=r.get("section_path"),
            content=r["content"], concept_ids=r.get("concept_ids") or [], difficulty=r.get("difficulty"),
            trust_level=r.get("trust_level") or 4, published_at=r.get("published_at"), layer=r["layer"],
            similarity=float(r["similarity"]), rrf_score=float(r["rrf_score"]),
            title=d.get("title", r["document_id"]), publisher=d.get("publisher") or "",
            source_url=d.get("source_url"), content_type=d.get("content_type"),
        ))
    top = select_top(chunks, level=level, focus=set(focus_concepts or concept_ids or []), k=k)
    return Retrieval(
        chunks=top, considered=len(rows),
        top_similarity=max((c.similarity for c in chunks), default=None),
        sufficient=len(top) >= MIN_CHUNKS,
    )
