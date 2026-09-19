"""Paper classroom: cash-by-level, session calendar, simulated fills (offline)."""
from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.db.memory_quiz import STORE
from app.llm.client import LLMError
from app.main import create_app
from app.market import snapshot
from app.portfolio import paper_math as math
from app.services import paper as paper_svc


def test_starting_cash_and_gates():
    assert math.starting_cash("beginner") == 10_000
    assert math.starting_cash("intermediate") == 50_000
    assert math.starting_cash("advanced") == 100_000
    assert math.allowed_sides("beginner") == {"buy", "sell"}
    assert "short" in math.allowed_sides("intermediate")
    assert math.allowed_ticket_kinds("beginner") == {"market"}
    assert math.allowed_ticket_kinds("intermediate") == {"market", "limit", "stop"}
    assert math.options_allowed("advanced") and not math.options_allowed("beginner")
    assert not math.custom_tickers_allowed("beginner")
    assert math.custom_tickers_allowed("intermediate")
    assert math.is_paper_equity("NFLX") and not math.is_paper_equity("^GSPC") and not math.is_paper_equity("CL=F")


def test_analysis_unlocks_on_the_next_us_session_not_24h():
    fri = datetime(2026, 9, 18, 20, 0, tzinfo=timezone.utc)  # 16:00 ET Friday
    sat = datetime(2026, 9, 19, 20, 0, tzinfo=timezone.utc)
    mon = datetime(2026, 9, 21, 14, 0, tzinfo=timezone.utc)
    assert math.session_date(fri) == date(2026, 9, 18)
    assert math.next_open(date(2026, 9, 18)) == date(2026, 9, 21)
    assert not math.analysis_ready(fri, sat)
    assert math.analysis_ready(fri, mon)
    # Thanksgiving 2026 is Thursday 26 Nov — next session is Friday 27.
    assert math.next_open(date(2026, 11, 25)) == date(2026, 11, 27)


def test_limit_and_stop_through():
    assert math.limit_through("buy", last=100, limit=101)
    assert not math.limit_through("buy", last=100, limit=99)
    assert math.limit_through("sell", last=100, limit=99)
    assert math.stop_through("sell", last=99, stop=100)
    assert not math.stop_through("sell", last=101, stop=100)


def test_option_mark_is_positive_and_call_rises_with_spot():
    expiry, as_of = date(2026, 10, 16), date(2026, 9, 18)
    low = math.option_mark(spot=100, strike=100, expiry=expiry, as_of=as_of, call=True, vol=0.25)
    high = math.option_mark(spot=110, strike=100, expiry=expiry, as_of=as_of, call=True, vol=0.25)
    put = math.option_mark(spot=100, strike=100, expiry=expiry, as_of=as_of, call=False, vol=0.25)
    assert low >= 0.01 and high > low and put >= 0.01


@pytest.fixture
def client(monkeypatch):
    st = Settings(data_mode="demo", auth_dev_bypass=True, quiz_use_memory=True, vercel="")
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: st
    get_settings.cache_clear()
    monkeypatch.setattr(snapshot, "get_settings", lambda: Settings(data_mode="demo"))
    monkeypatch.setattr(paper_svc, "get_settings", lambda: st)
    STORE.reset()
    paper_svc.reset_store()
    yield TestClient(app)
    STORE.reset()
    paper_svc.reset_store()
    get_settings.cache_clear()


def _frozen(monkeypatch, when: datetime):
    monkeypatch.setattr(paper_svc, "_now", lambda: when)


def test_get_book_creates_cash_from_level(client):
    r = client.get("/v1/portfolio", params={"level": "beginner"})
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "paper" and body["cash_usd"] == 10000 and body["starting_cash"] == 10000
    assert body["allowed_sides"] == ["buy", "sell"]
    assert "market" in body["allowed_ticket_kinds"] and "limit" not in body["allowed_ticket_kinds"]
    assert not body["options_allowed"]
    assert not body["custom_tickers_allowed"]
    # Creating again does not top up cash.
    r2 = client.get("/v1/portfolio", params={"level": "advanced"}).json()
    assert r2["cash_usd"] == 10000 and r2["level"] == "beginner"


def test_market_buy_then_sell_updates_cash_and_lots(client, monkeypatch):
    _frozen(monkeypatch, datetime(2026, 9, 18, 20, 0, tzinfo=timezone.utc))
    client.get("/v1/portfolio", params={"level": "beginner"})
    bought = client.post("/v1/portfolio/orders", json={
        "symbol": "AAPL", "side": "buy", "quantity": 2, "ticket_kind": "market", "level": "beginner",
    })
    assert bought.status_code == 200, bought.text
    fill = bought.json()["fill"]
    book = bought.json()["book"]
    assert fill["status"] == "filled" and fill["symbol"] == "AAPL"
    assert book["cash_usd"] < 10000
    assert any(l["symbol"] == "AAPL" and l["quantity"] == 2 for l in book["lots"])
    sold = client.post("/v1/portfolio/orders", json={
        "symbol": "AAPL", "side": "sell", "quantity": 2, "ticket_kind": "market",
    }).json()
    assert sold["book"]["lots"] == []
    assert sold["book"]["cash_usd"] == pytest.approx(10000, abs=0.5)


