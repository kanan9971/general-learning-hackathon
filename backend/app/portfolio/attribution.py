"""Deterministic day attribution: weight x return per position. Pure function, no I/O."""
from ..schemas.portfolio import Attribution, Contribution


def attribute(
    holdings: list[tuple[str, float]],  # (symbol, quantity)
    prices: dict[str, tuple[float, float]],  # symbol -> (last price, 1d return %)
    sectors: dict[str, str],
) -> Attribution | None:
    """Weights use today's market value. Positions without a price are left out and the
    remaining weights re-normalised; returns None when nothing can be priced."""
    valued = [(s, q * prices[s][0], prices[s][1]) for s, q in holdings if s in prices and q > 0]
    total = sum(v for _, v, _ in valued)
    if total <= 0:
        return None
    contributions = []
    sector_w: dict[str, float] = {}
    for sym, value, ret in valued:
        w = value / total
        contributions.append(Contribution(symbol=sym, weight=round(w, 4), return_pct=ret,
                                          contribution_pct=round(w * ret, 4)))
        sec = sectors.get(sym, "Other")
        sector_w[sec] = round(sector_w.get(sec, 0.0) + w, 4)
    contributions.sort(key=lambda c: abs(c.contribution_pct), reverse=True)
    port = sum((v / total) * r for _, v, r in valued)
    return Attribution(portfolio_return_pct=round(port, 4), contributions=contributions, sectors=sector_w)
