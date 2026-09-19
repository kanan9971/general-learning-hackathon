"""Markets feed: deterministic math, parsing, tagging, guards and the offline (demo) feed."""
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.llm.client import LLMError
from app.main import create_app
from app.market import ranking, snapshot
from app.market.facts import to_move
from app.market.providers.base import Quote
from app.market.providers.treasury import parse_curve_csv, quotes_from_rows
from app.market.providers import yahoo
from app.market.providers.yahoo import parse_chart, parse_ohlc
from app.market.universe import INSTRUMENTS, Instrument
from app.news.classify import classify
from app.news.feeds import Feed
from app.news.rss import parse_feed
from app.portfolio.attribution import attribute
from app.schemas.ai import MarketSectionLLM
from app.services import markets as svc

SEED = Path(__file__).resolve().parents[3] / "supabase" / "seed" / "concepts.sql"


def test_attribution_sums_to_portfolio_return():
    a = attribute([("A", 10), ("B", 30), ("C", 5)], {"A": (100.0, 2.0), "B": (50.0, -1.0)}, {"A": "Tech"})
    assert a is not None
    assert abs(sum(c.contribution_pct for c in a.contributions) - a.portfolio_return_pct) < 1e-3
    assert {c.symbol for c in a.contributions} == {"A", "B"}  # C has no price -> excluded, weights renormalised
    assert abs(sum(c.weight for c in a.contributions) - 1) < 1e-3
    assert a.sectors == {"Tech": 0.4, "Other": 0.6}


def test_attribution_none_without_prices():
    assert attribute([("A", 1)], {}, {}) is None


def test_moves_units_and_ranking():
    y = to_move(Quote("UST2Y", 4.76, 4.67, 4.65, "2026-09-18", "treasury"),
                Instrument("UST2Y", "2Y", "macro", "yield", "treasury", "%"))
    s = to_move(Quote("SMH", 101.5, 100.0, None, "2026-09-18", "yahoo"),
                Instrument("SMH", "Semis", "sectors", "sector_etf"))
    assert (y.change, y.change_unit, y.change_5d) == (9.0, "bp", 11.0)
    assert (s.change, s.change_unit, s.change_5d) == (1.5, "%", None)
    ranked = ranking.rank([s, y])
    assert ranked[0].symbol == "UST2Y" and ranked[0].unusual  # 9bp / 6bp typical beats 1.5% / 1.3%


def test_treasury_csv_and_curve_spread():
    csv_text = 'Date,"3 Mo","2 Yr","5 Yr","10 Yr","30 Yr"\n09/18/2026,4.14,4.76,4.86,5.01,5.34\n09/17/2026,4.12,4.67,4.78,4.94,5.29\n'
    q = quotes_from_rows(parse_curve_csv(csv_text))
    assert q["UST10Y"].last == 5.01 and q["UST10Y"].prev == 4.94
    assert q["US2S10S"].last == 25.0 and q["US2S10S"].prev == 27.0


def test_yahoo_chart_parse_skips_null_closes():
    payload = {"chart": {"result": [{"timestamp": [1, 2, 3], "indicators": {"quote": [{"close": [10.0, None, 11.0]}]}}]}}
    q = parse_chart("X", payload)
    assert q and (q.last, q.prev) == (11.0, 10.0)
    assert parse_chart("X", {"chart": {"result": None}}) is None


def test_yahoo_ohlc_parse_skips_null_closes():
    payload = {"chart": {"result": [{"timestamp": [1, 2, 3], "indicators": {"quote": [{
        "open": [10.0, None, 11.0], "high": [10.5, None, 11.5], "low": [9.5, None, 10.5],
        "close": [10.0, None, 11.0], "volume": [100, None, 200],
    }]}}]}}
    bars = parse_ohlc(payload)
    assert [(b.t, b.close, b.volume) for b in bars] == [(1, 10.0, 100.0), (3, 11.0, 200.0)]
    assert parse_ohlc({"chart": {"result": None}}) == []


