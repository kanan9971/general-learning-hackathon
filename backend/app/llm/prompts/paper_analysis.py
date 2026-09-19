"""Grok write-up of why a paper book's names moved. Numbers stay in facts."""
import json

from .market_section import LEVEL_STYLE
from .system import BASE_RULES

PROMPT_VERSION = "paper_analysis.v1"

SYSTEM = BASE_RULES + """

Task: write an educational overview of why the learner's *paper classroom* holdings moved
since they last put on those names. This is a simulated book, not live brokerage.
Inputs: <facts> (deterministic prices and returns with fact_ids) and untrusted headlines (H1, H2…).
Rules:
- NEVER write numbers, percentages, prices or dates. Describe direction in words and cite fact_ids.
- NEVER say whether the paper tickets were good or bad, and never tell them to buy or sell.
- If headlines do not explain a move, say the catalyst is unclear.
- points: one per important name. Each MUST cite at least one fact_id from <facts>.
- confidence: "high" only when facts and headlines clearly agree."""


def build_user(*, level: str, facts: list[dict], news_context: str, allowed_concepts: list[str]) -> str:
    return "\n\n".join([
        f"Learner level: {level}. Style: {LEVEL_STYLE.get(level, LEVEL_STYLE['beginner'])}",
        "<facts>\n" + json.dumps(facts, indent=1) + "\n</facts>",
        "Allowed concept_ids: " + ", ".join(allowed_concepts or ["real-yields", "risk-on-off", "priced-in"]),
        news_context,
    ])
