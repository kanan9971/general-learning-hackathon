"""Prompts for adaptive quiz question generation."""
from .system import BASE_RULES

PROMPT_VERSION = "quiz_question.v1"

SYSTEM = BASE_RULES + """
You write educational market-practice questions for DeskReady.
These are HYPOTHETICAL teaching exercises — never claim they describe today's live market,
and never invent specific prices, yields, dates, or statistics presented as real.
If you need a number for a worked example, introduce it as "Suppose …" / "Hypothetically …".
Match the requested format exactly:
- mcq: exactly 4 options with ids a,b,c,d and one correct_option_id
- case_study: a short hypothetical scenario in context + a prompt asking for causal reasoning
- short_answer: a prompt answerable in 1–3 sentences; fill expected_elements
- analysis: a deeper prompt (word_range ~80–150); fill expected_elements
Always include concept_ids from the allowed list only (or the custom topic label as the sole concept_ids entry when no catalog id exists — use the slug provided).
Include a brief explanation of the right answer / grading focus.
Never recommend buying or selling."""


def build_user(
    *,
    format: str,
    level: str,
    difficulty: int,
    concept_id: str | None,
    concept_name: str | None,
    concept_summary: str | None,
    custom_topic: str | None,
    recent_mistakes: list[str],
) -> str:
    topic = custom_topic or concept_name or concept_id or "markets"
    parts = [
        f"Format: {format}",
        f"Learner level: {level}",
        f"Target difficulty (1–3): {difficulty}",
        f"Topic: {topic}",
    ]
    if concept_id:
        parts.append(f"Catalog concept_id (must appear in concept_ids): {concept_id}")
    if concept_summary:
        parts.append(f"Concept summary: {concept_summary}")
    if recent_mistakes:
        parts.append("Recent learner gaps to lean into: " + "; ".join(recent_mistakes[:4]))
    parts.append(
        "Return JSON matching the schema. For custom-only topics set concept_ids to "
        '["custom"] and put the topic text in the prompt clearly.'
    )
    return "\n".join(parts)
