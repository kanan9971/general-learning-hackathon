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
from app.market.providers.yahoo import parse_chart
from app.market.universe import Instrument
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
        "macro", "rates", "fx", "commodities", "equities", "sectors", "companies", "portfolio"]


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
    assert len(d["sections"]) == 8 and d["primer"]["steps"]
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
