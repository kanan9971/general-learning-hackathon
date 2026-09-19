"""Educational paper book: simulated fills, deterministic marks, optional Grok write-up."""
from __future__ import annotations

import re
from datetime import date, datetime, timezone
from typing import Any

from ..broker import Position
from ..config import Settings, get_settings
from ..db import paper as paper_db
from ..db.client import user_client
from ..db.memory_paper import PAPER, copy, nid
from ..db.memory_quiz import STORE
from ..errors import ApiError
from ..llm import structured
from ..llm.client import LLMError
from ..llm.prompts import paper_analysis as analysis_prompt
from ..market.snapshot import get_snapshot, load_golden
from ..market.universe import company_name, company_sector
from ..news.feeds import ticker_feeds
from ..news.rss import fetch_feeds
from ..portfolio.attribution import attribute
from ..portfolio.paper_math import (
    EQUITY_WHITELIST,
    OPTION_MULTIPLIER,
    OPTION_UNDERLYINGS,
    allowed_sides,
    allowed_ticket_kinds,
    analysis_ready,
    custom_tickers_allowed,
    is_paper_equity,
    limit_through,
    listed_strikes,
    next_monthly_expiry,
    next_open,
    option_mark,
    options_allowed,
    session_date,
    starting_cash,
    stop_through,
)
from ..rag.context import build_news_context
from ..schemas.ai import PaperAnalysisLLM
from ..schemas.markets import Headline, Move
from ..schemas.portfolio import (
    Attribution,
    ListedOption,
    PaperAnalysis,
    PaperAnalysisEvidence,
    PaperAnalysisHeadline,
    PaperAnalysisPoint,
    PaperAnalysisResponse,
    PaperBookResponse,
    PaperFill,
    PaperLot,
    PaperTicketRequest,
    PaperTicketResponse,
    PaperWhitelistItem,
)

NUMBER_CONCEPTS = ["risk-on-off", "priced-in", "discount-rates-equities", "real-yields"]
NUMBER_RX = re.compile(
    r"[-+]?\$?\d[\d,]*(?:\.\d+)?\s?(?:%|bps?\b|basis points?|percent(?:age points?)?|pts\b|points?\b)"
    r"|\$\d[\d,]*(?:\.\d+)?",
    re.IGNORECASE,
)


def strip_numbers(text: str) -> str:
    return NUMBER_RX.sub("(see facts)", text)


def _use_memory(settings: Settings, token: str | None) -> bool:
    if settings.quiz_use_memory or not token:
        return True
    if not settings.supabase_url or not settings.supabase_anon_key:
        return True
    return False


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _level(user_id: str, hint: str | None) -> str:
    prefs = STORE.preferences.get(user_id) or {}
    lvl = hint or prefs.get("level") or "beginner"
    if lvl not in ("beginner", "intermediate", "advanced"):
        return "beginner"
    return lvl


def _whitelist() -> list[PaperWhitelistItem]:
    return [
        PaperWhitelistItem(symbol=s, name=company_name(s), sector=company_sector(s))
        for s in EQUITY_WHITELIST
    ]


def _price_symbols(*extra: str) -> list[str]:
    """Classroom list plus any names already in the book or on this ticket. One snapshot, not a history fetch."""
    return list(dict.fromkeys(
        [s for s in extra if s]
        + list(EQUITY_WHITELIST)
        + ["^VIX"]
        + list(OPTION_UNDERLYINGS)
    ))


_FALLBACK: set[str] = set()


def reset_store() -> None:
    PAPER.reset()
    _FALLBACK.clear()


def _mem(settings: Settings, token: str | None, user_id: str) -> bool:
    return _use_memory(settings, token) or user_id in _FALLBACK


def equity_positions(user_id: str, token: str | None) -> list[Position] | None:
    """For broker/markets: equity lots if a paper book exists, else None (keep the demo book)."""
    s = get_settings()
    book = _get_book(user_id, token, s)
    if not book:
        return None
    lots = _lots(user_id, book["id"], token, s)
    return [
        Position(str(lot["symbol"]), float(lot["quantity"]))
        for lot in lots
        if lot["kind"] == "equity" and float(lot["quantity"]) != 0
    ]


