"""The learning cycle: an 8-phase programme (5 goal days each) shaped by placement, and the daily session
built from it. Pure functions (schemas only). Progress is measured in goal days *completed*, not calendar
days, so missing days stretches the cycle instead of resetting it."""
from datetime import date, timedelta

from ..schemas.daily import CalendarDay, DailyTask, PhaseProgress, Verdict
from ..schemas.markets import CyclePhaseDef, RoadmapNodeDef
from ..schemas.roadmap import Roadmap

DAYS_PER_PHASE = 5
MIN_PHASES = 4
CORE_DONE = {"analysis", "practice"}  # the goal: a passing analyst note plus a practice set (no shortcut)
WEEKEND_CORE = {"recap", "review"}
THEMES = {
    0: "Week ahead: what is on the calendar and what is priced in?",
    1: "Deep dive: trace today's biggest move end to end",
    2: "Deep dive: cross-asset check, who else moved?",
    3: "Deep dive: challenge the obvious explanation",
    4: "Weekly wrap: what changed this week and why?",
    5: "Weekend recap: consolidate the week",
    6: "Weekend recap: consolidate the week",
}
SLIPPING_AFTER, BEHIND_AFTER = 2, 4  # missed goal days before today


def is_market_day(d: date) -> bool:
    return d.weekday() < 5


# ---------- the cycle ----------

def plan_phases(phase_defs: list[CyclePhaseDef], roadmap: Roadmap, level: str) -> list[dict]:
    """All 8 phases for a beginner. Others skip phases whose topics they have already mastered (from
    placement), keeping the capstone and at least MIN_PHASES."""
    state = {n.id: n.state for n in roadmap.nodes}
    keep = list(phase_defs)
    if level != "beginner":
        known = [p for p in phase_defs[:-1] if all(state.get(t, "not_started") == "mastered" for t in p.topics if t in state)]
        keep = [p for p in phase_defs if p not in known]
        while len(keep) < min(MIN_PHASES, len(phase_defs)) and known:
            keep.insert(0, known.pop())  # never shrink below the minimum
        keep.sort(key=lambda p: phase_defs.index(p))
    return [{"index": i, "title": p.title, "theme": p.theme, "topics": [t for t in p.topics if t in state] or p.topics}
            for i, p in enumerate(keep)]


def locate(phases: list[dict], completed_goal_days: int) -> tuple[int, int, bool]:
    """(phase_index, day_in_phase, complete) for the next goal day."""
    total = len(phases) * DAYS_PER_PHASE
    if completed_goal_days >= total:
        return len(phases) - 1, DAYS_PER_PHASE - 1, True
    return completed_goal_days // DAYS_PER_PHASE, completed_goal_days % DAYS_PER_PHASE, False


def focus_for(phase: dict, day_in_phase: int, roadmap: Roadmap) -> str:
    """Rotate the phase's topics across its days, but open with a weak spot if the phase has one."""
    topics = phase["topics"]
    by_id = {n.id: n for n in roadmap.nodes}
    weak = [t for t in topics if by_id.get(t) and by_id[t].state == "priority"]
    if weak and day_in_phase in (0, 2):
        return weak[0]
    return topics[day_in_phase % len(topics)]


# ---------- the daily session ----------

def build_tasks(market_day: bool, focus_title: str) -> list[DailyTask]:
    if market_day:
        specs = [
            ("brief", "Morning brief", "Skim today's map, then write your own read of the market before seeing the AI's.", 6),
            ("focus", f"Focus: {focus_title}", "Today's topic, tied to what actually moved.", 8),
            ("analysis", "Analyst note", "Write a short note on today's biggest move, graded against the real data.", 15),
            ("practice", "Practice: what-ifs", "Five questions on today's market and your weak spots.", 8),
            ("review", "Review and plan tomorrow", "Quick spaced review, then one thing to watch tomorrow.", 3),
        ]
    else:
        specs = [
            ("recap", "Weekly recap", "Look back at your week: days, notes and what you learned.", 10),
            ("practice", "Light practice", "A short what-if set to keep the week fresh.", 8),
            ("review", "Review and plan the week", "Spaced review, then one thing to watch on Monday.", 3),
        ]
    return [DailyTask(id=k, kind=k, title=t, blurb=b, minutes=m) for k, t, b, m in specs]  # type: ignore[arg-type]


def goal_met(market_day: bool, tasks: list[DailyTask]) -> bool:
    done = {t.id for t in tasks if t.status == "done"}
    return (CORE_DONE if market_day else WEEKEND_CORE) <= done


def minutes_done(tasks: list[DailyTask]) -> int:
    return sum(t.minutes for t in tasks if t.status == "done")


# ---------- streaks, adherence, calendar ----------

def _market_days_back(start: date) -> list[date]:
    d, out = start, []
    while len(out) < 400:
        if is_market_day(d):
            out.append(d)
        d -= timedelta(days=1)
    return out


def streaks(met_dates: set[date], today: date) -> tuple[int, int]:
    """(current, best) over consecutive *market* days that hit the goal. Weekends never break a streak;
    a market day not yet done today doesn't either (you still have time)."""
    cur, cursor = 0, today
    days = _market_days_back(cursor)
    for i, d in enumerate(days):
        if d in met_dates:
            cur += 1
        elif d == today and i == 0:
            continue
        else:
            break
    best = run = 0
    if met_dates:
        d = min(met_dates)
        while d <= today:
            if is_market_day(d):
                run = run + 1 if d in met_dates else 0
                best = max(best, run)
            d += timedelta(days=1)
    return cur, max(best, cur)


def adherence(started_on: date, today: date, completed_before_today: int) -> tuple[Verdict, int]:
    """Compare goal days completed with market days that have already passed since the cycle began."""
    expected, d = 0, started_on
    while d < today:
        expected += is_market_day(d)
        d += timedelta(days=1)
    behind = max(0, expected - completed_before_today)
    return ("on_track" if behind < SLIPPING_AFTER else "slipping" if behind < BEHIND_AFTER else "behind"), behind


def calendar(sessions_by_date: dict[date, dict], today: date, days: int = 14) -> list[CalendarDay]:
    out = []
    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        s = sessions_by_date.get(d)
        if d == today:
            status = "met" if s and s.get("goal_met") else "today"
        elif not is_market_day(d):
            status = "met" if s and s.get("goal_met") else "rest"
        elif s and s.get("goal_met"):
            status = "met"
        elif s and s.get("minutes_done", 0) > 0:
            status = "partial"
        else:
            status = "missed"
        out.append(CalendarDay(date=d.isoformat(), weekday=d.strftime("%a"), status=status,  # type: ignore[arg-type]
                               minutes=int(s.get("minutes_done", 0)) if s else 0))
    return out


def phase_progress(phases: list[dict], completed: int, titles: dict[str, str]) -> list[PhaseProgress]:
    out = []
    for p in phases:
        start = p["index"] * DAYS_PER_PHASE
        done = max(0, min(DAYS_PER_PHASE, completed - start))
        state = "done" if done >= DAYS_PER_PHASE else "current" if start <= completed < start + DAYS_PER_PHASE else "upcoming"
        out.append(PhaseProgress(index=p["index"], title=p["title"], theme=p["theme"],
                                 topics=[titles.get(t, t) for t in p["topics"]], days_done=done,
                                 days_total=DAYS_PER_PHASE, state=state))  # type: ignore[arg-type]
    return out


def node_title(defs: list[RoadmapNodeDef], roadmap: Roadmap, node_id: str) -> str:
    n = next((x for x in roadmap.nodes if x.id == node_id), None)
    return n.title if n else node_id
