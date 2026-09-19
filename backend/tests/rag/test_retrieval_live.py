"""Live retrieval eval against the stored KB (embeddings API + Supabase). Run: pytest -m rag"""
import pytest

pytestmark = pytest.mark.rag

CASES = [
    # (query, level, expected document id prefix, concept filter)
    ("why do bond prices fall when yields rise", "beginner", "lesson-bond-price-yield", None),
    ("nominal versus real yields", "intermediate", "lesson-real-yields", None),
    ("why can higher interest rates hurt growth stocks", "beginner", "lesson-discount-rates-equities", None),
    ("what does an inverted yield curve mean", "beginner", "lesson-yield-curve", None),
    ("why does the market react to CPI versus consensus", "beginner", "lesson-cpi-surprise", None),
    ("how sensitive is a bond price to yield changes", "intermediate", "lesson-duration", None),
    ("why do momentum strategies crash after market rebounds", "advanced", "paper-daniel-moskowitz", None),
    ("does earnings surprise explain price momentum", "advanced", "paper-novy-marx", None),
    ("underreaction newswatchers momentum traders overreaction", "advanced", "paper-hong-stein", None),
    ("liquidity risk priced in momentum returns", "advanced", "paper-sadka", None),
]
OFF_TOPIC = ["recipe for chocolate cake", "who won the football world cup", "why did a small biotech stock jump today"]


@pytest.fixture(scope="module")
def db():
    from app.db.client import service_client
    return service_client()


def test_hit_at_3(db):
    from app.rag.retrieve import retrieve
    hits = []
    for q, level, expected, concepts in CASES:
        r = retrieve(db, q, level=level, concept_ids=concepts, k=3)
        hits.append(any(c.document_id.startswith(expected) for c in r.chunks))
    assert sum(hits) / len(hits) >= 0.8, list(zip([c[0] for c in CASES], hits))


def test_beginner_never_gets_research_papers(db):
    from app.rag.retrieve import retrieve
    r = retrieve(db, "why do momentum strategies crash", level="beginner", k=5)
    assert all(c.content_type != "research" for c in r.chunks)


@pytest.mark.parametrize("q", OFF_TOPIC)
def test_off_topic_is_insufficient(db, q):
    from app.rag.retrieve import retrieve
    assert not retrieve(db, q, level="advanced", k=5).sufficient
