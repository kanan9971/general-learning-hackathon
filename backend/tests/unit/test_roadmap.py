"""Personalised roadmap + adaptive placement quiz."""
import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.learning import roadmap as rm
from app.main import create_app
from app.market import snapshot
from app.market.guide import load_guide
from app.services import markets_lab
from app.services import quiz as quiz_service

G = load_guide()


def _mastery(**by_section):
    """{section: (mastery, attempts)} applied to every concept of that section."""
    out = {}
    for sec, (m, a) in by_section.items():
        for c in next(s for s in G.sections if s.id == sec).concept_ids:
            out[c] = (m, a)
    return out


def _by_id(road):
    return {n.id: n for n in road.nodes}


def test_tree_is_well_formed():
    ids = [d.id for d in G.roadmap]
    assert len(ids) == len(set(ids))
    tier = {d.id: d.tier for d in G.roadmap}
    for d in G.roadmap:
        assert all(r in tier and tier[r] < d.tier for r in d.requires)  # prerequisites sit above
        if d.section_id:
            assert any(s.id == d.section_id for s in G.sections)


def test_new_learner_starts_at_the_top_and_is_told_to_take_placement():
    road = rm.build_roadmap(G, {}, "beginner")
    assert road.needs_placement and road.next_id == "connect" and road.mastered_count == 0
    assert "placement" in road.rationale.lower()
    assert "interview" not in _by_id(road)  # advanced-only nodes are hidden for beginners
    assert not any(n.collapsed or n.test_out for n in road.nodes)


def test_weak_spot_is_pulled_forward_and_strength_is_collapsed_for_intermediate():
    m = {**_mastery(macro=(0.8, 1), rates=(0.2, 1), fx=(0.8, 1))}
    road = rm.build_roadmap(G, m, "intermediate")
    n = _by_id(road)
    assert n["macro"].state == "mastered" and n["macro"].collapsed
    assert n["rates"].state == "priority" and n["rates"].recommended and road.next_id == "rates"
    assert n["fx"].state == "mastered"
    assert "Weak on Rates & bonds" in road.rationale and "Strong on" in road.rationale
    assert n["valuation"].test_out  # tier 2: intermediate learners may test out up to tier 2
    assert not n["equities"].test_out and not n["sectors"].test_out  # tier 3+ must be learned


def test_late_topics_need_two_proofs_and_advanced_sees_extra_nodes():
    one = rm.build_roadmap(G, _mastery(sectors=(0.85, 1)), "advanced")
    assert _by_id(one)["sectors"].state == "in_progress" and "one more good set" in (_by_id(one)["sectors"].hint or "")
    two = rm.build_roadmap(G, _mastery(sectors=(0.85, 2)), "advanced")
    assert _by_id(two)["sectors"].state == "mastered"
    assert {"interview", "crossasset"} <= set(_by_id(one))


def test_prerequisite_hint_never_locks():
    road = rm.build_roadmap(G, _mastery(macro=(0.5, 1)), "beginner")
    fx = _by_id(road)["fx"]
    assert fx.state == "not_started" and fx.hint == "Builds on: Rates & bonds"
    assert road.next_id in {n.id for n in road.nodes}  # every node stays reachable; hints only


def test_placement_staircase_and_level():
    assert rm.next_difficulty([]) == 1
    assert rm.next_difficulty(["correct", "correct", "correct", "correct"]) == 3
    assert rm.next_difficulty(["incorrect", "incorrect"]) == 1 and rm.next_difficulty(["correct", "incorrect"]) == 1
    assert [rm.placement_level(p) for p in (10, 50, 90)] == ["beginner", "intermediate", "advanced"]


@pytest.fixture
def client(monkeypatch):
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(data_mode="demo", auth_dev_bypass=True, quiz_use_memory=True)
    get_settings.cache_clear()
    monkeypatch.setattr(snapshot, "get_settings", lambda: Settings(data_mode="demo"))
    monkeypatch.setattr(quiz_service, "get_settings", lambda: Settings(data_mode="demo", auth_dev_bypass=True, quiz_use_memory=True))
    from app.db.memory_quiz import STORE
    STORE.mastery.clear()
    STORE.preferences.clear()
    yield TestClient(app)
    STORE.mastery.clear()
    STORE.preferences.clear()
    get_settings.cache_clear()


def _run_placement(client, right: bool):
    keys = {i.public.id: i.correct for i in markets_lab.placement_pool()}
    hist = []
    while True:
        st = client.post("/v1/roadmap/placement/next", json={"history": hist}).json()
        if st["done"]:
            return st
        q = st["question"]
        assert q["kind"] in ("driver", "chain", "scenario") and q["section_id"] == rm.PLACEMENT_TOPICS[st["index"]]
        good = keys[q["id"]]
        if right:
            ans = good
        elif isinstance(good, dict):
            ans = {k: ("up" if v == "down" else "down") for k, v in good.items()}
        elif isinstance(good, list):
            ans = list(reversed(good))
        else:
            ans = "zzz"
        fb = client.post("/v1/markets/lab/answer", json={"question_id": q["id"], "answer": ans, "placement": True}).json()
        hist.append({"question_id": q["id"], "observed": fb["observed"]})


def test_placement_end_to_end_reshapes_the_roadmap(client):
    before = client.get("/v1/roadmap", params={"level": "beginner"}).json()
    assert before["needs_placement"] and before["mastered_count"] == 0

    strong = _run_placement(client, right=True)
    assert strong["done"] and strong["level"] == "advanced" and strong["percent"] == 100 and len(strong["topics"]) == 9
    road = client.get("/v1/roadmap", params={"level": strong["level"]}).json()
    assert not road["needs_placement"] and road["mastered_count"] >= 6
    assert road["next_id"] in ("companies", "risk", "portfolio", "interview", "crossasset")
    assert any(n["collapsed"] for n in road["nodes"])
    progress = client.get("/v1/learn/progress").json()
    assert progress["level"] == "advanced"
    prefs = client.get("/v1/quiz/preferences").json()
    assert prefs["preferences"]["level"] == "advanced"


def test_weak_placement_makes_priorities_and_focus_concepts(client):
    weak = _run_placement(client, right=False)
    assert weak["level"] == "beginner" and weak["percent"] == 0 and weak["focus_concept_ids"]
    assert client.get("/v1/learn/progress").json()["level"] == "beginner"
    road = client.get("/v1/roadmap", params={"level": "beginner"}).json()
    assert road["mastered_count"] == 0 and any(n["state"] == "priority" for n in road["nodes"])
    assert [n for n in road["nodes"] if n["recommended"]][0]["state"] == "priority"


def test_placement_rejects_unknown_history(client):
    r = client.post("/v1/roadmap/placement/next", json={"history": [{"question_id": "nope", "observed": "correct"}]})
    assert r.status_code == 409 and r.json()["code"] == "question_expired"
