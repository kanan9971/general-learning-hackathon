"""Optional fallback: the `yfinance` library, used only when it is installed (local / dev).
It pulls in pandas, so it is NOT in requirements.txt (Vercel 250MB limit); on Vercel this
provider silently reports nothing and the chain falls through to cache/golden."""
import asyncio
from datetime import timezone

from .base import Candle, Quote


def available() -> bool:
    try:
        import yfinance  # noqa: F401
    except ImportError:
        return False
    return True


def _download(symbols: list[str]) -> dict[str, Quote]:
    import yfinance as yf

    df = yf.download(symbols, period="1mo", interval="1d", progress=False, group_by="ticker",
                     auto_adjust=False, threads=True)
    out: dict[str, Quote] = {}
    for sym in symbols:
        try:
            closes = df[sym]["Close"].dropna()
        except (KeyError, TypeError):
            continue
        if len(closes) < 2:
            continue
        last_ts = closes.index[-1].to_pydatetime()
        if last_ts.tzinfo is None:
            last_ts = last_ts.replace(tzinfo=timezone.utc)
        out[sym] = Quote(
            sym, float(closes.iloc[-1]), float(closes.iloc[-2]),
            float(closes.iloc[-6]) if len(closes) >= 6 else None,
            last_ts.astimezone(timezone.utc).isoformat(), "yahoo",
        )
    return out


async def fetch_quotes(symbols: list[str]) -> dict[str, Quote]:
    if not symbols or not available():
        return {}
    try:
        return await asyncio.to_thread(_download, symbols)
    except Exception:  # noqa: BLE001 - a fallback provider must never break the snapshot
        return {}


def _download_ohlc(symbol: str, period: str, interval: str) -> list[Candle]:
    import yfinance as yf

    df = yf.download(symbol, period=period, interval=interval, progress=False, auto_adjust=False, threads=False)
    if df is None or getattr(df, "empty", True):
        return []
    out: list[Candle] = []
    for ts, row in df.iterrows():
        try:
            close = row["Close"]
            if close is None or (hasattr(close, "item") and close != close):  # NaN
                continue
            c = float(close)
            o = float(row["Open"]) if row["Open"] == row["Open"] else c
            h = float(row["High"]) if row["High"] == row["High"] else max(o, c)
            l = float(row["Low"]) if row["Low"] == row["Low"] else min(o, c)
            vol = float(row["Volume"]) if "Volume" in row and row["Volume"] == row["Volume"] else 0.0
        except (KeyError, TypeError, ValueError):
            continue
        t = ts.to_pydatetime() if hasattr(ts, "to_pydatetime") else ts
        if getattr(t, "tzinfo", None) is None:
            t = t.replace(tzinfo=timezone.utc)
        out.append(Candle(int(t.timestamp()), o, h, l, c, vol))
    return out


async def fetch_ohlc(symbol: str, period: str, interval: str) -> list[Candle]:
    if not symbol or not available():
        return []
    try:
        return await asyncio.to_thread(_download_ohlc, symbol, period, interval)
    except Exception:  # noqa: BLE001 - a fallback provider must never break the snapshot
        return []