def _get_book(user_id: str, token: str | None, s: Settings) -> dict | None:
    if _mem(s, token, user_id):
        return copy(PAPER.books.get(user_id))
    try:
        return paper_db.get_book(user_client(token), user_id)  # type: ignore[arg-type]
    except Exception:
        _FALLBACK.add(user_id)
        return copy(PAPER.books.get(user_id))


def _save_book(user_id: str, token: str | None, s: Settings, row: dict, insert: bool) -> dict:
    if _mem(s, token, user_id):
        PAPER.books[user_id] = copy(row)
        PAPER.lots.setdefault(user_id, [])
        PAPER.fills.setdefault(user_id, [])
        return copy(row)
    try:
        db = user_client(token)  # type: ignore[arg-type]
        saved = paper_db.insert_book(db, row) if insert else paper_db.update_book(
            db, row["id"], {"cash_usd": row["cash_usd"]}
        )
        return saved
    except Exception:
        _FALLBACK.add(user_id)
        PAPER.books[user_id] = copy(row)
        PAPER.lots.setdefault(user_id, copy(PAPER.lots.get(user_id) or []))
        PAPER.fills.setdefault(user_id, copy(PAPER.fills.get(user_id) or []))
        return copy(row)


def _lots(user_id: str, portfolio_id: str, token: str | None, s: Settings) -> list[dict]:
    if _mem(s, token, user_id):
        return copy(PAPER.lots.get(user_id) or [])
    try:
        return paper_db.list_lots(user_client(token), portfolio_id)  # type: ignore[arg-type]
    except Exception:
        _FALLBACK.add(user_id)
        return copy(PAPER.lots.get(user_id) or [])


def _replace_lots(user_id: str, token: str | None, s: Settings, portfolio_id: str, lots: list[dict]) -> None:
    if _mem(s, token, user_id):
        PAPER.lots[user_id] = copy(lots)
        return
    try:
        db = user_client(token)  # type: ignore[arg-type]
        existing = paper_db.list_lots(db, portfolio_id)
        keep = {r["id"] for r in lots}
        for old in existing:
            if old["id"] not in keep:
                paper_db.delete_lot(db, old["id"])
        for row in lots:
            paper_db.upsert_lot(db, row)
    except Exception:
        _FALLBACK.add(user_id)
        PAPER.lots[user_id] = copy(lots)


def _fills(user_id: str, token: str | None, s: Settings) -> list[dict]:
    if _mem(s, token, user_id):
        return copy(PAPER.fills.get(user_id) or [])
    try:
        return paper_db.list_fills(user_client(token), user_id)  # type: ignore[arg-type]
    except Exception:
        _FALLBACK.add(user_id)
        return copy(PAPER.fills.get(user_id) or [])


def _add_fill(user_id: str, token: str | None, s: Settings, row: dict) -> dict:
    if _mem(s, token, user_id):
        PAPER.fills.setdefault(user_id, []).insert(0, copy(row))
        return copy(row)
    try:
        return paper_db.insert_fill(user_client(token), row)  # type: ignore[arg-type]
    except Exception:
        _FALLBACK.add(user_id)
        PAPER.fills.setdefault(user_id, []).insert(0, copy(row))
        return copy(row)


def _update_fill(user_id: str, token: str | None, s: Settings, fill_id: str, fields: dict) -> dict:
    if _mem(s, token, user_id):
        rows = PAPER.fills.get(user_id) or []
        for i, r in enumerate(rows):
            if r["id"] == fill_id:
                rows[i] = {**r, **fields}
                return copy(rows[i])
        raise ApiError("not_found", "Fill not found", 404)
    try:
        return paper_db.update_fill(user_client(token), fill_id, fields)  # type: ignore[arg-type]
    except Exception:
        _FALLBACK.add(user_id)
        rows = PAPER.fills.get(user_id) or []
        for i, r in enumerate(rows):
            if r["id"] == fill_id:
                rows[i] = {**r, **fields}
                return copy(rows[i])
        raise ApiError("not_found", "Fill not found", 404)


