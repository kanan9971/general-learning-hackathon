"""Where a learner's positions come from. Read-only by design: no order endpoints exist.

Today every learner gets the demo book. A paper book (ARCHITECTURE.md §5, PLAN.md)
implements `PortfolioSource` and is selected in `get_portfolio_source`; simulated
orders live in services/db, not here."""
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class Position:
    symbol: str
    quantity: float


class PortfolioSource(Protocol):
    name: str  # "demo" | "paper"

    def positions(self, user_id: str) -> list[Position]: ...


class DemoPortfolioSource:
    """The plan's demo book (PLAN.md §7): spans rates, oil, gold, banks, semis and airlines."""
    name = "demo"
    POSITIONS = [
        Position("NVDA", 40), Position("MSFT", 12), Position("AAPL", 25), Position("JPM", 20),
        Position("XOM", 30), Position("DAL", 60), Position("TLT", 35), Position("GLD", 12),
    ]

    def positions(self, user_id: str) -> list[Position]:
        return list(self.POSITIONS)


class PaperPortfolioSource:
    """Read-only view of the learner's paper classroom lots. Holdings are injected by services."""
    name = "paper"

    def __init__(self, holdings: list[Position]):
        self._holdings = list(holdings)

    def positions(self, user_id: str) -> list[Position]:
        return list(self._holdings)


def get_portfolio_source(user_id: str, paper: list[Position] | None = None) -> PortfolioSource:
    """Markets feed omits `paper` (demo teaching book). Paper desk injects classroom lots."""
    if paper is not None:
        return PaperPortfolioSource(paper)
    return DemoPortfolioSource()
