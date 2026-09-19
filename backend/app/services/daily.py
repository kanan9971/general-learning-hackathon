"""Learning cycle + daily session orchestration. The roadmap is the long cycle; each day gets a fresh
30-45 minute session built from that day's market and the cycle's current phase. Progress is counted in
goal days *completed*, so missed days stretch the cycle instead of resetting it."""
import asyncio
import uuid
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from ..config import get_settings
from ..db import daily as daily_db
from ..db.client import user_client
from ..db.memory_quiz import STORE, deep
from ..errors import ApiError
from ..learning import cycle as cy
from ..llm.client import LLMError
from ..llm.prompts import analyst_note as note_prompt
from ..llm.structured import generate
from ..market.guide import load_guide
from ..rag.context import build_news_context
from ..schemas.ai import AnalystNoteLLM
from ..schemas.daily import (
    NOTE_PROMPT_IDS, AnalysisBrief, AnalysisFeedback, AnalysisSubmit, CompleteTaskRequest, CycleStatus, DailyTask,
    DailyToday, NotePrompt, PhaseInfo, PhaseTopic, PromptScore, WeekSummary,
)
from ..schemas.markets import Headline, MarketsFeed, Move
from . import markets as markets_service
from . import quiz as quiz_service
from . import roadmap as roadmap_service

NY = ZoneInfo("America/New_York")
HISTORY_DAYS = 120
PASS_SCORE = 45
NOTE_PROMPTS = [
    NotePrompt(id="moved", title="What moved?", hint="Name the biggest move and its direction, using today's numbers."),
    NotePrompt(id="evidence", title="What's the evidence?", hint="Cite the data and headlines. Keep fact and interpretation apart."),
    NotePrompt(id="chain", title="Why: the chain", hint="Trace cause to effect in at least two steps."),
    NotePrompt(id="affected", title="Who else is affected?", hint="Name two other assets or sectors and which way each moves."),
    NotePrompt(id="wrong_if", title="What would prove you wrong?", hint="A condition or alternative explanation that would change your view."),
]


def _today(raw: str | None) -> date:
    if raw:
        try:
            return date.fromisoformat(raw)
        except ValueError as e:
            raise ApiError("invalid_request", "today must be YYYY-MM-DD", 422) from e
    return datetime.now(NY).date()


# ---------- persistence: memory always, Supabase best-effort when configured ----------

def _db(token: str | None):
    s = get_settings()
    if s.quiz_use_memory or not token or not s.supabase_url or not s.supabase_anon_key:
        return None
    return user_client(token)


def _load_cycle(user_id: str, token: str | None) -> dict | None:
    db = _db(token)
    if db is not None:
        try:
            row = daily_db.get_active_cycle(db, user_id)
            if row:
                return {**row, "started_on": str(row["started_on"])}
        except Exception:  # noqa: BLE001 - migration 0007 may not be applied yet; fall back to memory
            pass
    rows = STORE.cycles.get(user_id) or []
    return deep(rows[-1]) if rows else None


def _save_cycle(user_id: str, token: str | None, row: dict) -> None:
    for old in STORE.cycles.get(user_id, []):
        old["is_active"] = False
    STORE.cycles.setdefault(user_id, []).append(deep(row))
    db = _db(token)
    if db is not None:
        try:
            daily_db.deactivate_cycles(db, user_id)
            daily_db.insert_cycle(db, row)
        except Exception:  # noqa: BLE001
            pass


def _load_sessions(user_id: str, token: str | None, since: date) -> dict[date, dict]:
    out: dict[date, dict] = {}
    for (uid, iso), row in STORE.daily_sessions.items():
        if uid == user_id and iso >= since.isoformat():
            out[date.fromisoformat(iso)] = deep(row)
    db = _db(token)
    if db is not None:
        try:
            for row in daily_db.list_sessions(db, user_id, since.isoformat()):
                out[date.fromisoformat(str(row["session_date"]))] = row
        except Exception:  # noqa: BLE001
            pass
    return out