def test_aggregate_four_hour_buckets():
    from app.market.history import aggregate
    from app.market.providers.base import Candle
    a = Candle(100, 10, 11, 9, 10.5, 1)
    b = Candle(3700, 10.5, 12, 10, 11, 2)
    c = Candle(15000, 11, 11.2, 10.8, 11.1, 3)
    out = aggregate([a, b, c], 14400)
    assert len(out) == 2
    assert (out[0].open, out[0].high, out[0].low, out[0].close, out[0].volume) == (10, 12, 9, 11, 3)
    assert out[1].open == 11


def test_history_demo_uses_golden_not_network(demo_client, monkeypatch):
    from app.market import history
    from app.market.providers.base import Candle
    monkeypatch.setattr(history, "get_settings", lambda: Settings(data_mode="demo"))

    async def no_network(*a, **k):
        raise AssertionError("demo mode must not call providers")
    monkeypatch.setattr(yahoo, "fetch_ohlc", no_network)

    bars = [Candle(1_700_000_000 + i * 86400, 10 + i, 11 + i, 9 + i, 10.5 + i, 100) for i in range(40)]
    monkeypatch.setattr(history, "load_golden_charts", lambda: {
        "series": {"AAPL": {"1d": {"bars": [[b.t, b.open, b.high, b.low, b.close, b.volume] for b in bars]}}},
    })
    history.reset_cache()
    r = demo_client.get("/v1/markets/history", params={"symbol": "AAPL", "timeframe": "1Y"})
    assert r.status_code == 200
    d = r.json()
    assert d["data_mode"] == "demo" and d["source"] == "golden" and d["timeframe"] == "1Y"
    assert d["candles"][0]["open"] == 10
    assert d["candles"][-1]["close"] == 49.5
    assert all("close" in c and "high" in c for c in d["candles"])


def test_history_rejects_bad_symbol(demo_client, monkeypatch):
    from app.market import history
    monkeypatch.setattr(history, "get_settings", lambda: Settings(data_mode="demo"))
    r = demo_client.get("/v1/markets/history", params={"symbol": "$$$", "timeframe": "1M"})
    assert r.status_code == 400
    assert r.json()["code"] == "invalid_request"


RSS = """<?xml version="1.0"?><rss><channel>
<item><title>Apple &amp; suppliers rally</title><link>https://ex.com/a</link><description><![CDATA[<p>iPhone demand</p>]]></description>
<pubDate>Fri, 18 Sep 2026 21:43:00 GMT</pubDate></item>
<item><title>Save 65% on a power station</title><link>https://ex.com/ad</link><description>deal</description></item>
<item><title>no link</title></item>
</channel></rss>"""


def test_rss_parse_filters_ticker_noise():
    items = parse_feed(RSS, Feed("u", "Yahoo Finance", "ticker", ("companies",), ticker="AAPL"))
    assert [h.title for h in items] == ["Apple & suppliers rally"]
    assert items[0].summary == "iPhone demand" and items[0].published_at.startswith("2026-09-18T21:43")
    assert parse_feed("<not xml", Feed("u", "WSJ", "wsj")) == []


def test_classify_sections_and_concepts():
    sec, tick, concepts = classify("Fed raises rates as inflation stays hot; 2-year yield jumps", "")
    assert {"macro", "rates"} <= set(sec) and "rate-expectations" in concepts and not tick
    sec, _, _ = classify("A billion-dollar bet on data centers", "")
    assert "fx" not in sec
    sec, tick, _ = classify("Nvidia earnings beat estimates", "")
    assert tick == ["NVDA"] and "companies" in sec


def test_number_guard_strips_llm_numbers():
    out = svc.strip_numbers("Yields rose 9bp to 4.76% while oil hit $100 and the S&P gained 0.2 percent in 2026.")
    assert not re.search(r"\d+(\.\d+)?\s?(%|bp|percent)|\$\d", out)
    assert "2026" in out  # years are not market numbers


def test_guide_concepts_exist_in_seed():
    seeded = set(re.findall(r"\('([a-z0-9-]+)'", SEED.read_text()))
    assert set(svc.allowed_concepts()) <= seeded
    assert [g.id for g in svc.guide().sections] == [
        "macro", "rates", "fx", "commodities", "equities", "sectors", "companies", "portfolio",
        "desk", "valuation", "risk"]
    known = {i.symbol for i in INSTRUMENTS} | {"DAL"}  # DAL is a held company, fetched by the lab itself
    assert all(r.cause in known and r.effect in known for r in svc.guide().relationships)
    for g in svc.guide().sections:  # every section teaches: idea, rules, mistakes, interview questions
        assert g.mental_model and len(g.rules) >= 2 and g.mistakes and g.interview


