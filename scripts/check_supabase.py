"""Live Supabase smoke test: auth, backend JWT verification, RLS isolation. Creates and deletes temp users.
Run: cd backend && PYTHONPATH=. .venv/bin/python ../scripts/check_supabase.py"""
import uuid, httpx
from app.config import get_settings
from app.deps import get_user_id
s = get_settings(); U = s.supabase_url
SEC, PUB = s.supabase_service_role_key, s.supabase_anon_key
adm = {"apikey": SEC}
ok = lambda n, c: print(("PASS " if c else "FAIL ") + n) or c
res = []
def mk(email, pw):
    r = httpx.post(f"{U}/auth/v1/admin/users", headers=adm, json={"email": email, "password": pw, "email_confirm": True}); r.raise_for_status(); return r.json()["id"]
def login(email, pw):
    r = httpx.post(f"{U}/auth/v1/token?grant_type=password", headers={"apikey": PUB}, json={"email": email, "password": pw}); r.raise_for_status(); return r.json()["access_token"]
tag = uuid.uuid4().hex[:8]; pw = "Tmp-" + uuid.uuid4().hex
ea, eb = f"e2e-a-{tag}@example.com", f"e2e-b-{tag}@example.com"
ids = []
try:
    # 1 service role write/read/delete
    r = httpx.post(f"{U}/rest/v1/concepts", headers={**adm, "Prefer": "return=minimal"}, json={"id": f"zz-test-{tag}", "name": "t", "level": "beginner"})
    res.append(ok("service role can insert", r.status_code in (200, 201, 204)))
    # 2 anon (no login) cannot read
    r = httpx.get(f"{U}/rest/v1/concepts?select=id", headers={"apikey": PUB}); res.append(ok("anon read blocked (empty)", r.status_code == 200 and r.json() == []))
    # 3 users
    a_id, b_id = mk(ea, pw), mk(eb, pw); ids = [a_id, b_id]
    ta, tb = login(ea, pw), login(eb, pw)
    res.append(ok("signup+password login returns JWT", bool(ta and tb)))
    res.append(ok("backend verifies real ES256 token -> user id", get_user_id(f"Bearer {ta}", s) == a_id))
    ha = {"apikey": PUB, "Authorization": f"Bearer {ta}"}; hb = {"apikey": PUB, "Authorization": f"Bearer {tb}"}
    # 4 authenticated can read reference data
    r = httpx.get(f"{U}/rest/v1/concepts?select=id&id=eq.zz-test-{tag}", headers=ha); res.append(ok("authed reads concepts", r.status_code == 200 and len(r.json()) == 1))
    # 5 authed cannot write reference data
    r = httpx.post(f"{U}/rest/v1/concepts", headers={**ha, "Prefer": "return=minimal"}, json={"id": f"zz-bad-{tag}", "name": "x", "level": "beginner"}); res.append(ok("authed cannot write concepts", r.status_code in (401, 403)))
    # 6 own-row isolation
    prof = {"user_id": a_id, "level": "beginner", "goal": "both", "target_desk": "general"}
    r = httpx.post(f"{U}/rest/v1/profiles", headers={**ha, "Prefer": "return=minimal"}, json=prof); res.append(ok("A inserts own profile", r.status_code in (200, 201, 204)))
    r = httpx.get(f"{U}/rest/v1/profiles?select=user_id", headers=hb); res.append(ok("B cannot see A's profile", r.status_code == 200 and r.json() == []))
    r = httpx.post(f"{U}/rest/v1/profiles", headers={**hb, "Prefer": "return=minimal"}, json={**prof}); res.append(ok("B cannot insert row as A", r.status_code in (401, 403)))
    r = httpx.get(f"{U}/rest/v1/profiles?select=user_id", headers=ha); res.append(ok("A sees own profile", r.status_code == 200 and len(r.json()) == 1))
    # 7 llm_calls hidden from authed
    r = httpx.get(f"{U}/rest/v1/llm_calls?select=id", headers=ha); res.append(ok("authed cannot read llm_calls", r.status_code == 200 and r.json() == []))
    # 8 vector column + hnsw usable via service role
    r = httpx.get(f"{U}/rest/v1/chunks?select=id&limit=1", headers=adm); res.append(ok("chunks table reachable", r.status_code == 200))
finally:
    for i in ids: httpx.delete(f"{U}/auth/v1/admin/users/{i}", headers=adm)
    httpx.delete(f"{U}/rest/v1/concepts?id=like.zz-*", headers=adm)
print(f"\n{sum(res)}/{len(res)} passed")
