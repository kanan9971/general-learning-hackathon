"""Market snapshot with the fallback chain: live -> last good (in-process cache) -> golden day.
DATA_MODE=demo skips the network entirely (CLAUDE.md rule 8)."""
import json
import time
from dataclasses import dataclass
from pathlib import Path

from ..config import get_settings
from ..schemas.markets import Move, ProviderStatus
from . import ranking
from .facts import instrument_for, to_move
from .providers import treasury, yahoo, yfinance_provider
from .universe import by_symbol

GOLDEN_PATH = Path(__file__).resolve().parents[1] / "data" / "golden_markets.json"
FRESH_SECONDS = 15 * 60
FAILED_RETRY_SECONDS = 120


@dataclass
class Snapshot:
    moves: list[Move]  # ranked, most unusual first
    data_mode: str  # live | cache | demo
    prices: ProviderStatus
    treasury: ProviderStatus

    @property
    def as_of(self) -> str | None:
        return max((m.as_of for m in self.moves), default=None)


_last_good: dict[str, Move] = {}  # symbol -> most recent live move (survives provider outages)
_recent: dict[tuple[str, ...], tuple[float, Snapshot]] = {}


def load_golden() -> dict:
    try:
        return json.loads(GOLDEN_PATH.read_text())
    except (OSError, ValueError):
        return {"moves": [], "headlines": []}


def golden_moves() -> dict[str, Move]:
    return {m["symbol"]: Move.model_validate(m) for m in load_golden().get("moves", [])}


def _status(got: int, wanted: int) -> ProviderStatus:
    if wanted == 0:
        return "skipped"
    return "ok" if got == wanted else "partial" if got else "failed"


async def fetch_live(symbols: list[str]) -> tuple[dict[str, Move], ProviderStatus, ProviderStatus]:
    s = get_settings()
    known = by_symbol()
    insts = [instrument_for(sym, known) for sym in symbols]
    yahoo_syms = [i.symbol for i in insts if i.source == "yahoo"]
    treasury_syms = [i.symbol for i in insts if i.source == "treasury"]

    quotes = await yahoo.fetch_quotes(yahoo_syms, s.yahoo_user_agent) if yahoo_syms else {}
    missing = [x for x in yahoo_syms if x not in quotes]
    if missing:  # direct endpoint throttled (429) -> yfinance library, when installed
        quotes.update(await yfinance_provider.fetch_quotes(missing))
    curve = await treasury.fetch_curve(s.yahoo_user_agent) if treasury_syms else {}
    quotes.update({k: v for k, v in curve.items() if k in treasury_syms})

    moves = {sym: to_move(q, instrument_for(sym, known)) for sym, q in quotes.items()}
    prices = _status(sum(1 for x in yahoo_syms if x in moves), len(yahoo_syms))
    tsy = _status(sum(1 for x in treasury_syms if x in moves), len(treasury_syms))
    return moves, prices, tsy


async def get_snapshot(symbols: list[str]) -> Snapshot:
    key = tuple(sorted(set(symbols)))
    mode = get_settings().data_mode
    golden = golden_moves()

    if mode == "demo":
        moves = [golden[s] for s in key if s in golden]
        return Snapshot(ranking.rank(moves), "demo", "skipped", "skipped")

    hit = _recent.get(key)
    if hit:
        age = time.time() - hit[0]
        complete = hit[1].prices == "ok" and hit[1].treasury in ("ok", "skipped")
        if age < (FRESH_SECONDS if complete else FAILED_RETRY_SECONDS):
            return hit[1]

    live: dict[str, Move] = {}
    prices: ProviderStatus = "skipped"
    tsy: ProviderStatus = "skipped"
    if mode == "live":
        live, prices, tsy = await fetch_live(list(key))
        _last_good.update(live)

    moves, used_cache = [], False
    for sym in key:
        if sym in live:
            moves.append(live[sym])
        elif sym in _last_good:
            moves.append(_last_good[sym])
            used_cache = True
        elif sym in golden:
            moves.append(golden[sym])
    data_mode = "live" if live else "cache" if used_cache else "demo"
    snap = Snapshot(ranking.rank(moves), data_mode, prices, tsy)
    _recent[key] = (time.time(), snap)
    return snap
