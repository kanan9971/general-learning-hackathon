"""Personalised roadmap: the prerequisite tree (from the guide) x this learner's mastery x their level.
Pure functions (schemas only). The same mastery the Quiz, Lab and placement quiz write drives every bar."""
from ..schemas.markets import MarketsGuide, RoadmapNodeDef
from ..schemas.roadmap import PlacementTopic, Roadmap, RoadmapNode

MASTERED = 0.70  # mean mastery of the attempted concepts
WEAK = 0.40
MIN_COVERAGE = 0.34  # share of a node's concepts that must have been attempted to call it mastered
TEST_OUT_TIER = {"beginner": -1, "intermediate": 2, "advanced": 3}  # nodes up to this tier can be tested out
COLLAPSE_TIER = {"beginner": -1, "intermediate": 2, "advanced": 3}
LEVEL_RANK = {"beginner": 0, "intermediate": 1, "advanced": 2}
NEEDS_PLACEMENT_BELOW = 3  # attempted concepts across the roadmap
LATE_TIER = 4  # topics from here on need two proofs (mean attempts >= 2), not one placement answer

PLACEMENT_TOPICS = ["macro", "rates", "fx", "commodities", "equities", "sectors", "companies", "desk", "risk"]
PLACEMENT_KINDS = ("driver", "chain", "scenario")
PLACEMENT_TARGET = {"correct": 1, "partial": 0, "incorrect": -1}


def _node_concepts(d: RoadmapNodeDef, guide: MarketsGuide) -> list[str]:
    if d.concept_ids:
        return d.concept_ids
    sec = next((s for s in guide.sections if s.id == d.section_id), None)
    return list(sec.concept_ids) if sec else []


def build_roadmap(guide: MarketsGuide, mastery: dict[str, tuple[float, int]], level: str) -> Roadmap:
    """`mastery` maps concept_id -> (mastery 0..1, attempts)."""
    titles = {s.id: (s.title, s.tagline) for s in guide.sections}
    defs = [d for d in guide.roadmap if LEVEL_RANK[d.min_level] <= LEVEL_RANK[level]]
    by_id = {d.id: d for d in defs}
    order_in_tier: dict[int, int] = {}
    nodes: list[RoadmapNode] = []
    attempted_total: set[str] = set()

    for d in defs:
        concepts = _node_concepts(d, guide)
        got = [(mastery[c][0]) for c in concepts if c in mastery and mastery[c][1] > 0]
        tries = [mastery[c][1] for c in concepts if c in mastery and mastery[c][1] > 0]
        proven = bool(tries) and sum(tries) / len(tries) >= (2 if d.tier >= LATE_TIER else 1)
        attempted_total |= {c for c in concepts if c in mastery and mastery[c][1] > 0}
        progress = sum(got) / len(got) if got else 0.0
        coverage = len(got) / len(concepts) if concepts else 0.0
        if got and progress >= MASTERED and coverage >= MIN_COVERAGE and proven:
            state = "mastered"
        elif got and progress < WEAK:
            state = "priority"
        elif got:
            state = "in_progress"
        else:
            state = "not_started"
        title, tag = titles.get(d.section_id or "", ("", ""))
        order = order_in_tier.get(d.tier, 0)
        order_in_tier[d.tier] = order + 1
        nodes.append(RoadmapNode(
            id=d.id, title=d.title or title, tagline=d.tagline or tag, tier=d.tier, order=order,
            requires=[r for r in d.requires if r in by_id], action=d.action, section_id=d.section_id,
            concept_ids=concepts, progress=round(progress, 3), coverage=round(coverage, 3), state=state,  # type: ignore[arg-type]
            collapsed=state == "mastered" and d.tier <= COLLAPSE_TIER[level],
            test_out=state != "mastered" and d.action == "section" and d.tier <= TEST_OUT_TIER[level],
        ))

    by_node = {n.id: n for n in nodes}
    started = lambda n: n.state != "not_started"  # noqa: E731
    for n in nodes:  # gentle prerequisite hints (never locks)
        if n.state == "priority":
            n.hint = "Weak spot: worth doing next"
        elif n.state == "in_progress" and n.progress >= MASTERED and n.tier >= LATE_TIER:
            n.hint = "Almost there: one more good set"
        elif n.state == "not_started":
            gaps = [by_node[r].title for r in n.requires if not started(by_node[r]) and by_node[r].state != "mastered"]
            if gaps:
                n.hint = f"Builds on: {gaps[0]}"
        if n.test_out and n.hint is None:
            n.hint = "You can test out of this"

    nxt = _pick_next(nodes, by_node)
    if nxt:
        nxt.recommended = True
    return Roadmap(
        level=level, track=f"{level.capitalize()} track",  # type: ignore[arg-type]
        rationale=_rationale(level, nodes, nxt, len(attempted_total) < NEEDS_PLACEMENT_BELOW),
        needs_placement=len(attempted_total) < NEEDS_PLACEMENT_BELOW, next_id=nxt.id if nxt else None,
        mastered_count=sum(n.state == "mastered" for n in nodes), total_count=len(nodes), nodes=nodes)