def _ensure_book(user_id: str, token: str | None, level_hint: str | None) -> dict:
    s = get_settings()
    existing = _get_book(user_id, token, s)
    if existing:
        return existing
    level = _level(user_id, level_hint)
    cash = starting_cash(level)
    row = {
        "id": nid(),
        "user_id": user_id,
        "name": "Paper classroom",
        "kind": "paper",
        "is_demo": False,
        "cash_usd": cash,
        "starting_cash": cash,
        "level": level,
    }
    return _save_book(user_id, token, s, row, insert=True)


def _last_and_move(moves: dict[str, Move], symbol: str) -> tuple[float, Move]:
    m = moves.get(symbol)
    if not m:
        raise ApiError("no_price", f"No classroom price for {symbol} right now", 409, True)
    return float(m.level), m


def _as_of_date(snap_as_of: str | None) -> date:
    if not snap_as_of:
        return session_date(_now())
    try:
        return date.fromisoformat(snap_as_of[:10])
    except ValueError:
        return session_date(_now())


def _vol(moves: dict[str, Move]) -> float:
    vix = moves.get("^VIX")
    if vix and vix.level > 0:
        return max(float(vix.level) / 100.0, 0.05)
    return 0.25


def _option_px(moves: dict[str, Move], underlying: str, strike: float, expiry: date,
               right: str, as_of: date) -> float:
    last, _ = _last_and_move(moves, underlying)
    return option_mark(spot=last, strike=strike, expiry=expiry, as_of=as_of,
                       call=right == "call", vol=_vol(moves))


def _lot_key(lot: dict) -> tuple:
    strike = lot.get("option_strike")
    exp = lot.get("option_expiry")
    return (
        lot["kind"], lot["symbol"], lot.get("option_right"),
        float(strike) if strike is not None else None,
        str(exp)[:10] if exp else "",
    )


def _find_lot(lots: list[dict], key: tuple) -> dict | None:
    for lot in lots:
        if _lot_key(lot) == key:
            return lot
    return None


def _apply_equity(lots: list[dict], *, portfolio_id: str, user_id: str, symbol: str,
                  side: str, qty: float, px: float) -> list[dict]:
    key = ("equity", symbol, None, None, "")
    lot = _find_lot(lots, key)
    q = float(lot["quantity"]) if lot else 0.0
    cb = float(lot["cost_basis"]) if lot else 0.0
    if side == "buy":
        new_q = q + qty
        if new_q == 0:
            cb = 0.0
        elif q >= 0:
            cb = (cb * q + px * qty) / new_q if new_q else 0.0
        else:
            cb = cb
    elif side == "cover":
        if q >= 0 or abs(q) < qty - 1e-9:
            raise ApiError("insufficient_shares", "Not enough short shares to cover", 400)
        new_q = q + qty
        cb = 0.0 if abs(new_q) < 1e-9 else cb
    elif side == "sell":
        if q <= 0 or q < qty - 1e-9:
            raise ApiError("insufficient_shares", "Not enough shares to sell", 400)
        new_q = q - qty
        cb = 0.0 if abs(new_q) < 1e-9 else cb
    else:
        if q > 1e-9:
            raise ApiError("insufficient_shares", "Sell the long first, then go short", 400)
        new_q = q - qty
        if q == 0:
            cb = px
        else:
            cb = (cb * abs(q) + px * qty) / abs(new_q)
    if lot:
        lot["quantity"] = new_q
        lot["cost_basis"] = cb
        if abs(new_q) < 1e-9:
            lots = [x for x in lots if x["id"] != lot["id"]]
    elif abs(new_q) > 1e-9:
        lots = lots + [{
            "id": nid(), "portfolio_id": portfolio_id, "user_id": user_id,
            "kind": "equity", "symbol": symbol, "quantity": new_q, "cost_basis": cb,
            "option_right": None, "option_strike": None, "option_expiry": None,
        }]
    return lots


