"""Market Lab: turn today's real moves + the teaching guide into questions that test understanding.
Pure functions (schemas only). The answer key never leaves the server: `LabItem.public` is what the
client sees; `LabItem` also carries the correct answer, the reveal and the grading rubric."""
import hashlib
import random
from dataclasses import dataclass, field

from ..schemas.ai import QuizMcqOptionLLM, QuizQuestionLLM
from ..schemas.markets import (
    LabOption, LabPart, LabPartResult, LabQuestion, LabReveal, MarketsGuide, Move, Relationship, Scenario,
    SectionGuide, SectionId,
)

MIN_CAUSE_SCORE = 0.4  # only ask about a cause that actually moved (see market/ranking.py)
FLAT_SCORE = 0.15  # below this an effect "barely moved": today neither confirms nor breaks the rule
KIND_ORDER = {"predict": 0, "scenario": 1, "driver": 2, "chain": 3, "explain": 4}
TARGET_DIFFICULTY = {"beginner": 1, "intermediate": 2, "advanced": 3}
MAX_PARTS = 4
CHANGE_OPTIONS = [("up", "Rise"), ("down", "Fall"), ("flat", "Little change")]
QUOTAS = {  # question mix by level: (kind, share)
    "beginner": [("predict", 2), ("scenario", 1), ("driver", 1), ("chain", 1), ("explain", 1)],
    "intermediate": [("predict", 1), ("scenario", 2), ("driver", 1), ("chain", 1), ("explain", 1)],
    "advanced": [("scenario", 2), ("predict", 1), ("chain", 1), ("explain", 2), ("driver", 1)],
}
LETTERS = "abcd"


@dataclass
class LabItem:
    public: LabQuestion
    correct: str | list[str] | dict[str, str] | None  # option id / ordered ids / {part: dir}; None = LLM-graded
    reveal: LabReveal
    rubric: list[str] = field(default_factory=list)
    model_answer: str = ""
    score_hint: float = 0.0  # ranking weight: how notable today's data is for this question
    topic: str = ""  # what it is about (cause symbol / section id): keeps a set from repeating itself


@dataclass
class Verdict:
    correct: bool
    observed: str  # correct | partial | incorrect
    score: int
    explanation: str
    parts: list[LabPartResult] = field(default_factory=list)


def qid(as_of: str | None, kind: str, key: str) -> str:
    return hashlib.sha1(f"{as_of}|{kind}|{key}".encode()).hexdigest()[:12]


def _rng(seed: str) -> random.Random:
    return random.Random(int(hashlib.sha1(seed.encode()).hexdigest(), 16))


def _word(m: Move) -> str:
    return "rose" if m.change > 0 else "fell" if m.change < 0 else "was flat"


def _dir(m: Move) -> str:
    return "up" if m.change > 0 else "down"


def _flip(d: str) -> str:
    return "down" if d == "up" else "up"


def _in_section(m: Move, section: SectionId | None) -> bool:
    return section is None or m.section == section


# ---------- builders ----------

