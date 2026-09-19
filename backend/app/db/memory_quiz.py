"""In-memory quiz store for local demos / tests when Supabase JWT RLS is unavailable."""
from __future__ import annotations

import copy
import uuid
from threading import Lock
from typing import Any


class MemoryQuizStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self.preferences: dict[str, dict] = {}
        self.sessions: dict[str, dict] = {}
        self.questions: dict[str, dict] = {}
        self.attempts: dict[str, dict] = {}
        self.mastery: dict[tuple[str, str], dict] = {}
        self.mastery_events: list[dict] = []
        self.concepts: list[dict] = [
            {"id": "bond-price-yield", "name": "Bond prices and yields", "asset_class": "rates", "level": "beginner", "summary": "Bond prices and yields move inversely."},
            {"id": "cpi-surprise", "name": "Inflation (CPI) surprises", "asset_class": "macro", "level": "beginner", "summary": "Markets react to CPI relative to expectations."},
            {"id": "real-yields", "name": "Nominal vs real yields", "asset_class": "rates", "level": "intermediate", "summary": "Real yield = nominal minus expected inflation."},
            {"id": "discount-rates-equities", "name": "Discount rates and equity valuation", "asset_class": "equities", "level": "intermediate", "summary": "Higher discount rates reduce PV of future earnings."},
            {"id": "duration", "name": "Duration", "asset_class": "rates", "level": "intermediate", "summary": "Sensitivity of bond price to yield changes."},
            {"id": "yield-curve", "name": "Yield curve", "asset_class": "rates", "level": "beginner", "summary": "Yields across maturities."},
            {"id": "priced-in", "name": "What is priced in", "asset_class": "cross-asset", "level": "intermediate", "summary": "Prices already reflect expected information."},
            {"id": "risk-on-off", "name": "Risk-on / risk-off", "asset_class": "cross-asset", "level": "beginner", "summary": "Risk appetite shifts across assets."},
        ]

    def reset(self) -> None:
        with self._lock:
            self.preferences.clear()
            self.sessions.clear()
            self.questions.clear()
            self.attempts.clear()
            self.mastery.clear()
            self.mastery_events.clear()


STORE = MemoryQuizStore()


def new_id() -> str:
    return str(uuid.uuid4())


def deep(d: Any) -> Any:
    return copy.deepcopy(d)