def _apply_option(lots: list[dict], *, portfolio_id: str, user_id: str, symbol: str,
                  side: str, qty: float, px: float, right: str, strike: float, expiry: str) -> list[dict]:
    key = ("option", symbol, right, strike, expiry)
    lot = _find_lot(lots, key)
    q = float(lot["quantity"]) if lot else 0.0
    if side == "buy":
        new_q = q + qty
        cb = ((float(lot["cost_basis"]) * q + px * qty) / new_q) if lot and new_q else px
    elif side == "sell":
        if q < qty - 1e-9:
            raise ApiError("insufficient_shares", "You can only close option lots you already hold", 400)
        new_q = q - qty
        cb = float(lot["cost_basis"]) if lot else 0.0
    else:
        raise ApiError("invalid_request", "Paper options are buy-to-open or sell-to-close only", 400)
    if lot:
        lot["quantity"] = new_q
        lot["cost_basis"] = cb if new_q else 0.0
        if abs(new_q) < 1e-9:
            lots = [x for x in lots if x["id"] != lot["id"]]
    else:
        lots = lots + [{
            "id": nid(), "portfolio_id": portfolio_id, "user_id": user_id,
            "kind": "option", "symbol": symbol, "quantity": new_q, "cost_basis": cb,
            "option_right": right, "option_strike": strike, "option_expiry": expiry,
        }]
    return lots


async def get_book(user_id: str, token: str | None, level_hint: str | None = None) -> PaperBookResponse:
    s = get_settings()
    book = _ensure_book(user_id, token, level_hint)
    await _fill_working(user_id, token, s, book)
    book = _get_book(user_id, token, s) or book
    return await _to_response(user_id, token, s, book)


async def list_fills(user_id: str, token: str | None) -> list[PaperFill]:
    s = get_settings()
    book = _ensure_book(user_id, token, None)
    await _fill_working(user_id, token, s, book)
    now = _now()
    return [_fill_model(f, now) for f in _fills(user_id, token, s)]


async def submit_ticket(user_id: str, token: str | None, req: PaperTicketRequest) -> PaperTicketResponse:
    s = get_settings()
    book = _ensure_book(user_id, token, req.level)
    level = book.get("level") or "beginner"
    qty = float(req.quantity)
    if req.side not in allowed_sides(level):
        raise ApiError("level_gated", "That side is not available at this classroom level", 400)
    if req.ticket_kind not in allowed_ticket_kinds(level):
        raise ApiError("level_gated", "That ticket type is not available at this classroom level", 400)
    symbol = req.symbol.upper().strip()
    if not is_paper_equity(symbol):
        raise ApiError("unknown_symbol", "Paper tickets are stocks and ETFs only (not yields, FX or futures)", 400)
    if symbol not in EQUITY_WHITELIST and not custom_tickers_allowed(level):
        raise ApiError("unknown_symbol", "Beginner tickets stay on the classroom list", 400)
    snap = await get_snapshot(_price_symbols(symbol))
    by_sym = {m.symbol: m for m in snap.moves}
    as_of = _as_of_date(snap.as_of)
    cash = float(book["cash_usd"])
    lots = _lots(user_id, book["id"], token, s)

    if req.instrument_kind == "option":
        if not options_allowed(level):
            raise ApiError("level_gated", "Listed options are an advanced classroom tool", 400)
        if symbol not in OPTION_UNDERLYINGS:
            raise ApiError("unknown_symbol", "That name is not on the listed-option menu", 400)
        if not req.option_right or req.option_strike is None or not req.option_expiry:
            raise ApiError("invalid_request", "Call/put, strike and expiry are required", 400)
        expiry = date.fromisoformat(req.option_expiry)
        px = _option_px(by_sym, symbol, float(req.option_strike), expiry, req.option_right, as_of)
        notional = qty * px * OPTION_MULTIPLIER
        through = True
        if req.ticket_kind == "limit" and req.limit_price is not None:
            through = limit_through(req.side, px, float(req.limit_price))
        elif req.ticket_kind == "stop" and req.limit_price is not None:
            through = stop_through(req.side, px, float(req.limit_price))
        if req.side == "buy" and through and cash + 1e-9 < notional:
            raise ApiError("insufficient_cash", "Not enough paper cash for that premium", 400)
        fill = _new_fill(user_id, book, req, symbol, px if through else None,
                         notional if through else None, "filled" if through else "working",
                         None, as_of, snap.data_mode)
        if through:
            cash = cash - notional if req.side == "buy" else cash + notional
            lots = _apply_option(
                lots, portfolio_id=book["id"], user_id=user_id, symbol=symbol, side=req.side,
                qty=qty, px=px, right=req.option_right, strike=float(req.option_strike),
                expiry=req.option_expiry,
            )
        saved = _commit(user_id, token, s, book, cash, lots, fill)
        book2 = _get_book(user_id, token, s) or book
        return PaperTicketResponse(fill=saved, book=await _to_response(user_id, token, s, book2))

    last, move = _last_and_move(by_sym, symbol)
    through = True
    fill_px = last
    if req.ticket_kind == "limit":
        if req.limit_price is None:
            raise ApiError("invalid_request", "Limit tickets need a limit_price", 400)
        through = limit_through(req.side, last, float(req.limit_price))
        fill_px = float(req.limit_price) if through else last
    elif req.ticket_kind == "stop":
        if req.limit_price is None:
            raise ApiError("invalid_request", "Stop tickets need a trigger price in limit_price", 400)
        through = stop_through(req.side, last, float(req.limit_price))
    notional = qty * fill_px
    if req.side in ("buy", "cover") and through and cash + 1e-9 < notional:
        raise ApiError("insufficient_cash", "Not enough paper cash", 400)
    fill = _new_fill(user_id, book, req, symbol, fill_px if through else None,
                     notional if through else None, "filled" if through else "working",
                     move.fact_id, as_of, snap.data_mode)
    if through:
        cash = cash - notional if req.side in ("buy", "cover") else cash + notional
        lots = _apply_equity(lots, portfolio_id=book["id"], user_id=user_id, symbol=symbol,
                             side=req.side, qty=qty, px=fill_px)
    saved = _commit(user_id, token, s, book, cash, lots, fill)
    book2 = _get_book(user_id, token, s) or book
    return PaperTicketResponse(fill=saved, book=await _to_response(user_id, token, s, book2))