def test_validate_explanation_drops_unknown_ids():
    raw = MarketSectionLLM.model_validate({
        "summary": "Yields rose 10bp.", "chain": [{"from_": "a", "to": "b", "why": "c"}] * 2,
        "drivers": [{"explanation": "x", "fact_ids": ["UST2Y.chg.1d", "FAKE"], "headline_ids": ["H1", "H9"]}],
        "desk_views": [{"strategy": "s", "rationale": "r", "risk": "k"}], "confidence": "low",
        "confidence_reason": "r", "concept_ids": ["yield-curve", "made-up"],
    })
    h = svc.Headline(id="n1", title="t", url="https://x", publisher="WSJ")
    e = svc.validate_explanation(raw, {"UST2Y.chg.1d"}, {"H1": h}, {"yield-curve"})
    assert e.drivers[0].fact_ids == ["UST2Y.chg.1d"] and e.drivers[0].headline_ids == ["n1"]
    assert e.concept_ids == ["yield-curve"] and "10bp" not in e.summary


@pytest.fixture
def demo_client():
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(data_mode="demo", auth_dev_bypass=True)
    get_settings.cache_clear()
    yield TestClient(app)
    get_settings.cache_clear()


def test_feed_demo_mode_is_offline_and_complete(demo_client, monkeypatch):
    monkeypatch.setattr(snapshot, "get_settings", lambda: Settings(data_mode="demo"))
    monkeypatch.setattr(svc, "get_settings", lambda: Settings(data_mode="demo"))

    async def no_network(*a, **k):
        raise AssertionError("demo mode must not call providers")
    monkeypatch.setattr(snapshot, "fetch_live", no_network)
    monkeypatch.setattr(svc, "fetch_feeds", no_network)

    r = demo_client.get("/v1/markets/feed", params={"interests": "fx", "watch": "aapl,$$$"})
    assert r.status_code == 200
    d = r.json()
    assert d["data_mode"] == "demo" and d["sections"][0]["id"] == "fx" and d["sections"][0]["pinned"]
    assert len(d["sections"]) == 11 and d["primer"]["steps"]
    port = next(s for s in d["sections"] if s["id"] == "portfolio")
    assert port["attribution"] is not None


def test_explain_falls_back_without_llm(demo_client, monkeypatch):
    monkeypatch.setattr(snapshot, "get_settings", lambda: Settings(data_mode="demo"))
    monkeypatch.setattr(svc, "get_settings", lambda: Settings(data_mode="demo"))

    def boom(*a, **k):
        raise LLMError("down")
    monkeypatch.setattr(svc, "generate", boom)
    r = demo_client.post("/v1/markets/sections/rates/explain", json={"level": "beginner"})
    assert r.status_code == 200
    d = r.json()
    assert d["generated_by"] == "fallback" and d["explanation"]["desk_views"] and d["explanation"]["chain"]
    assert demo_client.post("/v1/markets/sections/nope/explain", json={}).status_code == 422


def test_overview_flags_points_without_valid_evidence():
    from app.schemas.ai import MarketOverviewLLM
    raw = MarketOverviewLLM.model_validate({
        "headline": "Yields up 9bp", "summary": "s",
        "key_points": [
            {"section_id": "rates", "point": "2Y up", "explanation": "e", "fact_ids": ["UST2Y.chg.1d"], "headline_ids": ["H1"]},
            {"section_id": "fx", "point": "Dollar up", "explanation": "e", "fact_ids": ["FAKE"], "headline_ids": ["H7"]},
            {"section_id": "macro", "point": "p", "explanation": "e"},
        ],
        "connections": [{"from_": "a", "to": "b", "why": "c", "fact_ids": ["UST2Y.chg.1d", "X"]}] * 2,
        "desk_views": [{"desk": "Rates", "strategy": "s", "rationale": "r", "risk": "k"}],
        "confidence": "medium", "confidence_reason": "r", "concept_ids": ["yield-curve", "nope"],
    })
    h = svc.Headline(id="n1", title="t", url="https://x", publisher="WSJ")
    o = svc.validate_overview(raw, {"UST2Y.chg.1d"}, {"H1": h}, {"yield-curve"})
    assert [p.supported for p in o.key_points] == [True, False, False]
    assert o.key_points[0].evidence.headline_ids == ["n1"] and o.key_points[1].evidence.fact_ids == []
    assert o.connections[0].fact_ids == ["UST2Y.chg.1d"] and o.concept_ids == ["yield-curve"]
    assert "9bp" not in o.headline


