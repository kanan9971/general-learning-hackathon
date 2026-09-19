"""Live RAG eval: hit@3, MRR@5, sufficient rate, guardrails.

Run from repo root or backend:
  cd backend && PYTHONPATH=. python ../evals/run_evals.py
"""
from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(BACKEND))

from cases import case_runnable, hit_at_k, load_cases, mrr_at_k  # noqa: E402
from app.db.client import service_client  # noqa: E402
from app.rag.retrieve import retrieve  # noqa: E402


def available_docs(db) -> set[str]:
    rows = db.table("documents").select("id").eq("is_active", True).execute().data or []
    return {r["id"] for r in rows}


def run_case(db, case: dict):
    r = retrieve(
        db,
        case["query"],
        layer=case.get("layer_expected") or "foundation",
        level=case["learner_level"],
        k=5,
        query_hint=case.get("query_hint"),
        focus_concepts=case.get("expected_concepts") or None,
    )
    return r


def guardrail_failures(case: dict, r) -> list[str]:
    fails = []
    guards = set(case.get("guardrails") or [])
    if "foundation_only" in guards and any(c.layer != "foundation" for c in r.chunks):
        fails.append("market_chunk_on_foundation_query")
    if "no_research" in guards and any(c.content_type == "research" for c in r.chunks):
        fails.append("research_chunk_at_beginner")
    if any(getattr(c, "injection_flag", False) for c in r.chunks):
        fails.append("injection_flag_leaked")
    return fails


def main() -> int:
    cases = load_cases()
    db = service_client()
    docs = available_docs(db)
    print(f"KB documents: {len(docs)}")

    hits, mrrs, suff = [], [], []
    skipped = 0
    failures: list[str] = []
    kinds = Counter()

    for case in cases:
        kinds[case["kind"]] += 1
        if not case_runnable(case, docs):
            skipped += 1
            print(f"SKIP {case['id']} (missing {case.get('requires_any')})")
            continue
        r = run_case(db, case)
        gfail = guardrail_failures(case, r)
        top_ids = [c.document_id for c in r.chunks[:3]]
        sim = None if r.top_similarity is None else round(r.top_similarity, 3)

        if case["kind"] == "hit":
            ok = hit_at_k(r.chunks, case["expected_doc_ids"], 3)
            hits.append(ok)
            mrrs.append(mrr_at_k(r.chunks, case["expected_doc_ids"], 5))
            suff.append(r.sufficient)
            if not ok:
                failures.append(f"hit@3 {case['id']}: got {top_ids}")
        elif case["kind"] == "insufficient":
            if r.sufficient:
                failures.append(f"insufficient {case['id']}: sufficient=True ids={top_ids}")
        if gfail:
            failures.append(f"guardrail {case['id']}: {gfail}")

        mark = "OK" if case["id"] not in "".join(failures) and not gfail else "FAIL"
        print(
            f"{mark:4} {case['id']:32} kind={case['kind']:12} "
            f"suff={r.sufficient} sim={sim} considered={r.considered} top={top_ids}"
        )

    n_hit = len(hits)
    hit_rate = (sum(hits) / n_hit) if n_hit else 0.0
    mrr = (sum(mrrs) / n_hit) if n_hit else 0.0
    suff_rate = (sum(suff) / n_hit) if n_hit else 0.0
    print()
    print(f"cases={len(cases)} skipped={skipped} kinds={dict(kinds)}")
    print(f"hit@3={hit_rate:.2%} ({sum(hits)}/{n_hit})  MRR@5={mrr:.3f}  sufficient={suff_rate:.2%}")
    if failures:
        print("failures:")
        for f in failures:
            print(" -", f)
        return 1
    if n_hit and hit_rate < 0.80:
        print("hit@3 below 80% gate")
        return 1
    print("PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
