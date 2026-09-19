"""Markets feed orchestration: snapshot (market) + headlines (news) + positions (broker/portfolio)
+ static teaching guide, ordered by the learner's interests. Plus the on-demand desk note (llm)."""
import asyncio
import json
import re
import time
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

from ..broker import get_portfolio_source
from ..config import get_settings
from ..db import knowledge
from ..db.client import service_client
from ..errors import ApiError
from ..llm.client import LLMError
from ..llm.prompts import market_overview as overview_prompt
from ..llm.prompts import market_section as prompt
from ..llm.structured import generate
from ..market.snapshot import get_snapshot, load_golden
from ..market.universe import DEFAULT_COMPANIES, INSTRUMENTS, company_sector
from ..news import feeds as news_feeds
from ..news.rss import fetch_feeds
from ..portfolio.attribution import attribute
from ..rag.context import build_news_context
from ..schemas.ai import MarketOverviewLLM, MarketSectionLLM
from ..schemas.markets import (
    DeskView, Evidence, ExplainDriver, ExplainSectionResponse, GuideStep, Headline, InterestOption, MarketOverview,
    MarketSection, MarketsFeed, MarketsGuide, Move, OverviewDeskView, OverviewLink, OverviewPoint, OverviewResponse,
    ProvidersStatus, SectionExplanation,
)

GUIDE_PATH = Path(__file__).resolve().parents[1] / "data" / "markets_guide.json"
HEADLINES_PER_SECTION = 6
AI_CACHE_SECONDS = 15 * 60  # same data -> same note; don't re-bill the LLM on every tap
OVERVIEW_FACTS_PER_SECTION = 5
OVERVIEW_HEADLINES_PER_SECTION = 4
MAX_COMPANIES = 10
TICKER_RX = re.compile(r"^[A-Z][A-Z0-9.\-]{0,9}$")
# Rule 1 guard: strip any number-with-unit the LLM writes despite the prompt.
NUMBER_RX = re.compile(
    r"[-+]?\$?\d[\d,]*(?:\.\d+)?\s?(?:%|bps?\b|basis points?|percent(?:age points?)?|pts\b|points?\b)"
    r"|\$\d[\d,]*(?:\.\d+)?",
    re.IGNORECASE,
)


@lru_cache
def guide() -> MarketsGuide:
    return MarketsGuide.model_validate(json.loads(GUIDE_PATH.read_text()))


def allowed_concepts() -> list[str]:
    ids = [c for g in guide().sections for c in g.concept_ids + [x for s in g.strategies for x in s.concept_ids]]
    return list(dict.fromkeys(ids))


def clean_tickers(raw: list[str]) -> list[str]:
    out = [t.strip().upper() for t in raw if t and t.strip()]
    return list(dict.fromkeys(t for t in out if TICKER_RX.match(t)))[:MAX_COMPANIES]


async def _headlines(tickers: list[str]) -> tuple[list[Headline], ProvidersStatus | None, bool]:
    """(headlines, partial provider status, came_from_golden)."""
    s = get_settings()
    golden = [Headline.model_validate(h) for h in load_golden().get("headlines", [])]
    if s.data_mode == "demo":
        return golden, None, True
    fed, wsj, tick = news_feeds.FED_FEEDS, news_feeds.wsj_feeds(s.wsj_rss_feeds), news_feeds.ticker_feeds(tickers)
    items, ok = await fetch_feeds(fed + wsj + tick, s.yahoo_user_agent)

    def status(fs):
        got = sum(1 for f in fs if ok.get(f.url))
        return "skipped" if not fs else "ok" if got == len(fs) else "partial" if got else "failed"

    st = ProvidersStatus(prices="skipped", treasury="skipped", fed_news=status(fed), wsj_news=status(wsj),
                         ticker_news=status(tick))
    if not items:
        return golden, st, True
    return items, st, False


