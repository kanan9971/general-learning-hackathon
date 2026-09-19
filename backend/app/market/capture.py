"""Capture the golden demo day from live providers (CLI, run locally like the ingest CLI).

    python -m app.market.capture            # merge newly fetched data into the golden file
    python -m app.market.capture --replace  # overwrite it

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


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--replace", action="store_true")
    asyncio.run(capture(ap.parse_args().replace))
