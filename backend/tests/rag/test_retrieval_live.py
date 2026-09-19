"""Live retrieval eval against the stored KB (embeddings API + Supabase). Run: pytest -m rag"""
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.rag

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "evals"))

from cases import case_runnable, hit_at_k, load_cases  # noqa: E402


@pytest.fixture(scope="module")
def db():
    from app.db.client import service_client
    return service_client()


@pytest.fixture(scope="module")
def cases():
    return load_cases()


@pytest.fixture(scope="module")
def available_doc_ids(db) -> set[str]:
    rows = db.table("documents").select("id").eq("is_active", True).execute().data or []
    return {r["id"] for r in rows}


def _retrieve(db, case):
    from app.rag.retrieve import retrieve
    return retrieve(
        db,
        case["query"],
        layer=case.get("layer_expected") or "foundation",
        level=case["learner_level"],
        k=5,
        query_hint=case.get("query_hint"),
        focus_concepts=case.get("expected_concepts") or None,
    )


def test_hit_at_3(db, cases, available_doc_ids):
    runnable = [
        c for c in cases
        if c["kind"] == "hit" and case_runnable(c, available_doc_ids) and c.get("expected_doc_ids")
    ]
    assert runnable, "no hit cases were runnable against the current KB"
    hits = []
    for case in runnable:
        r = _retrieve(db, case)
        hits.append(hit_at_k(r.chunks, case["expected_doc_ids"], 3))
    assert sum(hits) / len(hits) >= 0.8, list(zip([c["id"] for c in runnable], hits))


def test_beginner_never_gets_research_papers(db, cases):
    beginner = [c for c in cases if c["learner_level"] == "beginner"]
    assert beginner
    for case in beginner:
        r = _retrieve(db, case)
        assert all(c.content_type != "research" for c in r.chunks), case["id"]


def test_misconception_queries_stay_on_foundation(db, cases):
    tagged = [c for c in cases if "foundation_only" in (c.get("guardrails") or [])]
    assert tagged
    for case in tagged:
        r = _retrieve(db, case)
        assert all(c.layer != "market" for c in r.chunks), case["id"]


def test_injection_flagged_chunks_never_retrieved(db, cases):
    # match_chunks filters injection_flag; this asserts the live RPC still does.
    for case in cases[:3]:
        r = _retrieve(db, case)
        assert all(not getattr(c, "injection_flag", False) for c in r.chunks)


@pytest.mark.parametrize("case", [c for c in load_cases() if c["kind"] == "insufficient"])
def test_off_topic_is_insufficient(db, case, available_doc_ids):
    if not case_runnable(case, available_doc_ids):
        pytest.skip("required documents not in KB")
    r = _retrieve(db, case)
    assert not r.sufficient, case["id"]