def _section_headlines(section_id: str, items: list[Headline], tickers: set[str]) -> list[Headline]:
    if section_id in ("companies", "portfolio"):
        picked = [h for h in items if tickers & set(h.tickers)]
        if section_id == "companies":
            picked += [h for h in items if "companies" in h.sections and h not in picked]
    else:
        picked = [h for h in items if section_id in h.sections]

    def newest(h: Headline) -> tuple[float, str]:
        return (-datetime.fromisoformat(h.published_at).timestamp() if h.published_at else 0.0), h.id

    def fed_first(h: Headline) -> tuple[int, tuple[float, str]]:
        # FOMC releases first, then reporting (which says what the decision was), then Fed speeches.
        rank = 0 if h.is_official and "fomc" in h.title.lower() else 2 if h.is_official else 1
        return rank, newest(h)

    picked.sort(key=fed_first if section_id == "macro" else newest)
    return picked[:HEADLINES_PER_SECTION]


async def build_feed(user_id: str, interests: list[str], watch: list[str]) -> MarketsFeed:
    holdings = get_portfolio_source(user_id).positions(user_id)
    held = [p.symbol for p in holdings]
    companies = list(dict.fromkeys(clean_tickers(watch) + DEFAULT_COMPANIES))[:MAX_COMPANIES]
    symbols = [i.symbol for i in INSTRUMENTS] + companies + held

    snap, (items, news_status, news_golden) = await asyncio.gather(
        get_snapshot(symbols), _headlines(list(dict.fromkeys(companies[:4] + held))),
    )
    by_sym = {m.symbol: m for m in snap.moves}

    sections: list[MarketSection] = []
    for g in guide().sections:
        note, attribution = None, None
        if g.id == "companies":
            moves = [by_sym[s] for s in companies if s in by_sym]
            tickers = set(companies)
        elif g.id == "portfolio":
            moves = [by_sym[s] for s in held if s in by_sym]
            tickers = set(held)
            prices = {m.symbol: (m.level, m.change) for m in moves if m.change_unit == "%"}
            attribution = attribute([(p.symbol, p.quantity) for p in holdings], prices,
                                    {s: company_sector(s) for s in held})
            if attribution is None:
                note = "Prices for your holdings are unavailable right now, so attribution can't be calculated."
        else:
            moves = [by_sym[i.symbol] for i in INSTRUMENTS if i.section == g.id and i.symbol in by_sym]
            tickers = set()
        if not moves and note is None:
            note = "Prices for this section are unavailable right now (provider unreachable). The guide and headlines still apply."
        sections.append(MarketSection(
            id=g.id, group=g.group, title=g.title, tagline=g.tagline, pinned=g.id in interests, moves=moves,
            headlines=_section_headlines(g.id, items, tickers), guide=g, attribution=attribution, note=note,
        ))
    sections.sort(key=lambda s: not s.pinned)  # stable: pinned first, guide order otherwise

    providers = ProvidersStatus(
        prices=snap.prices, treasury=snap.treasury,
        fed_news=news_status.fed_news if news_status else "skipped",
        wsj_news=news_status.wsj_news if news_status else "skipped",
        ticker_news=news_status.ticker_news if news_status else "skipped",
    )
    # The badge follows the numbers; with no prices at all it follows the headlines.
    data_mode = snap.data_mode if snap.moves else ("demo" if news_golden else "live")
    return MarketsFeed(
        as_of=snap.as_of, data_mode=data_mode, generated_at=datetime.now(timezone.utc).isoformat(),
        providers=providers, primer=guide().primer, top_moves=[m for m in snap.moves if m.score > 0][:5],
        sections=sections,
        interest_options=[InterestOption(id=g.id, group=g.group, title=g.title, tagline=g.tagline)
                          for g in guide().sections],
        portfolio_source=get_portfolio_source(user_id).name,
    )


# ---------- desk note (on demand; not on the feed path) ----------

