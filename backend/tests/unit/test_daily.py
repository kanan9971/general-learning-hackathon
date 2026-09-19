"""Learning cycle + daily session: pure logic and the API, with the LLM stubbed."""
from datetime import date
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.db.memory_quiz import STORE
from app.learning import cycle as cy
from app.learning import roadmap as rm
from app.llm.client import LLMError
from app.main import create_app
from app.market import snapshot
from app.market.guide import load_guide
from app.schemas.ai import AnalystNoteLLM
from app.services import daily as daily_service
from app.services import quiz as quiz_service

G = load_guide()
NOTE = {k: "A specific answer with a mechanism, the evidence and a caveat written out." for k in ("moved", "evidence", "chain", "affected", "wrong_if")}


def _road(mastery=None, level="beginner"):
    return rm.build_roadmap(G, mastery or {}, level)


def test_beginner_gets_all_eight_phases_and_advanced_skips_what_is_known():
    assert len(cy.plan_phases(G.cycle_phases, _road(), "beginner")) == 8
    known = {c: (0.85, 2) for sec in ("macro", "rates", "desk", "fx", "commodities") for c in next(s for s in G.sections if s.id == sec).concept_ids}
    known.update({c: (0.85, 2) for c in ("rate-expectations", "risk-on-off", "usd-rate-differentials")})
    phases = cy.plan_phases(G.cycle_phases, _road(known, "advanced"), "advanced")
    titles = [p["title"] for p in phases]
    assert "The big picture" not in titles and "Rates & the curve" not in titles
    assert titles[-1] == "Capstone" and len(phases) >= cy.MIN_PHASES and [p["index"] for p in phases] == list(range(len(phases)))


def test_progress_is_counted_in_completed_goal_days_and_stretches():
    phases = cy.plan_phases(G.cycle_phases, _road(), "beginner")
    assert cy.locate(phases, 0) == (0, 0, False) and cy.locate(phases, 7) == (1, 2, False)
    assert cy.locate(phases, 40)[2] is True
    prog = cy.phase_progress(phases, 7, {})
    assert [p.state for p in prog[:3]] == ["done", "current", "upcoming"] and prog[1].days_done == 2


def test_focus_rotates_topics_and_opens_with_a_weak_spot():
    phases = cy.plan_phases(G.cycle_phases, _road(), "beginner")
    p = phases[0]
    assert [cy.focus_for(p, i, _road()) for i in range(2)] == p["topics"][:2]
    weak = _road({"cpi-surprise": (0.2, 1)})  # a concept only the Fed & economy topic teaches
    assert cy.focus_for(p, 0, weak) == "macro" and cy.focus_for(p, 1, weak) == p["topics"][1]


def test_market_day_is_30_to_45_minutes_and_needs_the_analysis_and_practice():
    tasks = cy.build_tasks(True, "Rates & bonds")
    assert 30 <= sum(t.minutes for t in tasks) <= 45 and [t.id for t in tasks] == ["brief", "focus", "analysis", "practice", "review"]
    assert cy.build_tasks(False, "x")[0].id == "recap"

    def with_done(ids):
        ts = cy.build_tasks(True, "x")
        for t in ts:
            t.status = "done" if t.id in ids else "todo"
        return ts
    assert not cy.goal_met(True, with_done({"brief", "focus", "practice", "review"}))  # no shortcut around the note
    assert cy.goal_met(True, with_done({"analysis", "practice"}))
    wk = cy.build_tasks(False, "x")
    for t in wk:
        t.status = "done" if t.id in ("recap", "review") else "todo"
    assert cy.goal_met(False, wk)


def test_streaks_skip_weekends_and_adherence_flags_slipping():
    met = {date(2026, 9, 11), date(2026, 9, 14), date(2026, 9, 15)}  # Fri, Mon, Tue
    assert cy.streaks(met, date(2026, 9, 15)) == (3, 3)  # the weekend does not break it
    assert cy.streaks(met, date(2026, 9, 16))[0] == 3  # today not done yet: still alive
    assert cy.streaks(met, date(2026, 9, 17))[0] == 0  # Wednesday missed
    assert cy.adherence(date(2026, 9, 14), date(2026, 9, 18), 4)[0] == "on_track"
    assert cy.adherence(date(2026, 9, 14), date(2026, 9, 18), 1) == ("slipping", 3)
    assert cy.adherence(date(2026, 9, 7), date(2026, 9, 18), 2)[0] == "behind"


# ---------- API ----------

@pytest.fixture
def client(monkeypatch):
    app = create_app()
    st = Settings(data_mode="demo", auth_dev_bypass=True, quiz_use_memory=True)
    app.dependency_overrides[get_settings] = lambda: st
    get_settings.cache_clear()
    monkeypatch.setattr(snapshot, "get_settings", lambda: Settings(data_mode="demo"))
    for mod in (quiz_service, daily_service):
        monkeypatch.setattr(mod, "get_settings", lambda: st)
    from app.services import markets as markets_service
    monkeypatch.setattr(markets_service, "get_settings", lambda: Settings(data_mode="demo"))
    STORE.reset()
    yield TestClient(app)
    STORE.reset()
    get_settings.cache_clear()


