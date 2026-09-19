"""Quote -> Move. All arithmetic on market numbers happens here (deterministic, testable)."""
from ..schemas.markets import Move
from .providers.base import Quote
from .universe import Instrument, company_name


def instrument_for(symbol: str, known: dict[str, Instrument]) -> Instrument:
    """Universe instrument, or a single stock for watchlist/portfolio tickers."""
    return known.get(symbol) or Instrument(symbol, company_name(symbol), "companies", "stock")


def _change(asset_class: str, last: float, base: float) -> float:
    if asset_class == "yield":
        return round((last - base) * 100, 1)  # percentage points -> basis points
    if asset_class == "spread":
        return round(last - base, 1)  # already in bp
    return round((last / base - 1) * 100, 2) if base else 0.0


def to_move(q: Quote, inst: Instrument) -> Move:
    is_rate = inst.asset_class in ("yield", "spread")
    digits = 4 if inst.asset_class == "fx" else 2
    return Move(
        fact_id=f"{q.symbol}.chg.1d",
        symbol=q.symbol,
        label=inst.label,
        section=inst.section,
        asset_class=inst.asset_class,
        level=round(q.last, digits),
        level_unit=inst.level_unit,
        change=_change(inst.asset_class, q.last, q.prev),
        change_unit="bp" if is_rate else "%",
        change_5d=_change(inst.asset_class, q.last, q.prev_5d) if q.prev_5d else None,
        source=q.source,  # type: ignore[arg-type]
        as_of=q.as_of,
    )
