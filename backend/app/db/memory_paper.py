"""In-memory paper book for AUTH_DEV_BYPASS / QUIZ_USE_MEMORY."""
from __future__ import annotations

from threading import Lock
from typing import Any

from .memory_quiz import deep, new_id


class MemoryPaperStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self.books: dict[str, dict] = {}
        self.lots: dict[str, list[dict]] = {}
        self.fills: dict[str, list[dict]] = {}

    def reset(self) -> None:
        with self._lock:
            self.books.clear()
            self.lots.clear()
            self.fills.clear()


PAPER = MemoryPaperStore()


def copy(d: Any) -> Any:
    return deep(d)


def nid() -> str:
    return new_id()
