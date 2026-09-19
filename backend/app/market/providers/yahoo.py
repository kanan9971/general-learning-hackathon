"""Yahoo Finance chart endpoint (unofficial, no key). One request per symbol, bounded concurrency.
Yahoo throttles some networks and cloud IPs (HTTP 429); callers fall back to cache/golden."""
import asyncio
from datetime import datetime, timezone

import httpx

from .base import Quote

CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
TIMEOUT = httpx.Timeout(5.0)
MAX_CONCURRENCY = 8


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
