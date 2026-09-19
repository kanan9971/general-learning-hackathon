"""The markets teaching guide (static JSON): sections, cross-asset rules, what-if scenarios.
Shared by the markets feed, the Market Lab and the adaptive quiz so all three teach the same rules."""
import json
from functools import lru_cache
from pathlib import Path

from ..schemas.markets import MarketsGuide
from .universe import by_symbol, company_name

GUIDE_PATH = Path(__file__).resolve().parents[1] / "data" / "markets_guide.json"


@lru_cache
def load_guide() -> MarketsGuide:
    return MarketsGuide.model_validate(json.loads(GUIDE_PATH.read_text()))


def _label(symbol: str) -> str:
    inst = by_symbol().get(symbol)
    return inst.label if inst else company_name(symbol)


def rules_for_concept(concept_id: str | None, limit: int = 4) -> list[str]:
    """Plain-text market rules that teach `concept_id`: ground truth for LLM question writing."""
    if not concept_id:
        return []
    g = load_guide()
    out: list[str] = []
    for r in g.relationships:
        if concept_id in r.concept_ids:
            verb = "rises" if r.cause_dir == "up" else "falls"
            eff = "tends to rise" if r.effect_dir == "up" else "tends to fall"
            out.append(f"When {_label(r.cause)} {verb}, {_label(r.effect)} {eff}. {r.why} It can fail when: {r.exception}")
    for s in g.sections:
        if concept_id in s.concept_ids:
            out += [f"If {x.when.lower()}, then {x.then.lower()} because {x.why[0].lower()}{x.why[1:]} Unless: {x.exception}" for x in s.rules]
    for sc in g.scenarios:
        if concept_id in sc.concept_ids:
            effs = "; ".join(f"{e.label} {'rises' if e.dir == 'up' else 'falls' if e.dir == 'down' else 'changes little'}" for e in sc.effects)
            out.append(f"Scenario: {sc.premise} Likely effects: {effs}. Caveat: {sc.twist}")
    return out[:limit]
