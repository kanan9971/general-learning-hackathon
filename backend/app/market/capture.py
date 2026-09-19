"""Capture the golden demo day from live providers (CLI, run locally like the ingest CLI).

    python -m app.market.capture            # merge newly fetched data into the golden file
    python -m app.market.capture --replace  # overwrite it
    python -m app.market.capture --charts-only  # Yahoo OHLCV into golden_charts.json

Only data that live providers actually returned is written, so the golden day never contains
invented numbers. Run it from a network where Yahoo isn't throttled to fill in equity/FX/commodity
prices; Treasury.gov and the RSS feeds work from most networks."""
import argparse
import asyncio
import json
from datetime import datetime, timezone

from ..broker import DemoPortfolioSource
from ..config import get_settings
from ..news import feeds as news_feeds
from ..news.rss import fetch_feeds
from .history import GOLDEN_CHARTS_PATH, reset_cache
from .providers import yahoo
from .providers.base import Candle
from .snapshot import GOLDEN_PATH, fetch_live, load_golden
from .universe import COMPANIES, INSTRUMENTS


async def capture(replace: bool) -> dict:
    s = get_settings()
    symbols = list(dict.fromkeys([i.symbol for i in INSTRUMENTS] + list(COMPANIES)
                                 + [p.symbol for p in DemoPortfolioSource.POSITIONS]))
    moves, prices, tsy = await fetch_live(symbols)
    feeds = news_feeds.FED_FEEDS + news_feeds.wsj_feeds(s.wsj_rss_feeds) + news_feeds.ticker_feeds(list(COMPANIES))
    headlines, ok = await fetch_feeds(feeds, s.yahoo_user_agent)

    old = {} if replace else load_golden()
    merged_moves = {m["symbol"]: m for m in old.get("moves", [])}
    merged_moves.update({sym: m.model_dump() for sym, m in moves.items()})
    merged_news = {h["id"]: h for h in old.get("headlines", [])} if not headlines else {}
    keep = [h for h in headlines if h.is_official] + [h for h in headlines if not h.is_official][:100]
    merged_news.update({h.id: h.model_dump() for h in keep})

    out = {
        "_note": "Real data captured from live providers by app.market.capture. Do not hand-edit numbers.",
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "moves": list(merged_moves.values()),
        "headlines": sorted(merged_news.values(), key=lambda h: h.get("published_at") or "", reverse=True),
    }
    GOLDEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    GOLDEN_PATH.write_text(json.dumps(out, indent=1) + "\n")
    print(f"prices: {prices} · treasury: {tsy} · moves captured: {len(moves)}/{len(symbols)}")
    print(f"feeds ok: {sum(ok.values())}/{len(ok)} · headlines: {len(headlines)} -> {GOLDEN_PATH}")
    return out


def _rows(bars: list[Candle]) -> list[list[float | int]]:
    return [[b.t, b.open, b.high, b.low, b.close, b.volume] for b in bars]


# interval key, yahoo range, yahoo interval, symbols
_CHART_JOBS: list[tuple[str, str, str, tuple[str, ...]]] = [
    ("1d", "1y", "1d", tuple(COMPANIES)),
    ("15m", "5d", "15m", ("AAPL", "MSFT", "NVDA", "TSLA")),
    ("60m", "3mo", "60m", ("AAPL", "MSFT", "NVDA")),
    ("1wk", "max", "1wk", ("AAPL",)),
]


async def capture_charts(replace: bool) -> dict:
    """Store real Yahoo OHLCV so demo day still has candles. Never invents bars."""
    s = get_settings()
    old: dict = {}
    if not replace:
        try:
            old = json.loads(GOLDEN_CHARTS_PATH.read_text())
        except (OSError, ValueError):
            old = {}
    series: dict[str, dict] = dict(old.get("series") or {})
    fetched = 0
    wanted = 0
    for key, range_, interval, symbols in _CHART_JOBS:
        for sym in symbols:
            wanted += 1
            bars = await yahoo.fetch_ohlc(sym, range_, interval, s.yahoo_user_agent)
            await asyncio.sleep(0.15)
            if not bars:
                print(f"  skip {sym} {key}: no bars")
                continue
            pack = series.setdefault(sym, {})
            pack[key] = {"interval": interval, "range": range_, "bars": _rows(bars)}
            fetched += 1
            print(f"  {sym} {key}: {len(bars)} bars")
    out = {
        "_note": "Real Yahoo OHLCV captured by app.market.capture. Do not hand-edit numbers.",
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "series": series,
    }
    GOLDEN_CHARTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    GOLDEN_CHARTS_PATH.write_text(json.dumps(out, separators=(",", ":")) + "\n")
    reset_cache()
    print(f"charts captured: {fetched}/{wanted} -> {GOLDEN_CHARTS_PATH}")
    return out


async def _main(replace: bool, charts: bool, charts_only: bool) -> None:
    if not charts_only:
        await capture(replace)
    if charts or charts_only:
        await capture_charts(replace)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--replace", action="store_true")
    ap.add_argument("--charts", action="store_true", help="also capture Yahoo OHLCV into golden_charts.json")
    ap.add_argument("--charts-only", action="store_true", help="skip snapshot/news; only charts")
    args = ap.parse_args()
    asyncio.run(_main(args.replace, args.charts, args.charts_only))