def _save_session(user_id: str, token: str | None, row: dict) -> None:
    STORE.daily_sessions[(user_id, str(row["session_date"]))] = deep(row)
    db = _db(token)
    if db is not None:
        try:
            daily_db.upsert_session(db, row)
        except Exception:  # noqa: BLE001
            pass


# ---------- cycle + session context ----------

def _create_cycle(user_id: str, token: str | None, level: str, roadmap, today: date) -> dict:
    row = {"id": str(uuid.uuid4()), "user_id": user_id, "started_on": today.isoformat(), "level": level,
           "phases": cy.plan_phases(load_guide().cycle_phases, roadmap, level), "is_active": True,
           "created_at": datetime.now(timezone.utc).isoformat()}
    _save_cycle(user_id, token, row)
    return row


class _Ctx:
    def __init__(self, user_id, token, level, today):
        self.user_id, self.token, self.today = user_id, token, today
        self.guide = load_guide()
        self.roadmap = roadmap_service.get_roadmap(user_id, token, level)
        self.level = self.roadmap.level
        self.cycle = _load_cycle(user_id, token) or _create_cycle(user_id, token, self.level, self.roadmap, today)
        self.phases = self.cycle["phases"]
        self.started = date.fromisoformat(str(self.cycle["started_on"]))
        self.sessions = _load_sessions(user_id, token, today - timedelta(days=HISTORY_DAYS))
        self.titles = {n.id: n.title for n in self.roadmap.nodes}
        self.nodes = {n.id: n for n in self.roadmap.nodes}
        self.total = len(self.phases) * cy.DAYS_PER_PHASE

    def in_cycle_goal_days(self, before: date | None = None) -> int:
        return sum(1 for d, s in self.sessions.items()
                   if s.get("cycle_id") == self.cycle["id"] and s.get("goal_met") and cy.is_market_day(d)
                   and (before is None or d < before))

    def met_dates(self) -> set[date]:
        return {d for d, s in self.sessions.items() if s.get("goal_met")}

    def ensure_session(self) -> dict:
        row = self.sessions.get(self.today)
        if row:
            return row
        market = cy.is_market_day(self.today)
        p_idx, day_in, _ = cy.locate(self.phases, self.in_cycle_goal_days(before=self.today))
        focus = cy.focus_for(self.phases[p_idx], day_in, self.roadmap)
        tasks = cy.build_tasks(market, self.titles.get(focus, focus))
        row = {"id": str(uuid.uuid4()), "user_id": self.user_id, "cycle_id": self.cycle["id"],
               "session_date": self.today.isoformat(), "is_market_day": market, "phase_index": p_idx,
               "day_in_phase": day_in, "focus_node_id": focus, "theme": cy.THEMES[self.today.weekday()],
               "tasks": [t.model_dump() for t in tasks], "minutes_planned": sum(t.minutes for t in tasks),
               "minutes_done": 0, "goal_met": False, "created_at": datetime.now(timezone.utc).isoformat(),
               "completed_at": None}
        self.sessions[self.today] = row
        _save_session(self.user_id, self.token, row)
        return row

    def verdict(self):
        return cy.adherence(self.started, self.today, self.in_cycle_goal_days(before=self.today))


# ---------- today's evidence pool ----------

def _moves_by_symbol(feed: MarketsFeed) -> dict[str, Move]:
    return {m.symbol: m for s in feed.sections for m in s.moves}