def test_beginner_cannot_short_or_limit(client):
    client.get("/v1/portfolio", params={"level": "beginner"})
    short = client.post("/v1/portfolio/orders", json={"symbol": "AAPL", "side": "short", "quantity": 1})
    assert short.status_code == 400 and short.json()["code"] == "level_gated"
    limit = client.post("/v1/portfolio/orders", json={
        "symbol": "AAPL", "side": "buy", "quantity": 1, "ticket_kind": "limit", "limit_price": 1,
    })
    assert limit.status_code == 400 and limit.json()["code"] == "level_gated"


def test_unknown_symbol_and_insufficient_cash(client):
    client.get("/v1/portfolio", params={"level": "beginner"})
    bad = client.post("/v1/portfolio/orders", json={"symbol": "NOTATICKER", "side": "buy", "quantity": 1})
    assert bad.status_code == 400 and bad.json()["code"] == "unknown_symbol"
    huge = client.post("/v1/portfolio/orders", json={"symbol": "AAPL", "side": "buy", "quantity": 1_000_000})
    assert huge.status_code == 400 and huge.json()["code"] == "insufficient_cash"


def test_custom_ticker_is_level_gated(client):
    client.get("/v1/portfolio", params={"level": "beginner"})
    beginner = client.post("/v1/portfolio/orders", json={"symbol": "NFLX", "side": "buy", "quantity": 1})
    assert beginner.status_code == 400 and beginner.json()["code"] == "unknown_symbol"
    paper_svc.reset_store()
    book = client.get("/v1/portfolio", params={"level": "intermediate"}).json()
    assert book["custom_tickers_allowed"]
    futures = client.post("/v1/portfolio/orders", json={
        "symbol": "CL=F", "side": "buy", "quantity": 1, "level": "intermediate",
    })
    assert futures.status_code == 400 and futures.json()["code"] == "unknown_symbol"
    # Demo day has no NFLX print, so a valid custom ticker still needs a classroom price.
    missing = client.post("/v1/portfolio/orders", json={
        "symbol": "NFLX", "side": "buy", "quantity": 1, "level": "intermediate",
    })
    assert missing.status_code == 409 and missing.json()["code"] == "no_price"


def test_working_limit_can_be_cancelled(client, monkeypatch):
    _frozen(monkeypatch, datetime(2026, 9, 18, 20, 0, tzinfo=timezone.utc))
    client.get("/v1/portfolio", params={"level": "intermediate"})
    r = client.post("/v1/portfolio/orders", json={
        "symbol": "AAPL", "side": "buy", "quantity": 1, "ticket_kind": "limit",
        "limit_price": 0.01, "level": "intermediate",
    })
    assert r.status_code == 200, r.text
    fill = r.json()["fill"]
    assert fill["status"] == "working"
    cancelled = client.post(f"/v1/portfolio/orders/{fill['id']}/cancel")
    assert cancelled.status_code == 200
    row = next(f for f in cancelled.json()["fills"] if f["id"] == fill["id"])
    assert row["status"] == "cancelled"


def test_analysis_locked_until_next_session_then_fallback(client, monkeypatch):
    fri = datetime(2026, 9, 18, 20, 0, tzinfo=timezone.utc)
    sat = datetime(2026, 9, 19, 20, 0, tzinfo=timezone.utc)
    mon = datetime(2026, 9, 21, 14, 0, tzinfo=timezone.utc)
    _frozen(monkeypatch, fri)
    client.get("/v1/portfolio", params={"level": "beginner"})
    client.post("/v1/portfolio/orders", json={"symbol": "AAPL", "side": "buy", "quantity": 1, "ticket_kind": "market"})
    _frozen(monkeypatch, sat)
    too_soon = client.post("/v1/portfolio/analysis")
    assert too_soon.status_code == 409 and too_soon.json()["code"] == "analysis_too_soon"
    _frozen(monkeypatch, mon)

    def boom(*_a, **_k):
        raise LLMError("down")

    monkeypatch.setattr(paper_svc.structured, "generate", boom)
    ok = client.post("/v1/portfolio/analysis")
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["analysis"]["status"] == "fallback"
    assert body["facts"] and body["analysis"]["points"]
    assert "buy" not in body["analysis"]["summary"].lower() or "not recommend" in body["analysis"]["summary"].lower()


def test_advanced_listed_option_debits_premium(client, monkeypatch):
    _frozen(monkeypatch, datetime(2026, 9, 18, 20, 0, tzinfo=timezone.utc))
    book = client.get("/v1/portfolio", params={"level": "advanced"}).json()
    assert book["cash_usd"] == 100000 and book["options_allowed"] and book["listed_options"]
    opt = book["listed_options"][0]
    r = client.post("/v1/portfolio/orders", json={
        "symbol": opt["underlying"], "side": "buy", "quantity": 1, "ticket_kind": "market",
        "instrument_kind": "option", "option_right": opt["right"],
        "option_strike": opt["strike"], "option_expiry": opt["expiry"], "level": "advanced",
    })
    assert r.status_code == 200, r.text
    after = r.json()["book"]
    assert after["cash_usd"] < 100000
    lot = next(l for l in after["lots"] if l["kind"] == "option")
    assert lot["symbol"] == opt["underlying"] and lot["quantity"] == 1
