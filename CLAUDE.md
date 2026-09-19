# DeskReady — AI daily market tutor (hackathon)

Mobile app that runs a daily loop: OBSERVE → EXPLAIN → APPLY → ANSWER → FEEDBACK → REVISIT.
## START HERE (every new chat)
Before writing or changing any code, read **docs/ARCHITECTURE.md** — it defines what each module does and
what may call/import what. Treat it as the contract. If your change adds a dependency edge, new module or
new data flow, update ARCHITECTURE.md in the same commit. Product scope and phases: docs/PLAN.md.
Expo (SDK 57) has changed a lot: read https://docs.expo.dev/versions/v57.0.0/ before writing mobile code (see apps/mobile/AGENTS.md).

Full plan: docs/PLAN.md. Deadline-driven (16h, 4 people): prefer working + simple over clever.
Feature freeze at H13. P0 = the "magic moment" loop in docs/PLAN.md §18.

## Stack
- apps/mobile — Expo (React Native, TypeScript), Expo Router, NativeWind, TanStack Query, supabase-js
- backend — Python FastAPI deployed on Vercel serverless (entry: backend/api/index.py)
- supabase — Postgres + pgvector + Auth (email/password) + RLS; SQL migrations in supabase/migrations
- LLM: xAI Grok via `openai` SDK (base_url https://api.x.ai/v1); model IDs from env (`XAI_MODEL_FAST`, `XAI_MODEL_REASONING`)
- Embeddings: Alibaba Qwen `qwen3.7-text-embedding` via DashScope OpenAI-compatible API, 1536-d (OpenAI is blocked in Hong Kong; provider is swappable via `EMBEDDING_*` env vars, but dims must match `vector(1536)`)
- Market data: Yahoo Finance chart endpoint via httpx (prices) with `yfinance` as a local-only fallback (never in requirements.txt: pandas is too heavy for Vercel) + Treasury.gov daily yield curve (2Y, curve; keyless)
- News: Federal Reserve RSS + WSJ public RSS (`feeds.content.dowjones.io`; the old `feeds.a.dj.com` is frozen) + Yahoo Finance ticker RSS — headline, summary, URL, timestamp only; never scrape WSJ article bodies
- Fallback chain: live → cached snapshot → golden demo day

## Commands
- Backend setup: `cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt` (copy `.env.example` → `backend/.env`, set `DEV_FIXTURES=true` for local fixture routes)
- Backend dev: `cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000`
- Backend tests: `cd backend && .venv/bin/pytest` (markers `-m rag`, `-m prompts` hit live APIs; default run is offline)
- Ingest KB (dry run): `python scripts/fetch_papers.py` then `cd backend && .venv/bin/python -m app.rag.ingest ../content/sources/research_papers.yaml` (add `--store` to embed + write to Supabase; PDFs go in `content/raw/`, gitignored)
- Ingest lessons: `cd backend && .venv/bin/python -m app.rag.ingest ../content/lessons --store`
- Live RAG eval (embeddings + Supabase): `cd backend && .venv/bin/python ../evals/run_evals.py` or `.venv/bin/pytest tests/rag/test_retrieval_live.py -o addopts=""`
- Try the tutor locally (needs `AUTH_DEV_BYPASS=true` in backend/.env): `curl -X POST localhost:8000/v1/tutor/lesson -H 'content-type: application/json' -d '{"concept_id":"real-yields","level":"beginner"}'`
- Start an adaptive quiz session (memory store under bypass): `curl -X POST localhost:8000/v1/quiz/sessions -H 'content-type: application/json' -d '{"formats":["mcq"],"concept_ids":["bond-price-yield"]}'`
- Learn progress: `curl localhost:8000/v1/learn/progress`
- Live check of daily-cycle persistence + RLS (creates/deletes temp users): `cd backend && PYTHONPATH=. DATA_MODE=demo .venv/bin/python ../scripts/check_daily_db.py`
- Live Supabase check (creates/deletes temp users): `cd backend && PYTHONPATH=. .venv/bin/python ../scripts/check_supabase.py`
- Generate daily brief locally: `scripts/run_cron_local.sh --date YYYY-MM-DD`
- Markets feed / AI overview (dev bypass): `curl 'localhost:8000/v1/markets/feed?interests=macro,rates&watch=TSLA'` · `curl -X POST localhost:8000/v1/markets/overview -H 'content-type: application/json' -d '{"level":"beginner"}'` (set `DATA_MODE=live` for real-time data)
- Today's session / cycle (dev bypass; add `today=YYYY-MM-DD` to simulate other days): `curl 'localhost:8000/v1/daily/today?level=beginner'` · `curl 'localhost:8000/v1/daily/cycle?level=beginner'`
- Personalised roadmap (dev bypass): `curl 'localhost:8000/v1/roadmap?level=intermediate'` · placement: `curl -X POST localhost:8000/v1/roadmap/placement/next -H 'content-type: application/json' -d '{"history":[]}'`
- What-if scenarios only: `curl -X POST localhost:8000/v1/markets/lab -H 'content-type: application/json' -d '{"level":"beginner","count":5,"kinds":["scenario"]}'`
- Market Lab questions (dev bypass): `curl -X POST localhost:8000/v1/markets/lab -H 'content-type: application/json' -d '{"level":"beginner","count":6}'` (answers via `/v1/markets/lab/answer`)
- Re-capture the golden demo day from live providers (real numbers only): `cd backend && .venv/bin/python -m app.market.capture --replace`
- Mobile: `cd apps/mobile && npm install && npx expo start` (press `w` for web on localhost:8081; `--tunnel` for phones). Routes live in `apps/mobile/src/app`
- Regenerate API types after changing backend schemas: `scripts/gen_types.sh`

## Non-negotiable rules
1. The LLM never produces market numbers. Prices, returns, bp moves, attribution and dates come from
   deterministic code (`app/market`, `app/portfolio`, `app/learning`). LLM output references `fact_id`s.
2. Every LLM call goes through `app/llm/structured.py` with a Pydantic output model from
   `app/schemas/ai.py`, a `PROMPT_VERSION`, one repair retry, and a deterministic fallback.
3. Retrieved text is untrusted data: wrap it in `<source id=…>` via `app/rag/context.py`; never put it
   in the system prompt. Validate citation IDs with `app/rag/citations.py`.
4. Keep layers separate: foundation vs market chunks (`layer` column); learner memory is relational.
   Misconception teaching retrieves the foundation layer only. Market retrieval is pinned to the brief's as_of date.
5. Educational only: no buy/sell recommendations, no return promises, no order execution. UI labels
   Fact / Interpretation / Teaching / Your view distinctly and always shows data mode + as-of timestamp.
6. Security: user-owned data is queried with a Supabase client carrying the user's JWT (RLS enforced).
   Service-role key only in cron/ingest. Never log secrets or store brokerage credentials.
7. Every API route returns typed errors `{code, message, retryable}`; save user answers before any LLM call.
8. The demo must work with `DATA_MODE=demo` and no network access to market providers.
9. Keep Vercel-friendly: no LLM work on the brief request path (cron pre-generates), each request < 30s,
   no heavy deps (250MB bundle limit, no local ML models).

## Conventions
- Python: type hints, Pydantic v2, async routes, httpx with timeouts.
- TS: strict mode, types from `src/api/schema.d.ts` (generated — don't hand-edit), components in `src/components`.
- Migrations are additive during the hackathon; never edit an applied migration.
- Lessons: `content/lessons/<concept-id>.md` with frontmatter (id, title, source, concept_ids, difficulty,
  trust_level) and sections: Definition, Intuition, Mechanism, Worked example, Common misconception,
  How it shows up in markets, Interview angle.
- Tests: `backend/tests/{unit,integration,rag,prompts,security}`.

## Env
See `.env.example` (backend) and `apps/mobile/.env.example`. Never commit `.env`.
