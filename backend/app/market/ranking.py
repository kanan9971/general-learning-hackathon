"""Rank moves by how unusual they are. A move is scored against a rough 'typical day' for its
asset class, so a 10bp yield move and a 2% stock move are comparable. Heuristic, not a vol model."""
from ..schemas.markets import Move

TYPICAL_DAILY_MOVE = {
    "equity_index": 1.0,  # %
    "sector_etf": 1.3,  # %
    "stock": 1.8,  # %
    "fx": 0.5,  # %
    "commodity": 1.8,  # %
    "vol": 6.0,  # % change in VIX
    "yield": 6.0,  # bp
    "spread": 4.0,  # bp
}
UNUSUAL_SCORE = 1.5


def score(m: Move) -> float:
    return round(abs(m.change) / TYPICAL_DAILY_MOVE.get(m.asset_class, 1.5), 2)


def rank(moves: list[Move]) -> list[Move]:
    scored = [m.model_copy(update={"score": score(m), "unusual": score(m) >= UNUSUAL_SCORE}) for m in moves]
    return sorted(scored, key=lambda m: m.score, reverse=True)
