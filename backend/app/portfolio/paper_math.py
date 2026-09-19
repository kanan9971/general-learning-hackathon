"""Pure paper-book math: cash by level, session calendar, fills, listed-option marks. No I/O."""
from __future__ import annotations

import math
import re
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from ..market.universe import COMPANIES, INSTRUMENTS

NY = ZoneInfo("America/New_York")

STARTING_CASH = {"beginner": 10_000.0, "intermediate": 50_000.0, "advanced": 100_000.0}

# US cash-equity holidays 2025–2027 (observed). Weekends are handled separately.
HOLIDAYS = {
    date(2025, 1, 1), date(2025, 1, 20), date(2025, 2, 17), date(2025, 4, 18),
    date(2025, 5, 26), date(2025, 6, 19), date(2025, 7, 4), date(2025, 9, 1),
    date(2025, 11, 27), date(2025, 12, 25),
    date(2026, 1, 1), date(2026, 1, 19), date(2026, 2, 16), date(2026, 4, 3),
    date(2026, 5, 25), date(2026, 6, 19), date(2026, 7, 3), date(2026, 9, 7),
    date(2026, 11, 26), date(2026, 12, 25),
    date(2027, 1, 1), date(2027, 1, 18), date(2027, 2, 15), date(2027, 3, 26),
    date(2027, 5, 31), date(2027, 6, 18), date(2027, 7, 5), date(2027, 9, 6),
    date(2027, 11, 25), date(2027, 12, 24),
}

EQUITY_WHITELIST = tuple(dict.fromkeys(
    list(COMPANIES.keys()) + [i.symbol for i in INSTRUMENTS if i.asset_class in ("stock", "sector_etf")]
))
OPTION_UNDERLYINGS = ("AAPL", "NVDA")
OPTION_MULTIPLIER = 100
# Same shape as the Markets watchlist: a Yahoo equity/ETF ticker, not a sentence.
TICKER_RX = re.compile(r"^[A-Z][A-Z0-9.\-]{0,9}$")
_NON_PAPER = {i.symbol for i in INSTRUMENTS if i.asset_class not in ("stock", "sector_etf")}


def starting_cash(level: str) -> float:
    return STARTING_CASH.get(level, STARTING_CASH["beginner"])


def session_date(ts: datetime) -> date:
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(NY).date()


def is_trading_day(d: date) -> bool:
    return d.weekday() < 5 and d not in HOLIDAYS


def next_open(after: date) -> date:
    d = after + timedelta(days=1)
    while not is_trading_day(d):
        d += timedelta(days=1)
    return d


def analysis_ready(filled_at: datetime, now: datetime) -> bool:
    """True once the next US cash session after the fill's NY date has begun (calendar date)."""
    return session_date(now) >= next_open(session_date(filled_at))


def third_friday(year: int, month: int) -> date:
    d = date(year, month, 1)
    fridays = 0
    while True:
        if d.weekday() == 4:
            fridays += 1
            if fridays == 3:
                return d
        d += timedelta(days=1)


def next_monthly_expiry(as_of: date) -> date:
    y, m = as_of.year, as_of.month
    exp = third_friday(y, m)
    if as_of >= exp:
        m += 1
        if m == 13:
            y, m = y + 1, 1
        exp = third_friday(y, m)
    return exp


def listed_strikes(spot: float) -> list[float]:
    step = 5.0 if spot >= 50 else 1.0
    atm = round(spot / step) * step
    return [round(atm - step, 2), round(atm, 2), round(atm + step, 2)]


def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def option_mark(*, spot: float, strike: float, expiry: date, as_of: date, call: bool,
                vol: float = 0.25, rate: float = 0.04) -> float:
    """Deterministic listed-option mark (Black–Scholes). Used in demo and when no chain exists."""
    days = (expiry - as_of).days
    if days <= 0 or spot <= 0 or strike <= 0:
        intrinsic = max(spot - strike, 0.0) if call else max(strike - spot, 0.0)
        return round(max(intrinsic, 0.01), 4)
    t = days / 365.0
    vol = max(vol, 0.05)
    d1 = (math.log(spot / strike) + (rate + 0.5 * vol * vol) * t) / (vol * math.sqrt(t))
    d2 = d1 - vol * math.sqrt(t)
    if call:
        px = spot * _norm_cdf(d1) - strike * math.exp(-rate * t) * _norm_cdf(d2)
    else:
        px = strike * math.exp(-rate * t) * _norm_cdf(-d2) - spot * _norm_cdf(-d1)
    return round(max(px, 0.01), 4)


def limit_through(side: str, last: float, limit: float) -> bool:
    if side in ("buy", "cover"):
        return last <= limit
    return last >= limit  # sell / short


def stop_through(side: str, last: float, stop: float) -> bool:
    if side in ("buy", "cover"):
        return last >= stop
    return last <= stop


def allowed_sides(level: str) -> set[str]:
    if level == "beginner":
        return {"buy", "sell"}
    return {"buy", "sell", "short", "cover"}


def allowed_ticket_kinds(level: str) -> set[str]:
    kinds = {"market"}
    if level in ("intermediate", "advanced"):
        kinds.update({"limit", "stop"})
    return kinds


def options_allowed(level: str) -> bool:
    return level == "advanced"


def custom_tickers_allowed(level: str) -> bool:
    """Beginner stays on the classroom list. Intermediate+ may type a Yahoo equity ticker."""
    return level in ("intermediate", "advanced")


def is_paper_equity(symbol: str) -> bool:
    """Stocks/ETFs we can simulate. Yields, FX, futures and index prints are facts, not paper products."""
    if not symbol or not TICKER_RX.match(symbol) or symbol.startswith("^"):
        return False
    return symbol not in _NON_PAPER