def analysis_brief(feed: MarketsFeed) -> AnalysisBrief | None:
    by_sym = _moves_by_symbol(feed)
    ranked = sorted(by_sym.values(), key=lambda m: m.score, reverse=True)
    market = [m for m in ranked if m.section not in ("companies", "portfolio")]
    if not ranked:
        return None
    target = (market or ranked)[0]
    related: dict[str, Move] = {}
    for r in load_guide().relationships:
        other = r.effect if r.cause == target.symbol else r.cause if r.effect == target.symbol else None
        if other and other in by_sym:
            related.setdefault(other, by_sym[other])
    for m in [x for x in ranked if x.section == target.section and x.symbol != target.symbol][:2]:
        related.setdefault(m.symbol, m)
    heads: dict[str, Headline] = {}
    for sec_id in (target.section, "macro"):
        sec = next((s for s in feed.sections if s.id == sec_id), None)
        for h in (sec.headlines[:3] if sec else []):
            heads.setdefault(h.id, h)
    return AnalysisBrief(target=target, related=list(related.values())[:4], headlines=list(heads.values())[:5],
                         prompts=NOTE_PROMPTS)


def _week_summary(ctx: _Ctx) -> WeekSummary:
    monday = ctx.today - timedelta(days=ctx.today.weekday())
    days = [d for d in (monday + timedelta(days=i) for i in range(7)) if d <= ctx.today]
    rows = [ctx.sessions[d] for d in days if d in ctx.sessions]
    scores = [t["result"]["score"] for r in rows for t in r["tasks"]
              if t["id"] == "analysis" and t["status"] == "done" and t.get("result") and "score" in t["result"]]
    return WeekSummary(days_met=sum(1 for r in rows if r.get("goal_met") and r["is_market_day"]),
                       market_days=sum(1 for d in days if cy.is_market_day(d)),
                       notes_written=len(scores), avg_note_score=round(sum(scores) / len(scores)) if scores else None,
                       minutes=sum(int(r.get("minutes_done", 0)) for r in rows))


async def _compose(ctx: _Ctx) -> DailyToday:
    row = ctx.ensure_session()
    feed = await markets_service.build_feed(ctx.user_id, [], [])
    tasks = [DailyTask.model_validate(t) for t in row["tasks"]]
    phase = ctx.phases[row["phase_index"]]
    node = ctx.nodes.get(row["focus_node_id"])
    streak, best = cy.streaks(ctx.met_dates(), ctx.today)
    verdict, behind = ctx.verdict()
    try:
        due = quiz_service.learn_progress(ctx.user_id, ctx.token).due_reviews[:4]
    except Exception:  # noqa: BLE001 - progress store hiccup must not block the session
        due = []
    return DailyToday(
        date=ctx.today.isoformat(), weekday=ctx.today.strftime("%A"), is_market_day=bool(row["is_market_day"]),
        theme=row["theme"], day_number=min(ctx.in_cycle_goal_days(before=ctx.today) + 1, ctx.total),
        total_goal_days=ctx.total,
        phase=PhaseInfo(index=phase["index"], title=phase["title"], theme=phase["theme"],
                        topics=[PhaseTopic(id=t, title=ctx.titles.get(t, t),
                                           section_id=ctx.nodes[t].section_id if t in ctx.nodes else None)
                                for t in phase["topics"]]),
        focus_node_id=row["focus_node_id"], focus_title=ctx.titles.get(row["focus_node_id"], row["focus_node_id"]),
        focus_section_id=node.section_id if node else None, tasks=tasks, minutes_planned=int(row["minutes_planned"]),
        minutes_done=cy.minutes_done(tasks), goal_met=bool(row["goal_met"]), streak=streak, best_streak=best,
        verdict=verdict, behind_by=behind, cycle_complete=ctx.in_cycle_goal_days(before=ctx.today) >= ctx.total,
        as_of=feed.as_of, data_mode=feed.data_mode, top_moves=feed.top_moves[:3],
        analysis=analysis_brief(feed) if row["is_market_day"] else None,
        week=_week_summary(ctx) if ctx.today.weekday() >= 4 else None, due_concepts=due)


async def get_today(user_id: str, token: str | None, level: str | None, today: str | None) -> DailyToday:
    return await _compose(_Ctx(user_id, token, level, _today(today)))


