"""Roadmap + adaptive placement orchestration."""
from ..errors import ApiError
from ..learning import roadmap as rm
from ..market.guide import load_guide
from ..schemas.roadmap import PlacementRequest, PlacementStep, PlacementTopic, Roadmap
from . import markets_lab
from . import quiz as quiz_service


def get_roadmap(user_id: str, token: str | None, level: str | None) -> Roadmap:
    lvl = level or quiz_service.current_level(user_id, token)
    return rm.build_roadmap(load_guide(), quiz_service.mastery_map(user_id, token), lvl)


def placement_next(user_id: str, token: str | None, req: PlacementRequest) -> PlacementStep:
    """Stateless staircase: the next question depends only on the answers so far (replayed from history).
    The final step writes the inferred level to quiz preferences so Progress / paper gates match placement."""
    guide = load_guide()
    items = markets_lab.placement_pool()
    by_id = {it.public.id: it for it in items}
    total = len(rm.PLACEMENT_TOPICS)
    if len(req.history) > total:
        raise ApiError("invalid_request", "More answers than placement questions", 422)

    topics: list[PlacementTopic] = []
    titles = {s.id: s.title for s in guide.sections}
    for h in req.history:
        it = by_id.get(h.question_id)
        if it is None:
            raise ApiError("question_expired", "Unknown placement question; restart the placement quiz", 409)
        topics.append(PlacementTopic(section_id=it.public.section_id, title=titles.get(it.public.section_id, ""),
                                     observed=h.observed, difficulty=it.public.difficulty))

    if len(req.history) >= total:
        pts = sum({"correct": 1.0, "partial": 0.5}.get(t.observed, 0.0) for t in topics)
        pct = round(100 * pts / max(len(topics), 1))
        concepts = {s.id: s.concept_ids for s in guide.sections}
        level = rm.placement_level(pct)
        quiz_service.set_level(user_id, token, level)
        return PlacementStep(done=True, index=total, total=total, level=level, percent=pct,  # type: ignore[arg-type]
                             topics=topics, focus_concept_ids=rm.focus_concepts(topics, concepts))

    idx = len(req.history)
    diff = rm.next_difficulty([t.observed for t in topics])
    item = rm.pick_placement_question(items, rm.PLACEMENT_TOPICS[idx], diff,
                                      [by_id[h.question_id].public.kind for h in req.history])
    if item is None:
        raise ApiError("no_questions", "No placement question for this topic", 503)
    return PlacementStep(done=False, index=idx, total=total, question=item.public)