async def cancel_working(user_id: str, token: str | None, fill_id: str) -> PaperBookResponse:
    s = get_settings()
    book = _ensure_book(user_id, token, None)
    fills = _fills(user_id, token, s)
    row = next((f for f in fills if f["id"] == fill_id), None)
    if not row:
        raise ApiError("not_found", "Fill not found", 404)
    if row["status"] != "working":
        raise ApiError("invalid_request", "Only resting tickets can be cancelled", 400)
    _update_fill(user_id, token, s, fill_id, {"status": "cancelled"})
    return await _to_response(user_id, token, s, book)


async def analyse(user_id: str, token: str | None) -> PaperAnalysisResponse:
    s = get_settings()
    book = _ensure_book(user_id, token, None)
    await _fill_working(user_id, token, s, book)
    fills = [f for f in _fills(user_id, token, s) if f["status"] == "filled"]
    now = _now()
    eligible = [f for f in fills if f.get("filled_at") and analysis_ready(_parse_ts(f["filled_at"]), now)]
    if fills and not eligible:
        oldest = min(_parse_ts(f["filled_at"]) for f in fills)
        unlock = next_open(session_date(oldest)).isoformat()
        raise ApiError("analysis_too_soon", f"Analysis unlocks on the next US session ({unlock}).", 409)
    if not eligible:
        raise ApiError("analysis_too_soon", "No filled tickets are old enough yet.", 409)
    eligible = eligible[:8]
    symbols = list(dict.fromkeys(str(f["symbol"]) for f in eligible))
    snap = await get_snapshot(symbols + ["^VIX"])
    by_sym = {m.symbol: m for m in snap.moves}
    facts: list[PaperAnalysisEvidence] = []
    fact_payload = []
    for f in eligible:
        m = by_sym.get(f["symbol"])
        fp = float(f["fill_price"] or 0)
        last = float(m.level) if m else None
        ret = ((last - fp) / fp * 100) if last and fp else None
        if f["side"] in ("sell", "short") and ret is not None:
            ret = -ret
        facts.append(PaperAnalysisEvidence(
            fact_id=(m.fact_id if m else f.get("fact_id") or f["symbol"]),
            symbol=f["symbol"], label=company_name(f["symbol"]),
            change=m.change if m else 0, change_unit=m.change_unit if m else "%",
            return_since_fill=round(ret, 4) if ret is not None else None,
            fill_price=fp or None, last=last,
        ))
        if m:
            fact_payload.append({
                "fact_id": m.fact_id, "symbol": f["symbol"], "side": f["side"],
                "direction": "up" if (ret or 0) > 0 else "down" if (ret or 0) < 0 else "flat",
                "day_direction": "up" if m.change > 0 else "down" if m.change < 0 else "flat",
            })
    headlines, golden = await _analysis_headlines(symbols, s)
    news_ctx, hid = build_news_context(headlines)
    fact_ids = {x.fact_id for x in facts}
    hid_ids = set(hid)
    analysis = _fallback_analysis(facts)
    status = "fallback"
    try:
        raw = structured.generate(
            PaperAnalysisLLM, system=analysis_prompt.SYSTEM,
            user=analysis_prompt.build_user(
                level=book.get("level") or "beginner", facts=fact_payload,
                news_context=news_ctx, allowed_concepts=NUMBER_CONCEPTS,
            ),
            model=s.xai_model_fast, prompt_version=analysis_prompt.PROMPT_VERSION,
        )
        points = []
        for p in raw.value.points:
            fids = [i for i in p.fact_ids if i in fact_ids]
            hids = [i for i in p.headline_ids if i in hid_ids]
            points.append(PaperAnalysisPoint(
                symbol=p.symbol[:16], point=strip_numbers(p.point),
                explanation=strip_numbers(p.explanation), fact_ids=fids, headline_ids=hids,
                supported=bool(fids),
            ))
        if points:
            analysis = PaperAnalysis(
                headline=strip_numbers(raw.value.headline),
                summary=strip_numbers(raw.value.summary),
                points=points, confidence=raw.value.confidence,
                confidence_reason=strip_numbers(raw.value.confidence_reason),
                concept_ids=[c for c in raw.value.concept_ids if c in NUMBER_CONCEPTS],
                status="ok",
            )
            status = "ok"
    except LLMError:
        status = "fallback"
    analysis.status = status  # type: ignore[misc]
    return PaperAnalysisResponse(
        as_of=snap.as_of, data_mode="demo" if golden else snap.data_mode,
        eligible_fill_ids=[f["id"] for f in eligible],
        facts=facts,
        headlines=[PaperAnalysisHeadline(id=hid_key, title=h.title, url=h.url, publisher=h.publisher)
                   for hid_key, h in hid.items()],
        analysis=analysis, prompt_version=analysis_prompt.PROMPT_VERSION,
    )


