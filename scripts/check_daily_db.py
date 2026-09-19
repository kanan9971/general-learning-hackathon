"""Live check for migration 0007: persistence, reload-from-DB, RLS isolation. Creates and deletes temp users."""
import asyncio, uuid, httpx
from app.config import get_settings
from app.db.memory_quiz import STORE
from app.deps import get_user_id
from app.schemas.daily import CompleteTaskRequest
from app.services import daily as daily_service

s = get_settings(); U = s.supabase_url
adm = {"apikey": s.supabase_service_role_key}; PUB = s.supabase_anon_key
res = []
def ok(name, cond): print(("PASS " if cond else "FAIL ") + name); res.append(bool(cond))
def mk(e, pw): return httpx.post(f"{U}/auth/v1/admin/users", headers=adm, json={"email": e, "password": pw, "email_confirm": True}).json()["id"]
def login(e, pw): return httpx.post(f"{U}/auth/v1/token?grant_type=password", headers={"apikey": PUB}, json={"email": e, "password": pw}).json()["access_token"]
tag = uuid.uuid4().hex[:8]; pw = "Tmp-" + uuid.uuid4().hex; ids = []
D = "2026-09-21"
try:
    ea, eb = f"daily-a-{tag}@example.com", f"daily-b-{tag}@example.com"
    a, b = mk(ea, pw), mk(eb, pw); ids = [a, b]; ta, tb = login(ea, pw), login(eb, pw)
    ok("backend verifies real token", get_user_id(f"Bearer {ta}", s) == a)
    ha = {"apikey": PUB, "Authorization": f"Bearer {ta}"}; hb = {"apikey": PUB, "Authorization": f"Bearer {tb}"}

    t1 = asyncio.run(daily_service.get_today(a, ta, "beginner", D))
    cyc = httpx.get(f"{U}/rest/v1/learning_cycles?select=id,started_on,level,is_active,phases", headers=ha).json()
    ses = httpx.get(f"{U}/rest/v1/daily_sessions?select=id,session_date,phase_index,focus_node_id,tasks,goal_met", headers=ha).json()
    ok("cycle written to Supabase", isinstance(cyc, list) and len(cyc) == 1 and cyc[0]["is_active"] and len(cyc[0]["phases"]) == 8)
    ok("session written to Supabase", isinstance(ses, list) and len(ses) == 1 and ses[0]["session_date"] == D and len(ses[0]["tasks"]) == 5)

    asyncio.run(daily_service.complete_task(a, ta, "focus", CompleteTaskRequest(level="beginner", today=D)))
    ses = httpx.get(f"{U}/rest/v1/daily_sessions?select=tasks,minutes_done", headers=ha).json()
    done = [t["id"] for t in ses[0]["tasks"] if t["status"] == "done"]
    ok("task completion persisted", done == ["focus"] and ses[0]["minutes_done"] == 8)

    STORE.cycles.clear(); STORE.daily_sessions.clear()   # wipe the in-memory copy: must now come from the database
    t2 = asyncio.run(daily_service.get_today(a, ta, "beginner", D))
    ok("reloads from Supabase, not memory (same day, progress kept)", t2.minutes_done == 8 and [t.id for t in t2.tasks if t.status == "done"] == ["focus"])
    ok("no duplicate cycle/session after reload",
       len(httpx.get(f"{U}/rest/v1/learning_cycles?select=id", headers=ha).json()) == 1
       and len(httpx.get(f"{U}/rest/v1/daily_sessions?select=id", headers=ha).json()) == 1)

    ok("user B cannot see A's cycle", httpx.get(f"{U}/rest/v1/learning_cycles?select=id", headers=hb).json() == [])
    ok("user B cannot see A's session", httpx.get(f"{U}/rest/v1/daily_sessions?select=id", headers=hb).json() == [])
    r = httpx.post(f"{U}/rest/v1/daily_sessions", headers={**hb, "Prefer": "return=minimal"},
                   json={"user_id": a, "session_date": "2026-09-22", "is_market_day": True, "phase_index": 0, "day_in_phase": 0,
                         "focus_node_id": "macro", "theme": "x", "tasks": []})
    ok("user B cannot write a row as A", r.status_code in (401, 403))
    ok("anonymous cannot read sessions", httpx.get(f"{U}/rest/v1/daily_sessions?select=id", headers={"apikey": PUB}).json() == [])

    cs = daily_service.get_cycle(a, ta, "beginner", D)
    ok("cycle status reads back", cs.total_days == 40 and cs.phase_title == "The big picture")
finally:
    for i in ids: httpx.delete(f"{U}/auth/v1/admin/users/{i}", headers=adm)
left = httpx.get(f"{U}/rest/v1/daily_sessions?select=id", headers=adm).json()
ok("temp users' rows cascaded away (nothing left behind)", left == [])
print(f"\n{sum(res)}/{len(res)} passed")
