"""Deterministic concept / format selection for the adaptive quiz queue."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Sequence

from .mastery import difficulty_for_mastery


@dataclass(frozen=True)
class ConceptState:
    concept_id: str
    name: str = ""
    mastery: float = 0.35
    confidence: float = 0.0
    attempts: int = 0
    correct: int = 0
    next_review_at: str | None = None
    misconceptions: list[str] | None = None


@dataclass(frozen=True)
class SelectionTarget:
    concept_id: str | None
    custom_topic: str | None
    format: str
    difficulty: int
    reason: str


def _parse_iso(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def select_targets(
    *,
    formats: Sequence[str],
    preferred_concept_ids: Sequence[str],
    custom_topics: Sequence[str],
    mastery: Sequence[ConceptState],
    recent_concept_ids: Sequence[str],
    recent_mistake_ids: Sequence[str],
    level: str,
    n: int,
    now: datetime | None = None,
) -> list[SelectionTarget]:
    """Pick up to n (concept|custom_topic, format, difficulty) targets.

    Priority: due reviews → repeated mistakes → low mastery → preferred topics
    → custom topics → remaining catalog. Avoid immediate repeats when possible.
    """
    now = now or datetime.now(timezone.utc)
    by_id = {c.concept_id: c for c in mastery}
    formats = list(formats) or ["mcq"]
    recent = list(recent_concept_ids)
    mistakes = list(recent_mistake_ids)

    scored: list[tuple[float, str, str]] = []
    seen: set[str] = set()

    def push(cid: str, base: float, reason: str) -> None:
        if cid in seen:
            return
        seen.add(cid)
        state = by_id.get(cid)
        m = state.mastery if state else 0.35
        weakness = 1.0 - m
        recency_penalty = 0.4 if cid in recent[-3:] else 0.0
        mistake_bonus = 0.35 * mistakes.count(cid)
        scored.append((base + weakness + mistake_bonus - recency_penalty, cid, reason))

    for c in mastery:
        due = _parse_iso(c.next_review_at)
        if due and due <= now:
            push(c.concept_id, 2.0, "due_review")

    for cid in mistakes:
        push(cid, 1.5, "repeated_mistake")

    for c in sorted(mastery, key=lambda x: x.mastery):
        if c.mastery < 0.55:
            push(c.concept_id, 1.0, "low_mastery")

    for cid in preferred_concept_ids:
        push(cid, 0.8, "preferred")

    for c in mastery:
        push(c.concept_id, 0.2, "catalog")
    for cid in preferred_concept_ids:
        push(cid, 0.1, "preferred_fallback")

    scored.sort(key=lambda t: t[0], reverse=True)

    targets: list[SelectionTarget] = []
    custom_cycle = list(custom_topics)
    fmt_i = 0
    custom_i = 0

    for i in range(n):
        fmt = formats[fmt_i % len(formats)]
        fmt_i += 1
        use_custom = bool(custom_cycle) and (i % 2 == 1 or not scored)
        if use_custom:
            topic = custom_cycle[custom_i % len(custom_cycle)]
            custom_i += 1
            targets.append(
                SelectionTarget(
                    concept_id=None,
                    custom_topic=topic,
                    format=fmt,
                    difficulty=difficulty_for_mastery(0.4, level),
                    reason="custom_topic",
                )
            )
            continue
        if not scored:
            cid = preferred_concept_ids[0] if preferred_concept_ids else "bond-price-yield"
            state = by_id.get(cid)
            m = state.mastery if state else 0.35
            targets.append(
                SelectionTarget(
                    concept_id=cid,
                    custom_topic=None,
                    format=fmt,
                    difficulty=difficulty_for_mastery(m, level),
                    reason="fallback",
                )
            )
            continue
        _, cid, reason = scored.pop(0)
        state = by_id.get(cid)
        m = state.mastery if state else 0.35
        targets.append(
            SelectionTarget(
                concept_id=cid,
                custom_topic=None,
                format=fmt,
                difficulty=difficulty_for_mastery(m, level),
                reason=reason,
            )
        )
    return targets


def recommend_concepts(mastery: Sequence[ConceptState], limit: int = 5) -> list[str]:
    due: list[str] = []
    weak: list[tuple[float, str]] = []
    now = datetime.now(timezone.utc)
    for c in mastery:
        due_at = _parse_iso(c.next_review_at)
        if due_at and due_at <= now:
            due.append(c.concept_id)
        elif c.mastery < 0.55:
            weak.append((c.mastery, c.concept_id))
    weak.sort()
    out: list[str] = []
    for cid in due + [w[1] for w in weak]:
        if cid not in out:
            out.append(cid)
        if len(out) >= limit:
            break
    return out