def _predict_and_explain(rel: Relationship, moves: dict[str, Move], as_of: str | None,
                         section: SectionId | None) -> list[LabItem]:
    cause, effect = moves.get(rel.cause), moves.get(rel.effect)
    if not cause or not effect or cause.score < MIN_CAUSE_SCORE:
        return []
    if section is not None and not (_in_section(cause, section) or _in_section(effect, section)):
        return []
    today = _dir(cause)
    expected = rel.effect_dir if today == rel.cause_dir else _flip(rel.effect_dir)
    barely = effect.score < FLAT_SCORE
    followed = None if barely else (_dir(effect) == expected)
    textbook = (f"Usually, when {cause.label} {_word(cause)}, {effect.label} tends to "
                f"{'rise' if expected == 'up' else 'fall'}. {rel.why}")
    surprise = followed is False
    sec = effect.section if effect.section != "companies" else cause.section
    reveal = LabReveal(facts=[cause, effect], textbook=textbook, followed=followed, exception=rel.exception)
    key = f"{rel.cause}>{rel.effect}"
    weight = cause.score + (1.0 if surprise else 0.0)
    easy = rel.exception.lower().startswith("none")

    predict = LabItem(
        public=LabQuestion(
            id=qid(as_of, "predict", key), kind="predict", section_id=sec,
            prompt=f"{cause.label} {_word(cause)} today. Based on how these markets usually connect, "
                   f"what would you expect {effect.label} to do?",
            context="Make your call before you see what actually happened.", facts=[cause],
            options=[LabOption(id="up", text="Rise"), LabOption(id="down", text="Fall")],
            hint="Ask who earns more or pays more when the first market moves.",
            concept_ids=rel.concept_ids[:3], difficulty=1 if easy else 2, surprise=surprise),
        correct=expected, reveal=reveal, score_hint=weight, topic=rel.cause)

    if followed is None:
        return [predict]
    tail = ("Today followed that pattern." if followed
            else f"Today broke the pattern. A reason it can: {rel.exception}")
    explain = LabItem(
        public=LabQuestion(
            id=qid(as_of, "explain", key), kind="explain", section_id=sec,
            prompt=(f"Today {effect.label} did the OPPOSITE of what you would usually expect after "
                    f"{cause.label} {_word(cause)}. Give at least one reason the usual link may not have held."
                    if surprise else
                    f"{cause.label} {_word(cause)} and {effect.label} {_word(effect)}. In 2-4 sentences, "
                    "explain why these two markets are linked, and what could break the link."),
            context="Explain the mechanism in your own words: what causes what, and why.",
            facts=[cause, effect], word_range=(25, 120), concept_ids=rel.concept_ids[:3],
            difficulty=3 if surprise else 2, surprise=surprise),
        correct=None, reveal=reveal.model_copy(update={"model_answer": f"{rel.why} {tail}"}),
        rubric=[rel.why, f"What could break the link: {rel.exception}"], model_answer=f"{rel.why} {tail}",
        score_hint=weight, topic=rel.cause)
    return [predict, explain]


def _driver_item(g: SectionGuide, guide: MarketsGuide, top: Move | None, as_of: str | None) -> LabItem | None:
    if not g.key_drivers:
        return None
    rng = _rng(f"driver|{as_of}|{g.id}")
    real = rng.choice(g.key_drivers)
    others = [d for s in guide.sections if s.id != g.id for d in s.key_drivers if d.name != real.name]
    rng.shuffle(others)
    picks = [real] + others[:3]
    rng.shuffle(picks)
    options = [LabOption(id=LETTERS[i], text=f"{d.name}: {d.why}") for i, d in enumerate(picks)]
    correct = LETTERS[picks.index(real)]
    lead = f"{top.label} {_word(top)} today. " if top else ""
    return LabItem(
        public=LabQuestion(
            id=qid(as_of, "driver", g.id), kind="driver", section_id=g.id,
            prompt=f"{lead}Which of these is a genuine driver of \u201c{g.title}\u201d?",
            context="Three of these options drive other markets, not this one.",
            facts=[top] if top else [], options=options, hint=g.tagline,
            concept_ids=g.concept_ids[:3], difficulty=1),
        correct=correct,
        reveal=LabReveal(facts=[top] if top else [], textbook=f"{real.name}: {real.why}"),
        model_answer=f"{real.name}: {real.why}", score_hint=top.score if top else 0.0)


