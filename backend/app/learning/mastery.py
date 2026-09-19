"""Pure mastery math. No DB / network / LLM."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

Observed = Literal["correct", "partial", "incorrect"]

DELTAS: dict[Observed, float] = {
    "correct": 0.15,
    "partial": 0.05,
    "incorrect": -0.10,
}

BOX_INTERVALS_DAYS = {1: 1, 2: 2, 3: 4, 4: 7, 5: 14}


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def apply_observation(
    mastery: float,
    observed: Observed,
    *,
    box: int = 1,
    confidence: float = 0.0,
    now: datetime | None = None,
) -> dict:
    """Return updated mastery fields for one observation."""
    now = now or datetime.now(timezone.utc)
    before = clamp01(mastery)
    after = clamp01(before + DELTAS[observed])
    new_box = box
    if observed == "correct":
        new_box = min(5, box + 1)
        new_conf = clamp01(confidence + 0.1)
    elif observed == "partial":
        new_box = box
        new_conf = clamp01(confidence + 0.02)
    else:
        new_box = max(1, box - 1)
        new_conf = clamp01(confidence - 0.08)
    days = BOX_INTERVALS_DAYS.get(new_box, 1)
    return {
        "mastery_before": before,
        "mastery_after": after,
        "mastery": after,
        "confidence": new_conf,
        "box": new_box,
        "last_reviewed_at": now.isoformat(),
        "next_review_at": (now + timedelta(days=days)).isoformat(),
        "delta": after - before,
    }


def difficulty_for_mastery(mastery: float, level: str) -> int:
    """Map mastery + overall level to question difficulty 1–3."""
    if mastery < 0.35:
        base = 1
    elif mastery < 0.65:
        base = 2
    else:
        base = 3
    if level == "beginner":
        return min(base, 2)
    if level == "advanced":
        return max(base, 2) if mastery >= 0.4 else base
    return base


def overall_level_from_mastery(values: list[float], fallback: str = "beginner") -> str:
    if not values:
        return fallback
    avg = sum(values) / len(values)
    if avg < 0.4:
        return "beginner"
    if avg < 0.7:
        return "intermediate"
    return "advanced"