def test_overview_falls_back_with_evidence_offline(demo_client, monkeypatch):
    monkeypatch.setattr(snapshot, "get_settings", lambda: Settings(data_mode="demo"))
    monkeypatch.setattr(svc, "get_settings", lambda: Settings(data_mode="demo"))

    def boom(*a, **k):
        raise LLMError("down")
    monkeypatch.setattr(svc, "generate", boom)
    r = demo_client.post("/v1/markets/overview", json={"level": "beginner", "interests": ["rates"]})
    assert r.status_code == 200
    d = r.json()
    facts = {m["fact_id"] for m in d["moves"]}
    assert d["generated_by"] == "fallback" and d["data_mode"] == "demo" and d["overview"]["key_points"]
    for p in d["overview"]["key_points"]:  # every fallback point cites a real fact
        assert p["supported"] and set(p["evidence"]["fact_ids"]) <= facts


# ---------- Market Lab ----------
from app.learning import market_lab as lab  # noqa: E402


def _mv(symbol, section, change, unit="%", asset="equity_index", label=None):
    return ranking.rank([to_move(
        Quote(symbol, 100 * (1 + change / 100) if unit == "%" else 4.0 + change / 100, 100.0 if unit == "%" else 4.0,
              None, "2026-09-18", "yahoo"),
        Instrument(symbol, label or symbol, section, asset, "yahoo" if unit == "%" else "treasury"))])[0]


def _moves(**chg):
    return {
        "UST10Y": _mv("UST10Y", "rates", chg.get("y", 7), "bp", "yield", "10Y Treasury"),
        "TLT": _mv("TLT", "rates", chg.get("tlt", -0.65), asset="stock", label="Long bond ETF"),
        "XLK": _mv("XLK", "sectors", chg.get("tech", 0.8), asset="sector_etf", label="Technology"),
    }


def _pool(moves):
    return lab.build_pool(moves, svc.guide(), "2026-09-18")


def test_lab_predict_answer_follows_cause_direction_and_flips():
    up = {i.public.id: i for i in _pool(_moves(y=7)) if i.public.kind == "predict"}
    tlt_up = next(i for i in up.values() if "Long bond ETF" in i.public.prompt)
    assert tlt_up.correct == "down" and tlt_up.reveal.followed is True  # yields up -> bond prices down, and it did
    dn = next(i for i in _pool(_moves(y=-7, tlt=0.7)) if i.public.kind == "predict" and "Long bond ETF" in i.public.prompt)
    assert dn.correct == "up" and dn.reveal.followed is True  # the rule flips when the cause falls


def test_lab_flags_surprise_and_skips_flat_effect_and_weak_cause():
    items = _pool(_moves(y=7, tech=0.8))  # tech ROSE with yields: textbook says fall -> surprise
    tech = next(i for i in items if i.public.kind == "predict" and "Technology" in i.public.prompt)
    assert tech.reveal.followed is False and tech.public.surprise and tech.correct == "down"
    assert any(i.public.kind == "explain" and i.public.surprise for i in items)
    flat = _pool(_moves(y=7, tech=0.01))
    assert not any(i.public.kind == "explain" and "Technology" in i.public.prompt for i in flat)  # flat: nothing to explain
    assert not any("10Y Treasury" in i.public.prompt and i.public.kind == "predict" for i in _pool(_moves(y=0.5)))


def test_lab_public_questions_never_carry_the_answer_key():
    for i in _pool(_moves()):
        dumped = i.public.model_dump_json()
        assert '"correct"' not in dumped and '"reveal"' not in dumped and "model_answer" not in dumped
        assert not i.public.facts or all(f.fact_id for f in i.public.facts)