def _pick_next(nodes: list[RoadmapNode], by_node: dict[str, RoadmapNode]) -> RoadmapNode | None:
    """Weak spots first (pulled forward regardless of order), then the first open node whose
    prerequisites are at least started, then simply the first open node."""
    open_nodes = [n for n in nodes if n.state != "mastered" and not n.collapsed]
    if not open_nodes:
        return None
    ordered = sorted(open_nodes, key=lambda n: (n.tier, n.order))
    weak = [n for n in ordered if n.state == "priority"]
    if weak:
        return weak[0]
    for n in ordered:
        if all(by_node[r].state != "not_started" for r in n.requires):
            return n
    return ordered[0]


def _rationale(level: str, nodes: list[RoadmapNode], nxt: RoadmapNode | None, needs_placement: bool) -> str:
    if needs_placement:
        return f"{level.capitalize()} track. Take the 5-minute placement quiz and this roadmap will reshape itself around what you already know."
    strong = sorted((n for n in nodes if n.state == "mastered"), key=lambda n: -n.progress)[:2]
    weak = sorted((n for n in nodes if n.state == "priority"), key=lambda n: n.progress)[:2]
    parts = [f"{level.capitalize()} track."]
    if strong:
        parts.append("Strong on " + " and ".join(f"{n.title} ({round(n.progress * 100)}%)" for n in strong) + ".")
    if weak:
        parts.append("Weak on " + " and ".join(f"{n.title} ({round(n.progress * 100)}%)" for n in weak) + ", so those come first.")
    elif nxt:
        parts.append(f"Next up: {nxt.title}.")
    return " ".join(parts)


# ---------- placement quiz ----------

def next_difficulty(history_observed: list[str], start: int = 1) -> int:
    """Staircase: a right answer raises the next question's difficulty, a wrong one lowers it."""
    d = start
    for o in history_observed:
        d = max(1, min(3, d + PLACEMENT_TARGET.get(o, 0)))
    return d


def pick_placement_question(items: list, topic: str, difficulty: int, recent_kinds: list[str]):
    """Best static item for `topic` near `difficulty`, avoiding the last two question kinds."""
    cands = [it for it in items if it.public.section_id == topic and it.public.kind in PLACEMENT_KINDS and not it.flip]
    if not cands:
        return None
    cands.sort(key=lambda it: (abs(it.public.difficulty - difficulty), it.public.kind in recent_kinds[-2:], it.public.id))
    return cands[0]


def placement_level(percent: int) -> str:
    return "beginner" if percent < 40 else "intermediate" if percent < 75 else "advanced"


def focus_concepts(topics: list[PlacementTopic], concept_by_topic: dict[str, list[str]], limit: int = 3) -> list[str]:
    weak = [t for t in topics if t.observed != "correct"]
    weak.sort(key=lambda t: (t.observed != "incorrect", t.difficulty))
    out: list[str] = []
    for t in weak:
        for c in concept_by_topic.get(t.section_id, [])[:1]:
            if c not in out:
                out.append(c)
    return out[:limit]
