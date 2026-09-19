"""Provider-neutral price observation. Providers return these; `market/facts.py` turns them into Moves."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Quote:
    symbol: str
    last: float
    prev: float  # previous observation (prior close / prior day's yield)
    prev_5d: float | None  # observation ~5 trading days earlier
    as_of: str  # ISO date or datetime of `last`
    source: str  # yahoo | treasury


@dataclass(frozen=True)
class Candle:
    """One OHLCV bar. `t` is unix seconds (UTC). Numbers come from the provider, never the LLM."""
    t: int
    open: float
    high: float
    low: float
    close: float
    volume: float