def test_lab_driver_and_chain_are_well_formed_and_checked():
    items = _pool(_moves())
    driver = next(i for i in items if i.public.kind == "driver")
    assert len(driver.public.options) == 4 and len({o.text for o in driver.public.options}) == 4
    wrong = next(o.id for o in driver.public.options if o.id != driver.correct)
    assert lab.check(driver, driver.correct).correct and not lab.check(driver, wrong).correct
    chain = next(i for i in items if i.public.kind == "chain")
    shown = [x.id for x in chain.public.items]
    assert shown != chain.correct and sorted(shown) == sorted(chain.correct)
    assert lab.check(chain, chain.correct).observed == "correct"
    assert lab.check(chain, list(reversed(chain.correct))).observed in ("incorrect", "partial")
    assert lab.check(next(i for i in items if i.public.kind == "explain"), "x") is None  # LLM-graded


def test_lab_select_mix_and_section_filter():
    pool = _pool(_moves())
    picked = lab.select(pool, "beginner", 5)
    assert len(picked) == 5 and len({i.public.id for i in picked}) == 5
    order = [lab.KIND_ORDER[i.public.kind] for i in picked]
    assert order == sorted(order)  # predictions first, written explanations last
    rates_only = lab.build_pool(_moves(), svc.guide(), "d", "rates")
    assert rates_only and all(i.public.section_id in ("rates", "sectors") for i in rates_only)


def test_lab_api_offline_roundtrip(demo_client, monkeypatch):
    monkeypatch.setattr(snapshot, "get_settings", lambda: Settings(data_mode="demo"))
    r = demo_client.post("/v1/markets/lab", json={"level": "beginner", "count": 6})
    assert r.status_code == 200
    qs = r.json()["questions"]
    assert len(qs) == 6 and not any("correct" in q or "reveal" in q for q in qs)
    p = next(q for q in qs if q["kind"] == "predict")
    fb = demo_client.post("/v1/markets/lab/answer", json={"question_id": p["id"], "answer": "up"}).json()
    assert fb["graded_by"] == "rule" and fb["reveal"]["facts"] and fb["reveal"]["textbook"]
    assert fb["mastery"] and fb["mastery"][0]["concept_id"] in p["concept_ids"]
    gone = demo_client.post("/v1/markets/lab/answer", json={"question_id": "nope", "answer": "up"})
    assert gone.status_code == 409 and gone.json()["code"] == "question_expired"


def test_lab_explain_uses_fallback_without_llm_and_skips_mastery(demo_client, monkeypatch):
    from app.services import markets_lab
    monkeypatch.setattr(snapshot, "get_settings", lambda: Settings(data_mode="demo"))

    def boom(*a, **k):
        raise LLMError("down")
    monkeypatch.setattr(markets_lab, "generate", boom)
    qs = demo_client.post("/v1/markets/lab", json={"level": "advanced", "count": 8}).json()["questions"]
    e = next(q for q in qs if q["kind"] == "explain")
    fb = demo_client.post("/v1/markets/lab/answer", json={"question_id": e["id"], "answer": "Because rates matter."}).json()
    assert fb["graded_by"] == "fallback" and fb["mastery"] == [] and fb["reveal"]["model_answer"]
    short = demo_client.post("/v1/markets/lab/answer", json={"question_id": e["id"], "answer": "ok"})
    assert short.status_code == 422 and short.json()["code"] == "answer_too_short"


# ---------- What-if scenarios ----------
def test_scenario_library_is_well_formed():
    g = svc.guide()
    assert len(g.scenarios) >= 10 and len({sc.id for sc in g.scenarios}) == len(g.scenarios)
    for sc in g.scenarios:
        assert len(sc.effects) >= 3 and len(sc.chain) >= 3 and sc.twist and sc.concept_ids
        known = {i.symbol for i in INSTRUMENTS} | {"DAL"}
        assert all(e.symbol is None or e.symbol in known for e in sc.effects)
    assert any(e.dir == "flat" for sc in g.scenarios for e in sc.effects)  # "little change" is taught too


