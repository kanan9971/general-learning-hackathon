"""Optional fallback: the `yfinance` library, used only when it is installed (local / dev).
It pulls in pandas, so it is NOT in requirements.txt (Vercel 250MB limit); on Vercel this
provider silently reports nothing and the chain falls through to cache/golden."""
import asyncio
from datetime import timezone

from .base import Quote


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
