"""Unit tests for adaptive quiz selection, mastery, seals, and API smoke."""
import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.db.memory_quiz import STORE
from app.learning.adaptive import ConceptState, select_targets
from app.learning.mastery import apply_observation, clamp01, difficulty_for_mastery
from app.learning.seals import seal_option, verify_option
from app.llm.fallbacks.quiz import fallback_question
from app.main import create_app
from app.schemas.quiz import QuizQuestionPublic, StartSessionResponse


@pytest.fixture(autouse=True)
def _memory_quiz(monkeypatch):
    STORE.reset()
    monkeypatch.setenv("QUIZ_USE_MEMORY", "true")
    monkeypatch.setenv("AUTH_DEV_BYPASS", "true")
    get_settings.cache_clear()

    def settings():
        return Settings(auth_dev_bypass=True, quiz_use_memory=True, vercel="")

    monkeypatch.setattr("app.config.get_settings", settings)
    monkeypatch.setattr("app.services.quiz.get_settings", settings)
    monkeypatch.setattr("app.deps.get_settings", settings)
    yield
    STORE.reset()
    get_settings.cache_clear()


def test_mastery_bounds_and_deltas():
    r = apply_observation(0.95, "correct")
    assert r["mastery_after"] == 1.0
    r2 = apply_observation(0.05, "incorrect")
    assert r2["mastery_after"] == 0.0
    assert clamp01(1.5) == 1.0


def test_difficulty_for_mastery():
    assert difficulty_for_mastery(0.2, "beginner") == 1
    assert difficulty_for_mastery(0.8, "beginner") == 2
    assert difficulty_for_mastery(0.8, "advanced") >= 2


def test_select_targets_prefers_mistakes_and_respects_formats():
    mastery = [
        ConceptState(concept_id="real-yields", mastery=0.2),
        ConceptState(concept_id="cpi-surprise", mastery=0.8),
    ]
    targets = select_targets(
        formats=["mcq", "short_answer"],
        preferred_concept_ids=["cpi-surprise"],
        custom_topics=["carry trade"],
        mastery=mastery,
        recent_concept_ids=[],
        recent_mistake_ids=["real-yields", "real-yields"],
        level="intermediate",
        n=3,
    )
    assert len(targets) == 3
    assert {t.format for t in targets} <= {"mcq", "short_answer"}
    assert any(t.custom_topic == "carry trade" for t in targets) or any(
        t.concept_id == "real-yields" for t in targets
    )


def test_hmac_seal_roundtrip():
    seal = seal_option("secret", "q1", "a")
    assert verify_option("secret", "q1", "a", seal)
    assert not verify_option("secret", "q1", "b", seal)


def test_fallback_all_formats_no_answer_leak_in_public_shape():
    for fmt in ("mcq", "case_study", "short_answer", "analysis"):
        q = fallback_question(format=fmt, concept_id="bond-price-yield", custom_topic=None, difficulty=1)
        assert q.format == fmt
        if fmt == "mcq":
            assert q.correct_option_id
            # Public model must not include correct_option_id
            pub = QuizQuestionPublic(
                id="x",
                sequence=1,
                format="mcq",
                difficulty=1,
                concept_ids=["bond-price-yield"],
                prompt=q.prompt,
                options=[{"id": o.id, "text": o.text} for o in q.options],
            )
            dumped = pub.model_dump()
            assert "correct_option_id" not in dumped
            assert all("correct" not in o for o in dumped["options"])


def test_quiz_session_flow_save_before_grade(monkeypatch):
    # Force fallback generation (no live LLM)
    def boom(*args, **kwargs):
        raise RuntimeError("no llm")

    monkeypatch.setattr("app.llm.structured.generate", boom)

    client = TestClient(create_app())
    r = client.post(
        "/v1/quiz/sessions",
        json={"formats": ["mcq"], "concept_ids": ["bond-price-yield"], "custom_topics": []},
    )
    assert r.status_code == 200, r.text
    body = StartSessionResponse.model_validate(r.json())
    assert body.queue_depth == 3
    assert body.question.format == "mcq"
    assert body.question.options
    # No answer key on the wire
    assert "correct_option_id" not in r.json()["question"]

    qid = body.question.id
    # Pick wrong then check feedback reveals after grade
    wrong = next(o.id for o in body.question.options)
    # Submit — answer must persist even if grading path is fallback
    ans = client.post(
        f"/v1/quiz/sessions/{body.session.id}/answers",
        json={"question_id": qid, "answer": {"option_id": wrong}},
    )
    assert ans.status_code == 200, ans.text
    data = ans.json()
    assert data["feedback"]["observed"] in ("correct", "incorrect")
    assert "attempt_id" in data
    assert data["session"]["answered_count"] == 1

    refill = client.post(f"/v1/quiz/sessions/{body.session.id}/refill")
    assert refill.status_code == 200
    assert refill.json()["queue_depth"] <= 3

    end = client.post(f"/v1/quiz/sessions/{body.session.id}/end")
    assert end.status_code == 200
    assert end.json()["answered_count"] == 1


def test_preferences_and_progress_endpoints(monkeypatch):
    monkeypatch.setattr("app.llm.structured.generate", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("x")))
    client = TestClient(create_app())
    r = client.put(
        "/v1/quiz/preferences",
        json={
            "preferred_formats": ["mcq", "analysis"],
            "preferred_concept_ids": ["cpi-surprise"],
            "custom_topics": ["basis trading"],
            "level": "intermediate",
        },
    )
    assert r.status_code == 200, r.text
    assert "basis trading" in r.json()["preferences"]["custom_topics"]

    g = client.get("/v1/quiz/preferences")
    assert g.status_code == 200
    assert any(t["id"] == "bond-price-yield" for t in g.json()["available_topics"])

    p = client.get("/v1/learn/progress")
    assert p.status_code == 200
    assert p.json()["level"] in ("beginner", "intermediate", "advanced")


def test_refill_idempotent_cap(monkeypatch):
    monkeypatch.setattr("app.llm.structured.generate", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("x")))
    client = TestClient(create_app())
    start = client.post("/v1/quiz/sessions", json={"formats": ["short_answer"]}).json()
    sid = start["session"]["id"]
    r1 = client.post(f"/v1/quiz/sessions/{sid}/refill").json()
    r2 = client.post(f"/v1/quiz/sessions/{sid}/refill").json()
    assert r1["queue_depth"] <= 3
    assert r2["queue_depth"] <= 3
    assert r2["added"] == 0