def test_scenario_question_checks_per_part_with_partial_credit():
    pool = _pool(_moves())
    item = next(i for i in pool if i.public.kind == "scenario" and i.public.title == "The Fed cuts instead of holding")
    assert len(item.public.parts) <= 4 and [o.id for o in item.public.options] == ["up", "down", "flat"]
    key = dict(item.correct)
    assert lab.check(item, key).observed == "correct"
    wrong_one = dict(key); first = next(iter(wrong_one)); wrong_one[first] = "down" if key[first] != "down" else "up"
    v = lab.check(item, wrong_one)
    assert v.observed == "partial" and not v.correct and sum(p.correct for p in v.parts) == len(key) - 1
    assert lab.check(item, {}).observed == "incorrect"
    assert all(p.why for p in v.parts) and item.reveal.chain and "correct" not in item.public.model_dump_json()


def test_flip_scenario_mirrors_todays_move():
    moves = _moves(y=7, tlt=-0.65, tech=-0.8)
    moves["XLU"] = _mv("XLU", "sectors", -1.4, asset="sector_etf", label="Utilities")
    flip = next(i for i in _pool(moves) if i.public.title and "other way" in i.public.title)
    assert "fallen" in flip.public.prompt and [o.id for o in flip.public.options] == ["up", "down"]
    assert set(flip.correct.values()) == {"up"}  # yields down -> bonds, tech, utilities all up
    assert [m.symbol for m in flip.reveal.facts][0] == "UST10Y"  # today's real cause is shown for comparison
    down = _moves(y=-7, tlt=0.7, tech=0.8)
    down["XLU"] = _mv("XLU", "sectors", 1.4, asset="sector_etf", label="Utilities")
    f2 = next(i for i in _pool(down) if i.public.title and "other way" in i.public.title)
    assert "risen" in f2.public.prompt and set(f2.correct.values()) == {"down"}


def test_select_supports_scenario_only_sets_and_level_difficulty():
    pool = _pool(_moves())
    only = lab.select(pool, "beginner", 4, kinds=["scenario"])
    assert len(only) == 4 and {i.public.kind for i in only} == {"scenario"}
    assert all(i.public.difficulty <= 2 for i in only[:2])  # beginners see the easier what-ifs first
    mixed = lab.select(pool, "intermediate", 6)
    assert sum(i.public.kind == "scenario" for i in mixed) >= 2


def test_scenario_quiz_draft_is_a_valid_deterministic_question():
    g = svc.guide()
    mcq = lab.scenario_quiz_draft(g, "gold-real-yields", "mcq", 1)
    assert mcq and mcq.format == "mcq" and mcq.correct_option_id in {o.id for o in mcq.options}
    assert len({o.text for o in mcq.options}) == len(mcq.options) >= 3
    assert lab.scenario_quiz_draft(g, "gold-real-yields", "mcq", 1).prompt == mcq.prompt  # stable
    written = lab.scenario_quiz_draft(g, "oil-drivers", "case_study", 2)
    assert written and written.expected_elements and written.skill == "what_if"
    assert lab.scenario_quiz_draft(g, "no-such-concept", "mcq", 1) is None and lab.scenario_quiz_draft(g, None, "mcq", 1) is None


def test_market_rules_ground_the_quiz_prompt():
    from app.llm.prompts import quiz_question
    from app.market.guide import rules_for_concept
    rules = rules_for_concept("gold-real-yields")
    assert rules and any("Gold" in r for r in rules)
    text = quiz_question.build_user(format="mcq", level="beginner", difficulty=1, concept_id="gold-real-yields",
                                    concept_name="Gold", concept_summary=None, custom_topic=None,
                                    recent_mistakes=[], market_rules=rules)
    assert "Market rules (ground truth" in text and "WHAT-IF" in quiz_question.SYSTEM


def test_lab_api_scenario_roundtrip(demo_client, monkeypatch):
    monkeypatch.setattr(snapshot, "get_settings", lambda: Settings(data_mode="demo"))
    qs = demo_client.post("/v1/markets/lab", json={"level": "beginner", "count": 3, "kinds": ["scenario"]}).json()["questions"]
    assert qs and all(q["kind"] == "scenario" and q["parts"] for q in qs)
    q = qs[0]
    fb = demo_client.post("/v1/markets/lab/answer", json={"question_id": q["id"],
                                                          "answer": {p["id"]: "up" for p in q["parts"]}}).json()
    assert fb["graded_by"] == "rule" and len(fb["reveal"]["parts"]) == len(q["parts"])
    assert all(p["picked"] == "up" for p in fb["reveal"]["parts"]) and fb["mastery"]