def _chain_item(g: SectionGuide, top: Move | None, as_of: str | None) -> LabItem | None:
    steps = g.transmission[:4]
    if len(steps) < 3:
        return None
    ids = [f"s{i + 1}" for i in range(len(steps))]
    order = ids[:]
    rng = _rng(f"chain|{as_of}|{g.id}")
    while order == ids:
        rng.shuffle(order)
    text = {sid: f"{s.from_} → {s.to}" for sid, s in zip(ids, steps)}
    story = " ".join(f"{i + 1}. {s.from_} → {s.to}: {s.why}" for i, s in enumerate(steps))
    return LabItem(
        public=LabQuestion(
            id=qid(as_of, "chain", g.id), kind="chain", section_id=g.id,
            prompt=f"Put this chain reaction from \u201c{g.title}\u201d in the order it happens.",
            context="Tap the steps in order: what happens first, second, third.",
            facts=[top] if top else [], items=[LabOption(id=i, text=text[i]) for i in order],
            hint="Each step's result becomes the next step's cause.", concept_ids=g.concept_ids[:3],
            difficulty=2),
        correct=ids, reveal=LabReveal(facts=[top] if top else [], correct_order=ids, model_answer=story),
        model_answer=story, score_hint=0.5)


def _interview_items(g: SectionGuide, as_of: str | None) -> list[LabItem]:
    out = []
    for i, question in enumerate(g.interview[:2]):
        rubric = [f"{r.then}: {r.why}" for r in g.rules[:3]] or [g.mental_model]
        model = f"{g.mental_model} " + " ".join(f"{r.then}, because {r.why[0].lower()}{r.why[1:]}" for r in g.rules[:2])
        out.append(LabItem(
            public=LabQuestion(
                id=qid(as_of, "explain", f"{g.id}#{i}"), kind="explain", section_id=g.id, prompt=question,
                context="Interview-style question. Answer as you would out loud: 2-5 sentences, mechanism first.",
                word_range=(30, 150), concept_ids=g.concept_ids[:3], difficulty=3),
            correct=None, reveal=LabReveal(model_answer=model), rubric=[g.mental_model] + rubric,
            model_answer=model, score_hint=0.3))
    return out



# ---------- what-if scenarios ----------

def _pick_parts(effects: list, rng: random.Random) -> list:
    """Up to MAX_PARTS effects; keep a 'little change' one when there is one (that's the subtle lesson)."""
    if len(effects) <= MAX_PARTS:
        return list(effects)
    flat = [e for e in effects if e.dir == "flat"][:1]
    rest = [e for e in effects if e not in flat]
    rng.shuffle(rest)
    picked = flat + rest[: MAX_PARTS - len(flat)]
    return [e for e in effects if e in picked]  # keep the authored order


def _scenario_item(sc: Scenario, moves: dict[str, Move], as_of: str | None) -> LabItem:
    rng = _rng(f"scenario|{as_of}|{sc.id}")
    effects = _pick_parts(sc.effects, rng)
    pid = {id(e): f"p{n + 1}" for n, e in enumerate(effects)}
    today = [moves[e.symbol] for e in effects if e.symbol and e.symbol in moves]
    tail = f" Caveat: {sc.twist}"
    story = " ".join(f"{n + 1}. {c.from_} \u2192 {c.to}: {c.why}" for n, c in enumerate(sc.chain)) + tail
    return LabItem(
        public=LabQuestion(
            id=qid(as_of, "scenario", sc.id), kind="scenario", section_id=sc.section_id, title=sc.title,
            prompt=f"{sc.premise} What would you expect for each of these?",
            context="Reason it through from the cause: pick Rise, Fall or Little change for every item.",
            parts=[LabPart(id=pid[id(e)], label=e.label) for e in effects],
            options=[LabOption(id=i, text=t) for i, t in CHANGE_OPTIONS],
            hint="Follow the chain: what changes first, and who is affected next?",
            concept_ids=sc.concept_ids[:3], difficulty=sc.level),
        correct={pid[id(e)]: e.dir for e in effects},
        reveal=LabReveal(
            facts=today, shock=sc.shock, chain=sc.chain, exception=sc.twist, model_answer=story,
            facts_note="For comparison only: how these assets really moved today (a different event, not the answer)."
            if today else None,
            parts=[LabPartResult(id=pid[id(e)], label=e.label, expected=e.dir, correct=False, why=e.why,
                                 fact_id=moves[e.symbol].fact_id if e.symbol in moves else None) for e in effects]),
        rubric=[e.why for e in effects], model_answer=story, score_hint=0.6 + 0.05 * sc.level, topic=sc.id)


