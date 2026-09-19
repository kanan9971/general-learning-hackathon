"""OHLCV history for the paper chart. Numbers come from Yahoo (or the golden capture), never the LLM.

Fallback chain matches the snapshot: live Yahoo → yfinance (local) → last-good cache → golden.
DATA_MODE=demo skips the network (CLAUDE.md rule 8) and serves stored Yahoo bars.
4-hour candles are 60-minute bars aggregated in UTC; Yahoo has no native 4h interval.
"""
from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path

from ..config import get_settings
from ..errors import ApiError
from ..schemas.markets import ChartCandle, ChartHistory, ChartTimeframe
from .providers import yahoo, yfinance_provider
from .providers.base import Candle

GOLDEN_CHARTS_PATH = Path(__file__).resolve().parents[1] / "data" / "golden_charts.json"
YAHOO_SYM = re.compile(r"^[A-Z^][A-Z0-9.\-=]{0,15}$")
LIVE_TTL = {"15m": 60, "1h": 60, "4h": 60, "5d": 60, "1M": 300, "1Y": 300, "YTD": 300, "ALL": 600}

# Yahoo range/interval for each dropdown. `agg` is bucket size in seconds (UTC).
TIMEFRAMES: dict[ChartTimeframe, dict] = {
    "15m": {"range": "5d", "interval": "15m", "label": "15m", "bar": "15m"},
    "1h": {"range": "1mo", "interval": "60m", "label": "1 hour", "bar": "60m"},
    "4h": {"range": "3mo", "interval": "60m", "label": "4 hours", "bar": "4h", "agg": 4 * 3600},
    "5d": {"range": "5d", "interval": "30m", "label": "5 days", "bar": "30m"},
    "1M": {"range": "1mo", "interval": "1d", "label": "1 month", "bar": "1d"},
    "1Y": {"range": "1y", "interval": "1d", "label": "1 Year", "bar": "1d"},
    "YTD": {"range": "ytd", "interval": "1d", "label": "YTD", "bar": "1d"},
    "ALL": {"range": "max", "interval": "1wk", "label": "All time", "bar": "1wk"},
}

_last_good: dict[tuple[str, ChartTimeframe], tuple[float, ChartHistory]] = {}
_golden_cache: dict | None = None


def reset_cache() -> None:
    global _golden_cache
    _last_good.clear()
    _golden_cache = None


def load_golden_charts() -> dict:
    global _golden_cache
    if _golden_cache is not None:
        return _golden_cache
    try:
        _golden_cache = json.loads(GOLDEN_CHARTS_PATH.read_text())
    except (OSError, ValueError):
        _golden_cache = {"series": {}}
    return _golden_cache


def _as_of(bars: list[Candle]) -> str | None:
    if not bars:
        return None
    return datetime.fromtimestamp(bars[-1].t, tz=timezone.utc).isoformat()


def _to_schema(bars: list[Candle]) -> list[ChartCandle]:
    return [
        ChartCandle(
            t=datetime.fromtimestamp(b.t, tz=timezone.utc).isoformat(),
            open=round(b.open, 6),
            high=round(b.high, 6),
            low=round(b.low, 6),
            close=round(b.close, 6),
            volume=round(b.volume, 4),
        )
        for b in bars
    ]


