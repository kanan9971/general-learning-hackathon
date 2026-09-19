"""Desk-note explanation of one market section: today's facts + headlines -> causal story + how
desks think about it. Numbers stay in the facts; the model references fact_ids only."""
import json

from .system import BASE_RULES

PROMPT_VERSION = "market_section.v2"

LEVEL_STYLE = {
    "beginner": "The learner is new to finance. Define jargon in plain words, short sentences, explain WHY each step happens.",
    "intermediate": "Assume basic vocabulary. Focus on the causal mechanism across asset classes.",
    "advanced": "Be concise, use desk terminology, weigh competing explanations.",
}

SYSTEM = BASE_RULES + """

Task: you are writing a short morning-meeting style note that teaches a student how to read ONE
section of today's market (e.g. rates, FX, sectors) the way a sales & trading desk would.
Inputs: <facts> (deterministic market data with fact_ids), untrusted headlines (IDs H1, H2 ...),
and the desk's reference playbook (trade archetypes).
Rules for this task:
- NEVER write numbers, percentages, basis points, prices or dates. Describe direction and size in
  words ("rose sharply", "slipped", "the biggest move in the section") and put the fact_ids you mean
  in fact_ids. The app renders the numbers itself.
- summary: 2-4 sentences: what happened in this section and why it matters, as a likely story, not a certainty.
- drivers: 1-4 likely drivers. Tie each to headline_ids and/or fact_ids. If no headline explains a
  move, say the catalyst is unclear.
- chain: 2-5 cause -> effect steps connecting the driver to the moves.
- desk_views: 1-3 items describing how a trading desk might THINK about this, using the playbook
  archetypes. Frame them as hypothetical and educational ("a desk that believed X might ...").
  Always state what would make the view wrong. Never tell the learner to buy or sell anything.
- watch_next: up to 3 things to watch next.
- Evidence discipline: a claim may only say what its cited evidence literally shows. A headline
  that just names an event (e.g. "Federal Reserve issues FOMC statement") does NOT tell you the
  decision; use other headlines that state it, or say the outcome is not in the headlines.
  Do not invent causes (e.g. "supply worries") that no headline mentions; say the catalyst is unclear.
- If headlines disagree with each other, say so and cite both.
- confidence: "high" only if facts and official/major headlines clearly agree; "low" if headlines
  are missing or unrelated.
- concept_ids: pick up to 4 from the allowed list only."""


def build_user(*, section_title: str, desk: str, level: str, facts: list[dict], playbook: list[str],
               allowed_concepts: list[str], news_context: str) -> str:
    return "\n\n".join([
        f"Section: {section_title}. Desk: {desk}",
        f"Learner level: {level}. Style: {LEVEL_STYLE.get(level, LEVEL_STYLE['beginner'])}",
        "<facts>\n" + json.dumps(facts, indent=1) + "\n</facts>",
        "Desk playbook (trade archetypes you may reference):\n- " + "\n- ".join(playbook),
        "Allowed concept_ids: " + ", ".join(allowed_concepts),
        news_context,
    ])