def _flip_item(cause_sym: str, rels: list[Relationship], moves: dict[str, Move], as_of: str | None,
               section: SectionId | None) -> LabItem | None:
    """Today's own move, mirrored: 'X rose today; what if it had FALLEN instead?' Built from real data."""
    cause = moves.get(cause_sym)
    if not cause or cause.score < MIN_CAUSE_SCORE:
        return None
    rels = [r for r in rels if r.effect in moves and moves[r.effect].score >= FLAT_SCORE]
    if len(rels) < 3:
        return None
    if section is not None and not (_in_section(cause, section) or any(_in_section(moves[r.effect], section) for r in rels)):
        return None
    rels = sorted(rels, key=lambda r: moves[r.effect].score, reverse=True)[:MAX_PARTS]
    mirrored = _flip(_dir(cause))
    expected = {f"p{n + 1}": (r.effect_dir if mirrored == r.cause_dir else _flip(r.effect_dir)) for n, r in enumerate(rels)}
    verb_now, verb_then = _word(cause), ("fallen" if cause.change > 0 else "risen")
    results = [LabPartResult(id=f"p{n + 1}", label=moves[r.effect].label, expected=expected[f"p{n + 1}"], correct=False,
                             why=f"{r.why} (This is the rule run in reverse.)", fact_id=moves[r.effect].fact_id)
               for n, r in enumerate(rels)]
    concepts = list(dict.fromkeys(c for r in rels for c in r.concept_ids))[:3]
    return LabItem(
        public=LabQuestion(
            id=qid(as_of, "scenario", f"flip:{cause_sym}"), kind="scenario", section_id=cause.section,
            title=f"What if {cause.label} had gone the other way?",
            prompt=f"{cause.label} {verb_now} today. Now imagine the opposite: what if it had {verb_then} by a similar amount instead? "
                   "What would you expect for each of these?",
            context="Same rules, run in reverse. Today's real moves are shown after you answer.", facts=[cause],
            parts=[LabPart(id=r.id, label=r.label) for r in results],
            options=[LabOption(id=i, text=t) for i, t in CHANGE_OPTIONS[:2]],
            hint="If the usual link says 'when it rises, this falls', what happens when it falls?",
            concept_ids=concepts, difficulty=2),
        correct=expected,
        reveal=LabReveal(
            facts=[cause] + [moves[r.effect] for r in rels], shock=f"{cause.label} {verb_then}", parts=results,
            facts_note=f"Today's real moves, when {cause.label} {verb_now}. Your answers should be the mirror image.",
            model_answer="Every rule works in both directions: " + " ".join(f"{moves[r.effect].label}: {r.why}" for r in rels)),
        rubric=[r.why for r in rels], model_answer="", score_hint=cause.score + 0.5, topic=cause_sym)


def _scenario_items(guide: MarketsGuide, moves: dict[str, Move], as_of: str | None,
                    section: SectionId | None) -> list[LabItem]:
    out = [_scenario_item(sc, moves, as_of) for sc in guide.scenarios if section is None or sc.section_id == section]
    by_cause: dict[str, list[Relationship]] = {}
    for r in guide.relationships:
        by_cause.setdefault(r.cause, []).append(r)
    for cause, rels in by_cause.items():
        if (item := _flip_item(cause, rels, moves, as_of, section)):
            out.append(item)
    return out


