"""Deterministic question templates when the LLM is unavailable."""
from __future__ import annotations

from ...schemas.ai import QuizMcqOptionLLM, QuizQuestionLLM

_TEMPLATES: dict[str, dict] = {
    "bond-price-yield": {
        "name": "Bond prices and yields",
        "mcq": {
            "prompt": "Hypothetically, if a bond's yield rises while its coupon is unchanged, what happens to its price?",
            "options": [
                ("a", "The price falls"),
                ("b", "The price rises one-for-one"),
                ("c", "The price is unaffected"),
                ("d", "The coupon increases automatically"),
            ],
            "correct": "a",
            "explanation": "Bond prices and yields move inversely when the coupon is fixed.",
        },
        "short_answer": {
            "prompt": "In one or two sentences, explain why bond prices and yields move in opposite directions.",
            "expected": ["inverse relationship", "fixed coupon / discounting"],
            "explanation": "A higher yield discounts the same cash flows at a higher rate, so price falls.",
        },
        "case_study": {
            "context": "Suppose 10-year government yields jump after a hotter-than-expected inflation print.",
            "prompt": "Walk through the likely price impact on existing fixed-coupon bonds and name one confirming indicator.",
            "expected": ["prices fall", "yields up", "confirming indicator"],
            "explanation": "Higher yields lower bond prices; a confirming signal could be weaker bond futures.",
        },
        "analysis": {
            "prompt": "Suppose yields rise 50 bp in a day. Explain the mechanism for a long-duration bond portfolio and one risk that could reverse the move.",
            "expected": ["duration sensitivity", "price decline", "reversal risk"],
            "explanation": "Long-duration holdings lose more when yields rise; a dovish surprise could reverse the move.",
        },
    },
    "cpi-surprise": {
        "name": "Inflation (CPI) surprises",
        "mcq": {
            "prompt": "Hypothetically, markets usually react most to CPI when:",
            "options": [
                ("a", "The print differs from expectations"),
                ("b", "The absolute CPI level is high regardless of forecasts"),
                ("c", "It is released on a weekend"),
                ("d", "Only gold traders care about CPI"),
            ],
            "correct": "a",
            "explanation": "Surprises versus the consensus move prices more than the level alone.",
        },
        "short_answer": {
            "prompt": "Why can a still-high CPI print be bullish for risk assets if it is below expectations?",
            "expected": ["surprise vs expectations", "rate path / risk appetite"],
            "explanation": "A softer-than-expected print can ease rate-hike fears even if the level remains elevated.",
        },
        "case_study": {
            "context": "Suppose CPI prints 0.2 pp below consensus while the year-over-year rate is still elevated.",
            "prompt": "Outline a likely rates-vs-equities reaction and one alternative explanation.",
            "expected": ["yields ease", "equities response", "alternative"],
            "explanation": "Softer surprise can pull yields down and support equities; stickiness in core components is an alternative worry.",
        },
        "analysis": {
            "prompt": "Compare how a CPI miss versus a CPI beat would typically feed into rate expectations.",
            "expected": ["expectations channel", "asymmetric surprise"],
            "explanation": "Beats lift priced policy-rate paths; misses pull them down, all else equal.",
        },
    },
    "real-yields": {
        "name": "Nominal vs real yields",
        "mcq": {
            "prompt": "Hypothetically, real yield is best described as:",
            "options": [
                ("a", "Nominal yield minus expected inflation"),
                ("b", "Nominal yield plus expected inflation"),
                ("c", "Only the Fed funds rate"),
                ("d", "Dividend yield on equities"),
            ],
            "correct": "a",
            "explanation": "Real yield ≈ nominal yield − expected inflation.",
        },
        "short_answer": {
            "prompt": "Why might rising real yields pressure long-duration growth equities?",
            "expected": ["discount rates", "distant cash flows"],
            "explanation": "Higher real yields raise discount rates on distant cash flows, lowering present value.",
        },
        "case_study": {
            "context": "Suppose nominal yields rise while inflation expectations are stable, lifting real yields.",
            "prompt": "Which asset groups are likely pressured and why?",
            "expected": ["growth equities / gold", "discount rate / opportunity cost"],
            "explanation": "Higher real yields raise opportunity costs and discount rates for long-duration assets.",
        },
        "analysis": {
            "prompt": "Explain how real yields link the rates market to equity valuation in a simple discounting framework.",
            "expected": ["real yield", "discount rate", "PV of cash flows"],
            "explanation": "Real yields are a core input to discount rates used in equity present-value math.",
        },
    },
}

_DEFAULT = "bond-price-yield"


def fallback_question(
    *,
    format: str,
    concept_id: str | None,
    custom_topic: str | None,
    difficulty: int,
) -> QuizQuestionLLM:
    key = concept_id if concept_id in _TEMPLATES else _DEFAULT
    tpl = _TEMPLATES[key]
    name = custom_topic or tpl["name"]
    cids = [concept_id] if concept_id else ["custom"]

    if format == "mcq":
        block = tpl["mcq"]
        # Light customization for free-text topics.
        prompt = block["prompt"]
        if custom_topic:
            prompt = f"Hypothetically, regarding {custom_topic}: " + prompt
        return QuizQuestionLLM(
            format="mcq",
            prompt=prompt,
            difficulty=difficulty,
            concept_ids=cids,
            options=[QuizMcqOptionLLM(id=i, text=t) for i, t in block["options"]],
            correct_option_id=block["correct"],
            explanation=block["explanation"],
            hints=["Eliminate absolute statements.", "Think about the core definition."],
        )

    if format == "short_answer":
        block = tpl["short_answer"]
        prompt = block["prompt"]
        if custom_topic:
            prompt = f"About {name}: {prompt}"
        return QuizQuestionLLM(
            format="short_answer",
            prompt=prompt,
            difficulty=difficulty,
            concept_ids=cids,
            expected_elements=block["expected"],
            explanation=block["explanation"],
            hints=["Keep it to 1–3 sentences."],
        )

    if format == "case_study":
        block = tpl["case_study"]
        context = block["context"]
        if custom_topic:
            context = f"Suppose a market move related to {custom_topic}. " + context
        return QuizQuestionLLM(
            format="case_study",
            prompt=block["prompt"],
            difficulty=difficulty,
            concept_ids=cids,
            context=context,
            expected_elements=block["expected"],
            explanation=block["explanation"],
            hints=["Separate catalyst from mechanism."],
        )

    # analysis
    block = tpl["analysis"]
    prompt = block["prompt"]
    if custom_topic:
        prompt = f"Focusing on {name}: {prompt}"
    return QuizQuestionLLM(
        format="analysis",
        prompt=prompt,
        difficulty=difficulty,
        concept_ids=cids,
        expected_elements=block["expected"],
        explanation=block["explanation"],
        hints=["State the mechanism, then a risk."],
        skill="walk_me_through",
    )
