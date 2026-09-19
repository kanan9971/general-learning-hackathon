"""Server-side citation validation: the LLM may only cite sources we gave it."""
from ..schemas.ai import TutorLessonLLM


def validate_citations(lesson: TutorLessonLLM, allowed: set[str]) -> tuple[TutorLessonLLM, set[str], int]:
    """Drop unknown source ids; downgrade 'supported' sections with no valid source to 'synthesis'.
    Returns (clean lesson, ids actually used, number of dropped ids)."""
    used: set[str] = set()
    dropped = 0
    sections = []
    for s in lesson.sections:
        valid = [sid for sid in dict.fromkeys(s.source_ids) if sid in allowed]
        dropped += len(s.source_ids) - len(valid)
        kind = s.kind if (s.kind != "supported" or valid) else "synthesis"
        used.update(valid)
        sections.append(s.model_copy(update={"source_ids": valid, "kind": kind}))
    insufficient = lesson.insufficient_evidence or not allowed
    return lesson.model_copy(update={"sections": sections, "insufficient_evidence": insufficient}), used, dropped
