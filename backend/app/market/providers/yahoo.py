"""Yahoo Finance chart endpoint (unofficial, no key). One request per symbol, bounded concurrency.
Yahoo throttles some networks and cloud IPs (HTTP 429); callers fall back to cache/golden."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import httpx

from .base import Candle, Quote

CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
TIMEOUT = httpx.Timeout(5.0)
CHART_TIMEOUT = httpx.Timeout(8.0)
MAX_CONCURRENCY = 8


def _num(arr: list, i: int) -> float | None:
    if i >= len(arr):
        return None
    v = arr[i]
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def parse_chart(symbol: str, payload: dict) -> Quote | None:
    """Last close vs previous close (and ~5 sessions back) from a range=1mo, interval=1d chart."""
    try:
        result = payload["chart"]["result"][0]
        stamps = result.get("timestamp") or []
        closes = result["indicators"]["quote"][0].get("close") or []
    except (KeyError, IndexError, TypeError):
        return None
    points = [(t, c) for t, c in zip(stamps, closes) if c is not None]
    if len(points) < 2:
        return None
    last_t, last = points[-1]
    prev = points[-2][1]
    prev_5d = points[-6][1] if len(points) >= 6 else None
    as_of = datetime.fromtimestamp(last_t, tz=timezone.utc).isoformat()
    return Quote(symbol, float(last), float(prev), float(prev_5d) if prev_5d else None, as_of, "yahoo")


def parse_ohlc(payload: dict) -> list[Candle]:
    """OHLCV bars. Skips timestamps with no close; fills a missing open/high/low from the close."""
    try:
        result = payload["chart"]["result"][0]
        if not result:
            return []
        stamps = result.get("timestamp") or []
        q = (result.get("indicators") or {}).get("quote") or [{}]
        quote = q[0] or {}
    except (KeyError, IndexError, TypeError):
        return []
    opens, highs, lows, closes, vols = (
        quote.get("open") or [],
        quote.get("high") or [],
        quote.get("low") or [],
        quote.get("close") or [],
        quote.get("volume") or [],
    )
    out: list[Candle] = []
    for i, raw_t in enumerate(stamps):
        close = _num(closes, i)
        if close is None or raw_t is None:
            continue
        open_ = _num(opens, i)
        high = _num(highs, i)
        low = _num(lows, i)
        vol = _num(vols, i) or 0.0
        o = open_ if open_ is not None else close
        h = high if high is not None else max(o, close)
        l = low if low is not None else min(o, close)
        out.append(Candle(int(raw_t), float(o), float(h), float(l), float(close), float(vol)))
    return out


async def fetch_quotes(symbols: list[str], user_agent: str) -> dict[str, Quote]:
    sem = asyncio.Semaphore(MAX_CONCURRENCY)
    headers = {"User-Agent": user_agent, "Accept": "application/json"}

    async def one(client: httpx.AsyncClient, sym: str) -> Quote | None:
        async with sem:
            try:
                r = await client.get(CHART_URL.format(symbol=sym), params={"range": "1mo", "interval": "1d"})
                if r.status_code != 200:
                    return None
                return parse_chart(sym, r.json())
            except (httpx.HTTPError, ValueError):
                return None

    async with httpx.AsyncClient(timeout=TIMEOUT, headers=headers, follow_redirects=True) as client:
        results = await asyncio.gather(*(one(client, s) for s in symbols))
    return {q.symbol: q for q in results if q}


async def fetch_ohlc(symbol: str, range: str, interval: str, user_agent: str) -> list[Candle]:
    """One Yahoo chart call. Empty on throttle, parse failure, or a missing symbol."""
    headers = {"User-Agent": user_agent, "Accept": "application/json"}
    params = {"range": range, "interval": interval, "includePrePost": "false"}
    try:
        async with httpx.AsyncClient(timeout=CHART_TIMEOUT, headers=headers, follow_redirects=True) as client:
            r = await client.get(CHART_URL.format(symbol=symbol), params=params)
            if r.status_code != 200:
                return []
            return parse_ohlc(r.json())
    except (httpx.HTTPError, ValueError):
        return []