def _llm(monkeypatch, scores):
    def fake(_out, **kw):
        v = AnalystNoteLLM.model_validate({
            "prompt_scores": [{"prompt_id": k, "score": s, "comment": "ok"} for k, s in zip(NOTE, scores)],
            "strengths": ["clear chain"], "gaps": ["cite a headline"], "model_note": "A model note."})
        return SimpleNamespace(value=v, model="m", latency_ms=1, input_tokens=1, output_tokens=1)
    monkeypatch.setattr(daily_service, "generate", fake)


def _day(client, d, level="beginner"):
    return client.get("/v1/daily/today", params={"today": d, "level": level}).json()


def _do(client, d, tid, **body):
    return client.post(f"/v1/daily/tasks/{tid}/complete", json={"today": d, "level": "beginner", **body})


def _full_day(client, d, monkeypatch, scores=(4, 4, 3, 3, 3)):
    _llm(monkeypatch, scores)
    assert _do(client, d, "brief", call="I expect the front end of the curve to lead and tech to lag.").status_code == 200
    _do(client, d, "focus")
    fb = client.post("/v1/daily/analysis", json={"today": d, "level": "beginner", "answers": NOTE}).json()
    _do(client, d, "practice", answered=5, correct=4)
    _do(client, d, "review", watch="CPI on Thursday")
    return fb


def test_a_full_day_hits_the_goal_and_builds_a_streak(client, monkeypatch):
    t = _day(client, "2026-09-14")
    assert t["is_market_day"] and t["phase"]["title"] == "The big picture" and 30 <= t["minutes_planned"] <= 45
    assert t["analysis"]["target"]["label"] and len(t["analysis"]["prompts"]) == 5 and t["analysis"]["headlines"]
    fb = _full_day(client, "2026-09-14", monkeypatch)
    assert fb["passed"] and fb["graded_by"] == "llm" and fb["score"] == round(100 * 17 / 20)  # computed server-side
    t = _day(client, "2026-09-14")
    assert t["goal_met"] and t["streak"] == 1 and t["minutes_done"] == 40 and t["day_number"] == 1


def test_a_weak_note_does_not_count_and_can_be_retried(client, monkeypatch):
    _llm(monkeypatch, (0, 1, 1, 1, 0))
    fb = client.post("/v1/daily/analysis", json={"today": "2026-09-14", "answers": NOTE}).json()
    assert not fb["passed"] and fb["observed"] == "incorrect"
    assert next(x for x in fb["today"]["tasks"] if x["id"] == "analysis")["status"] == "todo"
    _llm(monkeypatch, (3, 3, 3, 3, 3))
    assert client.post("/v1/daily/analysis", json={"today": "2026-09-14", "answers": NOTE}).json()["passed"]


def test_llm_outage_never_blocks_the_day_and_skips_mastery(client, monkeypatch):
    def boom(*a, **k):
        raise LLMError("down")
    monkeypatch.setattr(daily_service, "generate", boom)
    fb = client.post("/v1/daily/analysis", json={"today": "2026-09-14", "answers": NOTE}).json()
    assert fb["graded_by"] == "fallback" and fb["passed"] and fb["model_note"]


def test_validation(client):
    d = "2026-09-14"
    assert _do(client, d, "brief", call="too short").json()["code"] == "answer_too_short"
    assert _do(client, d, "practice", answered=1).json()["code"] == "not_enough_answers"
    assert _do(client, d, "analysis").json()["code"] == "use_analysis_endpoint"
    assert _do(client, d, "nonsense").status_code == 404
    bad = client.post("/v1/daily/analysis", json={"today": d, "answers": {**NOTE, "chain": "x"}})
    assert bad.status_code == 422 and bad.json()["code"] == "answer_too_short"
    assert client.get("/v1/daily/today", params={"today": "not-a-date"}).status_code == 422


def test_missing_days_stretch_the_cycle_instead_of_resetting_it(client, monkeypatch):
    _full_day(client, "2026-09-14", monkeypatch)  # Mon done
    t = _day(client, "2026-09-17")  # Thu, Tue and Wed missed
    assert t["day_number"] == 2 and t["phase"]["index"] == 0  # still on goal day 2 of phase 1
    assert t["streak"] == 0 and t["verdict"] == "slipping" and t["behind_by"] == 2
    cyc = client.get("/v1/daily/cycle", params={"today": "2026-09-17", "level": "beginner"}).json()
    assert cyc["completed_days"] == 1 and cyc["total_days"] == 40 and cyc["best_streak"] == 1
    assert [x["status"] for x in cyc["calendar"][-4:]] == ["met", "missed", "missed", "today"]


def test_five_goal_days_advance_the_phase_and_weekends_do_not_count(client, monkeypatch):
    for d in ("2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"):
        _full_day(client, d, monkeypatch)
    nxt = _day(client, "2026-09-21")  # the following Monday
    assert nxt["phase"]["index"] == 1 and nxt["phase"]["title"] == "Rates & the curve" and nxt["streak"] == 5
    sat = _day(client, "2026-09-19")
    assert not sat["is_market_day"] and [t["id"] for t in sat["tasks"]] == ["recap", "practice", "review"]
    assert sat["analysis"] is None and sat["week"]["days_met"] == 5 and sat["week"]["notes_written"] == 5


def test_restart_creates_a_fresh_cycle_and_keeps_history(client, monkeypatch):
    _full_day(client, "2026-09-14", monkeypatch)
    cyc = client.post("/v1/daily/cycle/restart", params={"today": "2026-09-15", "level": "beginner"}).json()
    assert cyc["completed_days"] == 0 and cyc["started_on"] == "2026-09-15" and cyc["best_streak"] >= 1