async def _analysis_headlines(symbols: list[str], s: Settings) -> tuple[list[Headline], bool]:
    golden_rows = [Headline.model_validate(h) for h in load_golden().get("headlines", [])]
    if s.data_mode == "demo":
        picked = [h for h in golden_rows if set(h.tickers) & set(symbols)]
        return (picked or golden_rows)[:12], True
    items, _ok = await fetch_feeds(ticker_feeds(symbols), s.yahoo_user_agent)
    if not items:
        return golden_rows[:12], True
    return items[:12], False


def _fallback_analysis(facts: list[PaperAnalysisEvidence]) -> PaperAnalysis:
    top = max(facts, key=lambda f: abs(f.return_since_fill or f.change or 0))
    direction = "rose" if (top.return_since_fill or 0) > 0 else "fell"
    point = PaperAnalysisPoint(
        symbol=top.symbol,
        point=f"{top.label} {direction} in the classroom book",
        explanation="The size of the move is in the facts. Headlines may or may not name a catalyst.",
        fact_ids=[top.fact_id], supported=True,
    )
    return PaperAnalysis(
        headline=f"{top.label} was the largest classroom move",
        summary="This is a template write-up used when the interpretation model is unavailable. "
                "It does not recommend any action. Check the facts and headlines as evidence.",
        points=[point], confidence="low",
        confidence_reason="Template fallback; the interpretation model did not run.",
        status="fallback",
    )


def _parse_ts(raw: str) -> datetime:
    t = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    return t


def _new_fill(user_id: str, book: dict, req: PaperTicketRequest, symbol: str,
              px: float | None, notional: float | None, status: str,
              fact_id: str | None, as_of: date, data_mode: str) -> dict:
    now = _now()
    return {
        "id": nid(), "user_id": user_id, "portfolio_id": book["id"], "symbol": symbol,
        "side": req.side, "quantity": float(req.quantity), "fill_price": px, "notional": notional,
        "ticket_kind": req.ticket_kind, "limit_price": req.limit_price, "status": status,
        "instrument_kind": req.instrument_kind, "option_right": req.option_right,
        "option_strike": req.option_strike, "option_expiry": req.option_expiry,
        "fact_id": fact_id, "as_of_date": as_of.isoformat(), "data_mode": data_mode,
        "filled_at": now.isoformat(),
    }


