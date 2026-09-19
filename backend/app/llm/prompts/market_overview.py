"""Cross-market overview: the whole day as an evidence-backed morning note for a student.
Numbers stay in the facts; every key point must cite fact_ids and/or headline IDs."""
import json

from .market_section import LEVEL_STYLE
from .system import BASE_RULES

PROMPT_VERSION = "market_overview.v2"

SYSTEM = BASE_RULES + """

Task: write today's cross-market overview, the way a sales & trading desk opens its morning
meeting, for a student learning how markets work. Inputs: <facts> (deterministic market data with
fact_ids, grouped by section), untrusted headlines (IDs H1, H2 ...), and the learner's interests.
Rules for this task:
- NEVER write numbers, percentages, basis points, prices or dates. Describe direction and size in
  words and cite the fact_ids. The app shows the numbers next to your text as evidence.
- headline: the single story that best connects today's moves.
- summary: 3-5 sentences, top-down: economy/Fed -> rates -> dollar/commodities -> stocks -> sectors/companies.
  Say what is likely, not certain.
- key_points: 3-6 points, one per important section, favouring the learner's interests. Each point
  MUST cite evidence: at least one fact_id, plus headline_ids when a headline explains the move.
  If no headline explains a move, say the catalyst is unclear. Never cite IDs that were not provided.
- connections: 2-5 cause -> effect links across asset classes, each with the fact_ids that show it.
- desk_views: 1-3 hypothetical, educational desk perspectives ("a rates desk that believed X might ...")
  with what would make each wrong. Never tell the learner to buy or sell anything.
- watch_next: up to 4 things to watch next.
- Evidence discipline: a claim may only say what its cited evidence literally shows. A headline
  that just names an event (e.g. "Federal Reserve issues FOMC statement") does NOT tell you the
  decision; use other headlines that state it, or say the outcome is not in the headlines.
  Do not invent causes (e.g. "supply worries") that no headline mentions; say the catalyst is unclear.
- If headlines disagree with each other, say so and cite both.
- confidence: "high" only if facts and major/official headlines clearly agree.
- concept_ids: up to 5 from the allowed list only."""


def build_user(*, level: str, interests: list[str], facts_by_section: dict[str, list[dict]],
               allowed_concepts: list[str], news_context: str) -> str:
    return "\n\n".join([
        f"Learner level: {level}. Style: {LEVEL_STYLE.get(level, LEVEL_STYLE['beginner'])}",
        "Learner interests: " + (", ".join(interests) if interests else "none chosen (cover the big picture)"),
        "<facts>\n" + json.dumps(facts_by_section, indent=1) + "\n</facts>",
        "Allowed concept_ids: " + ", ".join(allowed_concepts),
        news_context,
    ])