def get_cycle(user_id: str, token: str | None, level: str | None, today: str | None) -> CycleStatus:
    ctx = _Ctx(user_id, token, level, _today(today))
    row = ctx.ensure_session()
    completed = ctx.in_cycle_goal_days()
    completed_before = ctx.in_cycle_goal_days(before=ctx.today)
    streak, best = cy.streaks(ctx.met_dates(), ctx.today)
    verdict, behind = ctx.verdict()
    p_idx, _, complete = cy.locate(ctx.phases, completed)
    week_start = ctx.today - timedelta(days=ctx.today.weekday())
    return CycleStatus(
        started_on=ctx.started.isoformat(), level=ctx.cycle["level"], completed_days=completed, total_days=ctx.total,
        day_number=min(completed_before + 1, ctx.total), phase_index=row["phase_index"],
        phase_title=ctx.phases[row["phase_index"]]["title"], focus_node_id=row["focus_node_id"], streak=streak,
        best_streak=best, verdict=verdict, behind_by=behind,
        week_minutes=sum(int(s.get("minutes_done", 0)) for d, s in ctx.sessions.items() if d >= week_start),
        complete=complete, phases=cy.phase_progress(ctx.phases, completed, ctx.titles),
        calendar=cy.calendar(ctx.sessions, ctx.today))


def restart_cycle(user_id: str, token: str | None, level: str | None, today: str | None) -> CycleStatus:
    d = _today(today)
    roadmap = roadmap_service.get_roadmap(user_id, token, level)
    _create_cycle(user_id, token, roadmap.level, roadmap, d)
    return get_cycle(user_id, token, level, today)


# ---------- completing blocks ----------

def _mark_done(ctx: _Ctx, row: dict, task_id: str, result: dict | None) -> None:
    for t in row["tasks"]:
        if t["id"] == task_id:
            t.update(status="done", result=result, done_at=datetime.now(timezone.utc).isoformat())
            break
    tasks = [DailyTask.model_validate(t) for t in row["tasks"]]
    row["minutes_done"] = cy.minutes_done(tasks)
    was = row["goal_met"]
    row["goal_met"] = cy.goal_met(bool(row["is_market_day"]), tasks)
    if row["goal_met"] and not was:
        row["completed_at"] = datetime.now(timezone.utc).isoformat()
    _save_session(ctx.user_id, ctx.token, row)


async def complete_task(user_id: str, token: str | None, task_id: str, req: CompleteTaskRequest) -> DailyToday:
    ctx = _Ctx(user_id, token, req.level, _today(req.today))
    row = ctx.ensure_session()
    task = next((t for t in row["tasks"] if t["id"] == task_id), None)
    if task is None:
        raise ApiError("unknown_task", f"No '{task_id}' block in today's session", 404)
    if task_id == "analysis":
        raise ApiError("use_analysis_endpoint", "Submit the analyst note to complete this block", 422)
    result: dict | None = None
    if task_id == "brief":
        if len((req.call or "").strip()) < 20:
            raise ApiError("answer_too_short", "Write at least a sentence: your own read of the market.", 422)
        result = {"call": req.call.strip()[:600]}  # type: ignore[union-attr]
    elif task_id == "review":
        if len((req.watch or "").strip()) < 5:
            raise ApiError("answer_too_short", "Name one thing you will watch next.", 422)
        result = {"watch": req.watch.strip()[:300]}  # type: ignore[union-attr]
    elif task_id == "practice":
        need = 4 if row["is_market_day"] else 3
        if (req.answered or 0) < need:
            raise ApiError("not_enough_answers", f"Answer at least {need} questions.", 422)
        result = {"answered": req.answered, "correct": req.correct or 0}
    _mark_done(ctx, row, task_id, result)
    return await _compose(ctx)


def _fallback_note(target: Move, answers: dict[str, str]) -> tuple[list[PromptScore], str]:
    """No LLM: give credit for effort, be honest that it was not graded against the evidence."""
    scores = [PromptScore(prompt_id=k, score=2 if len(answers.get(k, "").split()) >= 8 else 1,
                          comment="The AI grader was unavailable, so this only checks that you wrote it out.")
              for k in NOTE_PROMPT_IDS]
    rel = next((r for r in load_guide().relationships if target.symbol in (r.cause, r.effect)), None)
    note = (f"{target.label} was today's biggest move versus a typical day. " + (rel.why if rel else
            "Trace the cause through the rate or risk channel, name two other assets, and say what would change your view."))
    return scores, note