def _commit(user_id: str, token: str | None, s: Settings, book: dict, cash: float,
            lots: list[dict], fill: dict) -> PaperFill:
    book = {**book, "cash_usd": round(cash, 4)}
    _save_book(user_id, token, s, book, insert=False)
    _replace_lots(user_id, token, s, book["id"], lots)
    saved = _add_fill(user_id, token, s, fill)
    return _fill_model(saved, _now())


async def _fill_working(user_id: str, token: str | None, s: Settings, book: dict) -> None:
    working = [f for f in _fills(user_id, token, s) if f["status"] == "working"]
    if not working:
        return
    lots = _lots(user_id, book["id"], token, s)
    snap = await get_snapshot(_price_symbols(*(str(f["symbol"]) for f in working), *(str(lot["symbol"]) for lot in lots)))
    by_sym = {m.symbol: m for m in snap.moves}
    as_of = _as_of_date(snap.as_of)
    cash = float(book["cash_usd"])
    changed = False
    for f in working:
        try:
            if f.get("instrument_kind") == "option":
                expiry = date.fromisoformat(str(f["option_expiry"]))
                px = _option_px(by_sym, f["symbol"], float(f["option_strike"]), expiry,
                                str(f["option_right"]), as_of)
            else:
                px, move = _last_and_move(by_sym, f["symbol"])
                f["fact_id"] = move.fact_id
            kind = f["ticket_kind"]
            trig = float(f["limit_price"]) if f.get("limit_price") is not None else px
            through = limit_through(f["side"], px, trig) if kind == "limit" else stop_through(f["side"], px, trig)
            if not through:
                continue
            qty = float(f["quantity"])
            notional = qty * px * (OPTION_MULTIPLIER if f.get("instrument_kind") == "option" else 1)
            if f["side"] in ("buy", "cover") and cash + 1e-9 < notional:
                continue
            if f.get("instrument_kind") == "option":
                lots = _apply_option(
                    lots, portfolio_id=book["id"], user_id=user_id, symbol=f["symbol"],
                    side=f["side"], qty=qty, px=px, right=str(f["option_right"]),
                    strike=float(f["option_strike"]), expiry=str(f["option_expiry"]),
                )
            else:
                lots = _apply_equity(lots, portfolio_id=book["id"], user_id=user_id,
                                     symbol=f["symbol"], side=f["side"], qty=qty, px=px)
            cash = cash - notional if f["side"] in ("buy", "cover") else cash + notional
            _update_fill(user_id, token, s, f["id"], {
                "status": "filled", "fill_price": px, "notional": notional,
                "as_of_date": as_of.isoformat(),
            })
            changed = True
        except ApiError:
            continue
    if changed:
        book["cash_usd"] = round(cash, 4)
        _save_book(user_id, token, s, book, insert=False)
        _replace_lots(user_id, token, s, book["id"], lots)


def _fill_model(row: dict, now: datetime) -> PaperFill:
    ts = str(row.get("filled_at") or now.isoformat())
    ready = False
    try:
        ready = row.get("status") == "filled" and analysis_ready(_parse_ts(ts), now)
    except (TypeError, ValueError):
        ready = False
    exp = row.get("option_expiry")
    return PaperFill(
        id=str(row["id"]), symbol=str(row["symbol"]), side=row["side"],
        quantity=float(row["quantity"]), fill_price=_f(row.get("fill_price")),
        notional=_f(row.get("notional")), ticket_kind=row["ticket_kind"],
        limit_price=_f(row.get("limit_price")), status=row["status"],
        instrument_kind=row.get("instrument_kind") or "equity",
        option_right=row.get("option_right"), option_strike=_f(row.get("option_strike")),
        option_expiry=str(exp)[:10] if exp else None, fact_id=row.get("fact_id"),
        as_of_date=str(row["as_of_date"])[:10] if row.get("as_of_date") else None,
        filled_at=ts, analysis_ready=ready,
    )


def _f(v: Any) -> float | None:
    return None if v is None else float(v)