def strip_numbers(text: str) -> str:
    return NUMBER_RX.sub("(see facts)", text)


def _fact_row(m: Move) -> dict:
    return {"fact_id": m.fact_id, "label": m.label, "level": m.level, "level_unit": m.level_unit,
            "change_1d": m.change, "change_unit": m.change_unit, "unusual": m.unusual}


def fallback_explanation(section: MarketSection) -> SectionExplanation:
    """Deterministic: describe the biggest move in words and reuse the guide's playbook."""
    g = section.guide
    ranked = sorted(section.moves, key=lambda m: m.score, reverse=True)
    if ranked:
        top = ranked[0]
        direction = "rose" if top.change > 0 else "fell" if top.change < 0 else "was flat"
        summary = (f"The biggest move in {g.title.lower()} was {top.label}, which {direction}. "
                   f"Use the chain below to reason about why, and check the headlines for a catalyst.")
        drivers = [ExplainDriver(explanation=f"{top.label} {direction}; the catalyst is not confirmed by an explanation model right now.",
                                 fact_ids=[top.fact_id],
                                 headline_ids=[h.id for h in section.headlines[:2]])]
    else:
        summary = f"No prices are available for {g.title.lower()} right now. Here is how this market usually works."
        drivers = [ExplainDriver(explanation=d.why, fact_ids=[], headline_ids=[]) for d in g.key_drivers[:2]]
    return SectionExplanation(
        summary=summary, drivers=drivers, chain=g.transmission,
        desk_views=[DeskView(strategy=s.name, rationale=s.idea, risk=s.what_breaks_it) for s in g.strategies[:2]],
        watch_next=g.watch[:3], confidence="low",
        confidence_reason="Template explanation: the AI explainer was unavailable.", concept_ids=g.concept_ids[:4],
    )


def validate_explanation(raw: MarketSectionLLM, fact_ids: set[str], hid_map: dict[str, Headline],
                         concepts: set[str]) -> SectionExplanation:
    """Drop unknown fact/headline/concept ids, strip stray numbers (rules 1 and 3)."""
    return SectionExplanation(
        summary=strip_numbers(raw.summary),
        drivers=[ExplainDriver(explanation=strip_numbers(d.explanation),
                               fact_ids=[f for f in d.fact_ids if f in fact_ids],
                               headline_ids=[hid_map[h].id for h in d.headline_ids if h in hid_map])
                 for d in raw.drivers],
        chain=[GuideStep(from_=strip_numbers(c.from_), to=strip_numbers(c.to), why=strip_numbers(c.why))
               for c in raw.chain],
        desk_views=[DeskView(strategy=strip_numbers(v.strategy), rationale=strip_numbers(v.rationale),
                             risk=strip_numbers(v.risk)) for v in raw.desk_views],
        watch_next=[strip_numbers(w) for w in raw.watch_next],
        confidence=raw.confidence,
        confidence_reason=strip_numbers(raw.confidence_reason),
        concept_ids=[c for c in raw.concept_ids if c in concepts],
    )