def build_pool(moves: dict[str, Move], guide: MarketsGuide, as_of: str | None,
               section: SectionId | None = None) -> list[LabItem]:
    pool: list[LabItem] = []
    for rel in guide.relationships:
        pool += _predict_and_explain(rel, moves, as_of, section)
    by_section: dict[str, list[Move]] = {}
    for m in moves.values():
        by_section.setdefault(m.section, []).append(m)
    for g in guide.sections:
        if section is not None and g.id != section:
            continue
        ranked = sorted(by_section.get(g.id, []), key=lambda m: m.score, reverse=True)
        top = ranked[0] if ranked else None
        for item in (_driver_item(g, guide, top, as_of), _chain_item(g, top, as_of)):
            if item:
                pool.append(item)
        pool += _interview_items(g, as_of)
    pool += _scenario_items(guide, moves, as_of, section)
    return pool


def select(pool: list[LabItem], level: str, count: int, interests: list[str] | None = None,
           kinds: list[str] | None = None) -> list[LabItem]:
    """Level-shaped mix, favouring followed sections and notable moves; advanced gets surprises first.
    `kinds` narrows the set (e.g. ['scenario'] for a what-if-only session)."""
    interests = interests or []
    target = TARGET_DIFFICULTY.get(level, 1)
    if kinds:
        pool = [it for it in pool if it.public.kind in kinds]

    def rank(it: LabItem) -> tuple:
        q = it.public
        return (-(q.surprise and level == "advanced"), abs(q.difficulty - target), -(q.section_id in interests),
                -it.score_hint, q.id)

    by_kind: dict[str, list[LabItem]] = {}
    for it in sorted(pool, key=rank):
        by_kind.setdefault(it.public.kind, []).append(it)

    chosen: list[LabItem] = []
    seen: dict[str, int] = {}

    def take(kind: str) -> bool:
        # Prefer a section we have not used yet so one set covers different markets.
        cands = [c for c in by_kind.get(kind, []) if c not in chosen]
        def diversity(c: LabItem) -> tuple[int, int]:
            if level == "advanced" and c.public.surprise:  # pattern-breakers trump variety
                return (0, 0)
            return (seen.get(c.topic or c.public.section_id, 0), seen.get(c.public.section_id, 0))

        cands.sort(key=diversity)  # stable: ties keep the notability ranking above
        if not cands:
            return False
        pick = cands[0]
        chosen.append(pick)
        for k in {pick.topic or pick.public.section_id, pick.public.section_id}:
            seen[k] = seen.get(k, 0) + 1
        return True

    plan = [(k, count) for k in kinds] if kinds else QUOTAS.get(level, QUOTAS["beginner"])
    for kind, n in plan:
        for _ in range(n):
            if len(chosen) < count:
                take(kind)
    for kind, _ in plan * 3:  # top up if a kind ran out of candidates
        if len(chosen) >= count:
            break
        take(kind)
    return sorted(chosen, key=lambda c: KIND_ORDER[c.public.kind])[:count]


# ---------- checking (rule-based kinds) ----------

def check(item: LabItem, answer: str | list[str]) -> Verdict | None:
    """Verdict for predict / driver / chain. None for explain (needs the LLM grader)."""
    q = item.public
    if q.kind in ("predict", "driver"):
        ok = isinstance(answer, str) and answer == item.correct
        if q.kind == "predict":
            r = item.reveal
            actual = "" if r.followed is None else (
                " Today followed the pattern." if r.followed else f" Today broke it: {r.exception}")
            text = (("Right. " if ok else "Not quite. ") + (r.textbook or "") + actual).strip()
        else:
            text = ("Right. " if ok else "Not quite. ") + (item.reveal.textbook or "")
        return Verdict(ok, "correct" if ok else "incorrect", 100 if ok else 0, text)
    if q.kind == "chain":
        want = list(item.correct or [])
        got = list(answer) if isinstance(answer, list) else []
        if got == want:
            return Verdict(True, "correct", 100, "Right. " + item.model_answer)
        good = sum(1 for a, b in zip(got, got[1:]) if a in want and b in want and want.index(b) == want.index(a) + 1)
        ratio = good / max(len(want) - 1, 1)
        if ratio >= 0.5:
            return Verdict(False, "partial", int(40 + 40 * ratio), "Close: some steps are in the right order. " + item.model_answer)
        return Verdict(False, "incorrect", 0, "Not quite. " + item.model_answer)
    if q.kind == "scenario":
        want = dict(item.correct or {})
        got = dict(answer) if isinstance(answer, dict) else {}
        parts = [r.model_copy(update={"picked": got.get(r.id), "correct": got.get(r.id) == want.get(r.id)})
                 for r in item.reveal.parts]
        ok = sum(1 for r in parts if r.correct)
        ratio = ok / max(len(parts), 1)
        if ratio == 1:
            obs, score, lead = "correct", 100, "Every call right. "
        elif ratio >= 0.5:
            obs, score, lead = "partial", int(40 + 40 * ratio), f"{ok} of {len(parts)} right. "
        else:
            obs, score, lead = "incorrect", int(30 * ratio), f"{ok} of {len(parts)} right. "
        return Verdict(ratio == 1, obs, score, lead + (item.reveal.model_answer or ""), parts)
    return None