async def _to_response(user_id: str, token: str | None, s: Settings, book: dict) -> PaperBookResponse:
    level = book.get("level") or "beginner"
    lots_raw = _lots(user_id, book["id"], token, s)
    fills_raw = _fills(user_id, token, s)
    snap = await get_snapshot(_price_symbols(*(str(x["symbol"]) for x in lots_raw + fills_raw)))
    by_sym = {m.symbol: m for m in snap.moves}
    as_of = _as_of_date(snap.as_of)
    lots: list[PaperLot] = []
    equity_value = 0.0
    holdings: list[tuple[str, float]] = []
    prices: dict[str, tuple[float, float]] = {}
    for lot in lots_raw:
        if lot["kind"] == "option":
            expiry = date.fromisoformat(str(lot["option_expiry"]))
            try:
                px = _option_px(by_sym, lot["symbol"], float(lot["option_strike"]), expiry,
                                str(lot["option_right"]), as_of)
            except ApiError:
                px = None
            mv = (px * float(lot["quantity"]) * OPTION_MULTIPLIER) if px is not None else None
            if mv:
                equity_value += mv
            cb = float(lot["cost_basis"])
            lots.append(PaperLot(
                id=str(lot["id"]), kind="option", symbol=str(lot["symbol"]),
                quantity=float(lot["quantity"]), cost_basis=cb, market_price=px,
                market_value=round(mv, 4) if mv is not None else None,
                unrealized_pct=round((px - cb) / cb * 100, 4) if px and cb else None,
                option_right=lot.get("option_right"), option_strike=_f(lot.get("option_strike")),
                option_expiry=str(lot["option_expiry"])[:10] if lot.get("option_expiry") else None,
            ))
            continue
        m = by_sym.get(lot["symbol"])
        px = float(m.level) if m else None
        q = float(lot["quantity"])
        mv = (px * q) if px is not None else None
        if mv:
            equity_value += mv
        if m and q != 0:
            holdings.append((str(lot["symbol"]), q))
            prices[str(lot["symbol"])] = (px or 0, m.change)
        cb = float(lot["cost_basis"])
        lots.append(PaperLot(
            id=str(lot["id"]), kind="equity", symbol=str(lot["symbol"]), quantity=q,
            cost_basis=cb, market_price=px, market_value=round(mv, 4) if mv is not None else None,
            unrealized_pct=round((px - cb) / cb * 100, 4) if px and cb else None,
        ))
    attr: Attribution | None = None
    if holdings:
        attr = attribute(holdings, prices, {sym: company_sector(sym) for sym, _ in holdings})
    fills = [_fill_model(f, _now()) for f in fills_raw]
    filled = [f for f in fills if f.status == "filled"]
    analysis_available = any(f.analysis_ready for f in filled)
    unlock = None
    if filled and not analysis_available:
        oldest = min(_parse_ts(f.filled_at) for f in filled)
        unlock = next_open(session_date(oldest)).isoformat()
    listed: list[ListedOption] = []
    if options_allowed(level):
        for und in OPTION_UNDERLYINGS:
            m = by_sym.get(und)
            if not m:
                continue
            exp = next_monthly_expiry(as_of)
            for k in listed_strikes(m.level):
                for right in ("call", "put"):
                    listed.append(ListedOption(
                        underlying=und, right=right, strike=k, expiry=exp.isoformat(),
                        mark=_option_px(by_sym, und, k, exp, right, as_of),
                    ))
    cash = float(book["cash_usd"])
    return PaperBookResponse(
        level=level, cash_usd=round(cash, 2), starting_cash=float(book["starting_cash"]),
        equity_value=round(equity_value, 2), nav=round(cash + equity_value, 2),
        data_mode=snap.data_mode, as_of=snap.as_of, source="paper", attribution=attr,
        lots=lots, fills=fills, whitelist=_whitelist(),
        allowed_sides=sorted(allowed_sides(level)),
        allowed_ticket_kinds=sorted(allowed_ticket_kinds(level)),
        options_allowed=options_allowed(level),
        custom_tickers_allowed=custom_tickers_allowed(level),
        option_underlyings=list(OPTION_UNDERLYINGS),
        listed_options=listed, analysis_available=analysis_available,
        analysis_unlocks_on=unlock,
    )