async def explain_section(user_id: str, section_id: str, level: str, watch: list[str]) -> ExplainSectionResponse:
    feed = await build_feed(user_id, [], watch)
    section = next((s for s in feed.sections if s.id == section_id), None)
    if section is None:
        raise ApiError("unknown_section", f"Unknown market section '{section_id}'", 404)

    s = get_settings()
    news_context, hid_map = build_news_context(section.headlines)
    concepts = allowed_concepts()
    g = section.guide
    audit = {"user_id": user_id, "route": "markets.explain", "prompt_version": prompt.PROMPT_VERSION}
    generated_by = "llm"
    try:
        res = await asyncio.to_thread(
            generate, MarketSectionLLM, system=prompt.SYSTEM, model=s.xai_model_fast,
            prompt_version=prompt.PROMPT_VERSION,
            user=prompt.build_user(
                section_title=g.title, desk=g.desk, level=level, facts=[_fact_row(m) for m in section.moves],
                playbook=[f"{x.name}: {x.idea} {x.how_expressed} Risk: {x.what_breaks_it}" for x in g.strategies],
                allowed_concepts=concepts, news_context=news_context,
            ),
        )
        explanation = validate_explanation(res.value, {m.fact_id for m in section.moves}, hid_map, set(concepts))
        _audit({**audit, "model": res.model, "latency_ms": res.latency_ms, "ok": True,
                "input_tokens": res.input_tokens, "output_tokens": res.output_tokens})
    except LLMError as e:
        explanation, generated_by = fallback_explanation(section), "fallback"
        _audit({**audit, "model": s.xai_model_fast, "ok": False, "error": str(e)[:300]})

    return ExplainSectionResponse(
        section_id=section.id, as_of=feed.as_of, data_mode=feed.data_mode, explanation=explanation,
        moves=section.moves, headlines=section.headlines, generated_by=generated_by,
    )


def _audit(row: dict) -> None:
    try:
        knowledge.log_llm_call(service_client(), row)
    except Exception:  # noqa: BLE001 - Supabase not configured locally; audit is best-effort
        pass


# ---------- cross-market overview (on demand; evidence-backed) ----------

_ai_cache: dict[tuple, tuple[float, object]] = {}


def _cached(key: tuple):
    hit = _ai_cache.get(key)
    return hit[1] if hit and time.time() - hit[0] < AI_CACHE_SECONDS else None


def overview_inputs(feed: MarketsFeed) -> tuple[list[Move], list[Headline]]:
    """The evidence pool: most unusual moves and freshest headlines per section, deduped."""
    moves: dict[str, Move] = {}
    heads: dict[str, Headline] = {}
    for sec in feed.sections:
        for m in sorted(sec.moves, key=lambda m: m.score, reverse=True)[:OVERVIEW_FACTS_PER_SECTION]:
            moves.setdefault(m.fact_id, m)
        for h in sec.headlines[:OVERVIEW_HEADLINES_PER_SECTION]:
            heads.setdefault(h.id, h)
    return list(moves.values()), list(heads.values())


def validate_overview(raw: MarketOverviewLLM, fact_ids: set[str], hid_map: dict[str, Headline],
                      concepts: set[str]) -> MarketOverview:
    """Keep only evidence that was provided; a point left with no evidence is flagged unsupported."""
    def facts(ids: list[str]) -> list[str]:
        return [f for f in dict.fromkeys(ids) if f in fact_ids]

    points = []
    for p in raw.key_points:
        ev = Evidence(fact_ids=facts(p.fact_ids),
                      headline_ids=[hid_map[h].id for h in dict.fromkeys(p.headline_ids) if h in hid_map])
        points.append(OverviewPoint(section_id=p.section_id, point=strip_numbers(p.point),
                                    explanation=strip_numbers(p.explanation), evidence=ev,
                                    supported=bool(ev.fact_ids or ev.headline_ids)))
    return MarketOverview(
        headline=strip_numbers(raw.headline), summary=strip_numbers(raw.summary), key_points=points,
        connections=[OverviewLink(from_=strip_numbers(c.from_), to=strip_numbers(c.to), why=strip_numbers(c.why),
                                  fact_ids=facts(c.fact_ids)) for c in raw.connections],
        desk_views=[OverviewDeskView(desk=v.desk, strategy=strip_numbers(v.strategy),
                                     rationale=strip_numbers(v.rationale), risk=strip_numbers(v.risk),
                                     fact_ids=facts(v.fact_ids)) for v in raw.desk_views],
        watch_next=[strip_numbers(w) for w in raw.watch_next], confidence=raw.confidence,
        confidence_reason=strip_numbers(raw.confidence_reason),
        concept_ids=[c for c in raw.concept_ids if c in concepts],
    )


