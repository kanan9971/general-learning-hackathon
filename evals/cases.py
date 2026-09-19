"""Load retrieval eval cases from evals/rag_cases.yaml."""
from pathlib import Path

import yaml

EVALS_DIR = Path(__file__).resolve().parent
CASES_PATH = EVALS_DIR / "rag_cases.yaml"


def load_cases() -> list[dict]:
    data = yaml.safe_load(CASES_PATH.read_text(encoding="utf-8"))
    cases = data["cases"]
    if len(cases) < 20:
        raise ValueError(f"{CASES_PATH} has only {len(cases)} cases; expected ~24")
    for c in cases:
        for key in ("id", "kind", "query", "learner_level"):
            if key not in c:
                raise ValueError(f"case missing {key}: {c}")
        c.setdefault("layer_expected", "foundation")
        c.setdefault("expected_doc_ids", [])
        c.setdefault("expected_concepts", [])
        c.setdefault("must_not_claim", [])
        c.setdefault("guardrails", [])
        c.setdefault("query_hint", None)
        c.setdefault("requires_any", [])
    return cases


def case_runnable(case: dict, available_doc_ids: set[str]) -> bool:
    need = case.get("requires_any") or []
    return (not need) or any(d in available_doc_ids for d in need)


def hit_at_k(chunks: list, expected_doc_ids: list[str], k: int) -> bool:
    if not expected_doc_ids:
        return False
    top = chunks[:k]
    return any(any(c.document_id.startswith(exp) for exp in expected_doc_ids) for c in top)


def mrr_at_k(chunks: list, expected_doc_ids: list[str], k: int) -> float:
    if not expected_doc_ids:
        return 0.0
    for i, c in enumerate(chunks[:k], start=1):
        if any(c.document_id.startswith(exp) for exp in expected_doc_ids):
            return 1.0 / i
    return 0.0