def aggregate(bars: list[Candle], seconds: int) -> list[Candle]:
    """Merge consecutive bars into UTC buckets of `seconds` (first open, max high, min low, last close)."""
    if seconds <= 0 or not bars:
        return list(bars)
    buckets: dict[int, list[Candle]] = {}
    order: list[int] = []
    for b in bars:
        key = (b.t // seconds) * seconds
        if key not in buckets:
            buckets[key] = []
            order.append(key)
        buckets[key].append(b)
    out: list[Candle] = []
    for key in order:
        g = buckets[key]
        out.append(
            Candle(
                t=g[0].t,
                open=g[0].open,
                high=max(x.high for x in g),
                low=min(x.low for x in g),
                close=g[-1].close,
                volume=sum(x.volume for x in g),
            )
        )
    return out


def _from_rows(rows: list) -> list[Candle]:
    out: list[Candle] = []
    for row in rows:
        try:
            out.append(
                Candle(int(row[0]), float(row[1]), float(row[2]), float(row[3]), float(row[4]), float(row[5]))
            )
        except (TypeError, ValueError, IndexError):
            continue
    return out


def _slice_since(bars: list[Candle], start_ts: int) -> list[Candle]:
    return [b for b in bars if b.t >= start_ts]


def bars_from_golden(symbol: str, timeframe: ChartTimeframe) -> tuple[list[Candle], str | None]:
    """Replay captured Yahoo bars. Never invents prices; may resample a finer stored interval."""
    pack = (load_golden_charts().get("series") or {}).get(symbol) or {}

    def stored(interval: str) -> list[Candle]:
        return _from_rows((pack.get(interval) or {}).get("bars") or [])

    intra = stored("15m")
    hourly = stored("60m")
    daily = stored("1d")
    weekly = stored("1wk")
    last_t = (intra or hourly or daily or weekly or [Candle(0, 0, 0, 0, 0, 0)])[-1].t
    daily_note = "Intraday Yahoo bars are not stored for demo day; showing daily candles."

    if timeframe == "15m":
        if intra:
            return intra, None
        return daily, daily_note if daily else None
    if timeframe == "1h":
        bars = hourly or aggregate(intra, 3600)
        if bars:
            return bars, None
        return daily, daily_note if daily else None
    if timeframe == "4h":
        bars = aggregate(hourly or intra, 4 * 3600)
        if bars:
            return bars, None
        return daily, daily_note if daily else None
    if timeframe == "5d":
        src = intra or hourly
        if src:
            return _slice_since(src, last_t - 5 * 86400), None
        if daily:
            return _slice_since(daily, daily[-1].t - 5 * 86400), "Showing daily candles for the last five sessions."
        return [], None
    if timeframe == "1M":
        if daily:
            return _slice_since(daily, daily[-1].t - 31 * 86400), None
        return [], None
    if timeframe == "1Y":
        if daily:
            return _slice_since(daily, daily[-1].t - 366 * 86400), None
        return daily, None
    if timeframe == "YTD":
        if not daily:
            return [], None
        last = datetime.fromtimestamp(daily[-1].t, tz=timezone.utc)
        start = datetime(last.year, 1, 1, tzinfo=timezone.utc)
        return _slice_since(daily, int(start.timestamp())), None
    if timeframe == "ALL":
        return weekly or daily, None
    return [], None


def _bar_label(bars: list[Candle], fallback: str) -> str:
    if len(bars) < 2:
        return fallback
    dt = bars[-1].t - bars[-2].t
    if dt <= 20 * 60:
        return "15m"
    if dt <= 45 * 60:
        return "30m"
    if dt <= 2 * 3600:
        return "60m"
    if dt <= 6 * 3600:
        return "4h"
    if dt <= 2 * 86400:
        return "1d"
    return "1wk"


def _pack(symbol: str, timeframe: ChartTimeframe, bars: list[Candle], data_mode: str, source: str,
          note: str | None) -> ChartHistory:
    spec = TIMEFRAMES[timeframe]
    return ChartHistory(
        symbol=symbol,
        timeframe=timeframe,
        interval=_bar_label(bars, spec["bar"]),
        range=spec["range"],
        label=spec["label"],
        as_of=_as_of(bars),
        data_mode=data_mode,  # type: ignore[arg-type]
        source=source,  # type: ignore[arg-type]
        candles=_to_schema(bars),
        note=note,
    )


async def _fetch_live(symbol: str, timeframe: ChartTimeframe) -> list[Candle]:
    spec = TIMEFRAMES[timeframe]
    ua = get_settings().yahoo_user_agent
    bars = await yahoo.fetch_ohlc(symbol, spec["range"], spec["interval"], ua)
    if not bars:
        bars = await yfinance_provider.fetch_ohlc(symbol, spec["range"], spec["interval"])
    agg = spec.get("agg")
    if agg and bars:
        bars = aggregate(bars, int(agg))
    return bars


async def get_history(symbol: str, timeframe: ChartTimeframe) -> ChartHistory:
    raw = (symbol or "").strip().upper()
    if not YAHOO_SYM.match(raw):
        raise ApiError("invalid_request", "Use a Yahoo ticker such as AAPL or MSFT.", 400)
    spec = TIMEFRAMES.get(timeframe)
    if spec is None:
        raise ApiError("invalid_request", "Unknown chart timeframe.", 400)

    mode = get_settings().data_mode
    key = (raw, timeframe)
    now = time.time()

    if mode == "demo":
        bars, note = bars_from_golden(raw, timeframe)
        if not bars:
            raise ApiError("chart_unavailable", "No stored Yahoo candles for this name on demo day.", 503, retryable=True)
        return _pack(raw, timeframe, bars, "demo", "golden", note)

    hit = _last_good.get(key)
    if hit and now - hit[0] < LIVE_TTL.get(timeframe, 300) and hit[1].candles:
        return hit[1]

    live: list[Candle] = []
    if mode == "live":
        live = await _fetch_live(raw, timeframe)

    if live:
        hist = _pack(raw, timeframe, live, "live", "yahoo", None)
        _last_good[key] = (now, hist)
        return hist

    if hit and hit[1].candles:
        cached = hit[1].model_copy(update={"data_mode": "cache"})
        return cached

    bars, note = bars_from_golden(raw, timeframe)
    if bars:
        return _pack(raw, timeframe, bars, "demo", "golden", note)

    raise ApiError("chart_unavailable", "Yahoo candles are unavailable for this name right now.", 503, retryable=True)