def fallback_overview(feed: MarketsFeed, moves: list[Move]) -> MarketOverview:
    """Deterministic: biggest move per section in words, the primer as the connecting chain."""
    by_section: dict[str, list[Move]] = {}
    for m in moves:
        by_section.setdefault(m.section, []).append(m)
    points = []
    for sec in feed.sections:
        ms = sorted(by_section.get(sec.id, []), key=lambda m: m.score, reverse=True)
        if not ms:
            continue
        top = ms[0]
        direction = "rose" if top.change > 0 else "fell" if top.change < 0 else "was flat"
        points.append(OverviewPoint(
            section_id=sec.id, point=f"{sec.title}: {top.label} {direction}",
            explanation="The biggest move in this section versus a typical day. Check the linked headlines for a catalyst.",
            evidence=Evidence(fact_ids=[top.fact_id], headline_ids=[h.id for h in sec.headlines[:1]]),
            supported=True,
        ))
    top_all = sorted(moves, key=lambda m: m.score, reverse=True)
    lead = top_all[0].label if top_all else "the market"
    return MarketOverview(
        headline=f"Biggest move today: {lead}",
        summary="This is a template overview because the AI explainer is unavailable. It lists the largest move "
                "in each section; read them top-down using the chain below to build your own story.",
        key_points=points[:6],
        connections=[OverviewLink(from_=s.from_, to=s.to, why=s.why) for s in feed.primer.steps[:4]],
        desk_views=[OverviewDeskView(desk=g.title, strategy=g.strategies[0].name, rationale=g.strategies[0].idea,
                                     risk=g.strategies[0].what_breaks_it)
                    for g in guide().sections[:2]],
        watch_next=[w for g in guide().sections[:2] for w in g.watch[:2]],
        confidence="low", confidence_reason="Template overview: the AI explainer was unavailable.",
        concept_ids=["st-morning-meeting", "risk-on-off"],
    )


async def market_overview(user_id: str, level: str, interests: list[str], watch: list[str]) -> OverviewResponse:
    feed = await build_feed(user_id, interests, watch)
    moves, heads = overview_inputs(feed)
    key = ("overview", level, tuple(sorted(interests)), tuple(clean_tickers(watch)), feed.as_of, feed.data_mode)
    if (hit := _cached(key)) is not None:
        return hit  # type: ignore[return-value]

    s = get_settings()
    news_context, hid_map = build_news_context(heads)
    concepts = allowed_concepts()
    facts_by_section: dict[str, list[dict]] = {}
    for m in moves:
        facts_by_section.setdefault(m.section, []).append(_fact_row(m))
    audit = {"user_id": user_id, "route": "markets.overview", "prompt_version": overview_prompt.PROMPT_VERSION}
    generated_by = "llm"
    try:
        res = await asyncio.to_thread(
            generate, MarketOverviewLLM, system=overview_prompt.SYSTEM, model=s.xai_model_fast,
            prompt_version=overview_prompt.PROMPT_VERSION, max_tokens=2500,
            user=overview_prompt.build_user(level=level, interests=interests, facts_by_section=facts_by_section,
                                            allowed_concepts=concepts, news_context=news_context),
        )
        overview = validate_overview(res.value, {m.fact_id for m in moves}, hid_map, set(concepts))
        _audit({**audit, "model": res.model, "latency_ms": res.latency_ms, "ok": True,
                "input_tokens": res.input_tokens, "output_tokens": res.output_tokens})
    except LLMError as e:
        overview, generated_by = fallback_overview(feed, moves), "fallback"
        _audit({**audit, "model": s.xai_model_fast, "ok": False, "error": str(e)[:300]})

    out = OverviewResponse(as_of=feed.as_of, data_mode=feed.data_mode, overview=overview, moves=moves,
                           headlines=heads, generated_by=generated_by,
                           generated_at=datetime.now(timezone.utc).isoformat())
    if generated_by == "llm":
        _ai_cache[key] = (time.time(), out)
    return out