async def submit_analysis(user_id: str, token: str | None, req: AnalysisSubmit) -> AnalysisFeedback:
    ctx = _Ctx(user_id, token, req.level, _today(req.today))
    row = ctx.ensure_session()
    if not row["is_market_day"]:
        raise ApiError("no_analysis_today", "Analyst notes are for market days.", 422)
    answers = {k: (req.answers.get(k) or "").strip() for k in NOTE_PROMPT_IDS}
    short = [k for k, v in answers.items() if len(v) < 12]
    if short:
        raise ApiError("answer_too_short", f"Write a sentence or two for: {', '.join(short)}", 422)
    feed = await markets_service.build_feed(user_id, [], [])
    brief = analysis_brief(feed)
    if brief is None:
        raise ApiError("no_market_data", "No market data to write about right now.", 503, True)

    s = get_settings()
    news_context, _ = build_news_context(brief.headlines)
    audit = {"user_id": user_id, "route": "daily.analysis", "prompt_version": note_prompt.PROMPT_VERSION}
    graded_by = "llm"
    strengths: list[str] = []
    gaps: list[str] = []
    try:
        res = await asyncio.to_thread(
            generate, AnalystNoteLLM, system=note_prompt.SYSTEM, model=s.xai_model_fast,
            prompt_version=note_prompt.PROMPT_VERSION, max_tokens=1500,
            user=note_prompt.build_user(
                target=markets_service._fact_row(brief.target), related=[markets_service._fact_row(m) for m in brief.related],
                news_context=news_context, answers=answers, allowed_concepts=markets_service.allowed_concepts()))
        v = res.value
        by = {p.prompt_id: p for p in v.prompt_scores}
        scores = [PromptScore(prompt_id=k, score=by[k].score, comment=markets_service.strip_numbers(by[k].comment))
                  for k in NOTE_PROMPT_IDS if k in by]
        if len(scores) != len(NOTE_PROMPT_IDS):
            raise LLMError("grader skipped a prompt")
        strengths = [markets_service.strip_numbers(x) for x in v.strengths]
        gaps = [markets_service.strip_numbers(x) for x in v.gaps]
        model_note = markets_service.strip_numbers(v.model_note)
        markets_service._audit({**audit, "model": res.model, "latency_ms": res.latency_ms, "ok": True,
                                "input_tokens": res.input_tokens, "output_tokens": res.output_tokens})
    except LLMError as e:
        graded_by = "fallback"
        scores, model_note = _fallback_note(brief.target, answers)
        markets_service._audit({**audit, "model": s.xai_model_fast, "ok": False, "error": str(e)[:300]})

    score = round(100 * sum(p.score for p in scores) / (4 * len(scores)))  # overall is computed here, not by the model
    observed = "correct" if score >= 75 else "partial" if score >= PASS_SCORE else "incorrect"
    passed = graded_by == "fallback" or score >= PASS_SCORE  # an outage never blocks the day
    if passed:
        _mark_done(ctx, row, "analysis", {"score": score, "observed": observed, "graded_by": graded_by,
                                           "target": brief.target.label, "answers": answers})
        if graded_by == "llm":
            node = ctx.nodes.get(row["focus_node_id"])
            try:
                quiz_service.record_observation(user_id, token, ((node.concept_ids[:2] if node else []) + ["st-morning-meeting"]),
                                                observed)
            except Exception:  # noqa: BLE001
                pass
    return AnalysisFeedback(score=score, observed=observed, passed=passed, prompt_scores=scores,  # type: ignore[arg-type]
                            strengths=strengths, gaps=gaps, model_note=model_note, graded_by=graded_by,  # type: ignore[arg-type]
                            today=await _compose(ctx))
