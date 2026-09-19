"""Where a learner's positions come from. Read-only by design: no order endpoints exist.

Today every learner gets the demo book. A real broker (IBKR, ARCHITECTURE.md §6) implements
`PortfolioSource` in its own module and is selected in `get_portfolio_source`; nothing else changes."""
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class Position:
    symbol: str
    quantity: float


class PortfolioSource(Protocol):
    name: str  # "demo" | "ibkr" ...

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


def get_portfolio_source(user_id: str) -> PortfolioSource:
    return DemoPortfolioSource()