# ---------- what-if drafts for the adaptive quiz (deterministic fallback + grounding) ----------

_WORD = {"up": "rise", "down": "fall", "flat": "change little"}


def scenario_quiz_draft(guide: MarketsGuide, concept_id: str | None, fmt: str, difficulty: int,
                        seed: str = "") -> QuizQuestionLLM | None:
    """A market what-if question for `concept_id` from the scenario library, or None if none teaches it."""
    if not concept_id:
        return None
    pool = [sc for sc in guide.scenarios if concept_id in sc.concept_ids]
    if not pool:
        return None
    rng = _rng(f"quizdraft|{concept_id}|{fmt}|{seed}")
    sc = rng.choice(sorted(pool, key=lambda x: abs(x.level - difficulty))[:2])
    directional = [e for e in sc.effects if e.dir != "flat"]
    if not directional:
        return None
    target = rng.choice(directional)
    if fmt == "mcq":
        wrong = [e for e in directional if e is not target]
        options = [f"{target.label} tends to {_WORD[target.dir]}."]
        options += [f"{e.label} tends to {_WORD['up' if e.dir == 'down' else 'down']}." for e in wrong[:2]]
        options.append(f"{target.label} tends to {_WORD['up' if target.dir == 'down' else 'down']}.")
        options = list(dict.fromkeys(options))[:4]
        order = list(range(len(options)))
        rng.shuffle(order)
        shuffled = [options[i] for i in order]
        correct = LETTERS[shuffled.index(options[0])]
        return QuizQuestionLLM(
            format="mcq", prompt=f"{sc.premise} Which statement is the most likely outcome?", difficulty=max(1, min(3, sc.level)),
            concept_ids=[concept_id], skill="what_if",
            options=[QuizMcqOptionLLM(id=LETTERS[i], text=t) for i, t in enumerate(shuffled)], correct_option_id=correct,
            context=f"What-if: {sc.title}. This is a hypothetical scenario.", hints=["Trace the chain: what changes first?"],
            explanation=f"{target.why} {sc.twist}")
    labels = ", ".join(e.label.lower() for e in directional[:3])
    return QuizQuestionLLM(
        format=fmt if fmt in ("short_answer", "case_study", "analysis") else "short_answer",  # type: ignore[arg-type]
        prompt=f"{sc.premise} Explain what you would expect to happen to {labels}, and why.",
        difficulty=max(1, min(3, sc.level)), concept_ids=[concept_id], skill="what_if",
        context=f"What-if: {sc.title}. Hypothetical scenario.",
        expected_elements=[f"{e.label}: {_WORD[e.dir]} because {e.why}" for e in directional[:3]] + [f"caveat: {sc.twist}"],
        hints=["Start from the cause and follow it one step at a time."],
        explanation=" ".join(f"{e.label}: {e.why}" for e in directional[:3]))
