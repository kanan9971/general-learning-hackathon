"""Push backend/.env to the linked Vercel project (production). Run from backend/:
   python3 ../scripts/vercel_env_push.py
Skips local-only flags; forces live data, open CORS, tokenless demo, fresh HMAC secret."""
import secrets, subprocess

env = {}
for line in open(".env"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        env[k] = v.strip().strip('"').strip("'")
env = {k: v for k, v in env.items() if k not in {"AUTH_DEV_BYPASS", "DEV_FIXTURES"} and v}
env.update(DATA_MODE="live", ALLOWED_ORIGINS="*", PUBLIC_DEMO="true", QUIZ_HMAC_SECRET=secrets.token_urlsafe(32))
for k, v in env.items():
    r = subprocess.run(["vercel", "env", "add", k, "production", "--force"], input=v, text=True, capture_output=True)
    print(k, "ok" if r.returncode == 0 else "FAIL " + r.stderr[-120:])
