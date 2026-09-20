# DeskReady — an AI daily market tutor

A mobile app that turns the day's real market moves into a short, graded practice session for someone preparing for Sales & Trading interviews. Educational only: it explains markets, it never recommends a trade.

The loop is **OBSERVE → EXPLAIN → APPLY → ANSWER → FEEDBACK → REVISIT**, run once a day. Every number on screen is computed by deterministic Python from Yahoo Finance and Treasury.gov. The LLM only writes the prose around those numbers, and it must cite the `fact_id`s it was given.

## Try it

| | |
|---|---|
| Web app | https://deskready-app.vercel.app |
| API | https://deskready-api.vercel.app (`/health`, `/docs`) |
| Phone | scan [`docs/assets/deskready-qr.png`](docs/assets/deskready-qr.png) |

No login. The deployed API runs `PUBLIC_DEMO=true`, so everyone shares one demo user and progress lives in the serverless instance's memory — it is ephemeral and resets when the instance recycles. Per-user persistence needs Supabase sign-in turned on (see [Deployment](#deployment)).

## The four tabs

| Tab | What it does |
|---|---|
| **Today** | The day's session, ~40 minutes in five blocks: your own read of the market *before* the AI's · today's focus topic · a structured analyst note · five practice questions · spaced review. Built fresh each day from that day's market and where you are in the cycle. |
| **Portfolio** | A paper classroom book. Fake cash sized by your placement level, simulated fills on real snapshot prices, a candle chart with your fills drawn on it, and a written analysis of how you did — unlocked after the next US session, not after 24 hours. |
| **Learn** | The long cycle: day X of 40, the eight phases, a 14-day calendar and the topic roadmap with "you are here" on today's focus. |
| **Practice** | Everything on demand: what-if scenarios, predict-the-effect, order-the-chain, written explanations, the endless adaptive quiz, and by-topic drills. |

A profile button on every tab opens level, interests and "retake placement".

### The daily session in more detail

A **cycle** is built from your placement result: eight phases (big picture → rates & desk → dollar & commodities → stocks & risk → sectors → companies → your book → capstone) × five goal days. If you already know a phase's topics, it is skipped.

Each day's goal is a **passing analyst note plus a practice set**, and there is no shortcut past it. The note is five prompts (what moved / your evidence / the chain / who else this hits / what would prove you wrong) about a move the server picks, graded 0–100 against the day's real facts and headlines. It passes at 45; below that you revise and resubmit. If the LLM is down, the attempt counts for effort but never touches mastery.

Miss a day and the cycle **stretches** — it never resets. Streaks count consecutive market days, so weekends can't break one.

## What's real and what isn't

### Working

| Area | Notes |
|---|---|
| Market data | Yahoo Finance chart endpoint + Treasury.gov yield curve, 44 instruments. Fallback chain: live → cached snapshot → a real captured golden day. Every screen shows the data mode and an as-of timestamp. |
| News | Fed, WSJ and Yahoo ticker RSS — headline, summary, link and timestamp only. Article bodies are never fetched. |
| Daily cycle & session | `/v1/daily/*`, persisted in Supabase with RLS. Analyst-note grading is live and has caught notes about the wrong move and notes citing evidence that didn't exist. |
| Placement & roadmap | Nine-topic adaptive staircase that seeds mastery directly, then a 14-node prerequisite tree shaped by level and mastery. |
| Adaptive quiz | Multi-format, infinite, keeps 2–3 questions queued ahead. MCQ answers are HMAC-sealed server-side, never sent to the client. |
| Market Lab | Five question kinds built from *today's actual numbers* — scenario, predict, driver, chain and a written explanation graded by the LLM against a rubric. |
| RAG tutor | Hybrid retrieval (vector ∪ full-text, fused with RRF) over 24 research papers and 7 lessons, 1,736 chunks. Every citation is validated and resolvable; below the similarity bar the lesson says so and cites nothing. |
| Paper book | Level-sized cash, market/limit/stop orders, shorts and tiny listed options gated by level, simulated fills, OHLCV candles with fill overlays. |
| AI overview & desk notes | Cite facts and headlines as evidence; any number the model writes is stripped and re-rendered from data. |

### Not built / deferred

- **Daily brief cron** (`/v1/cron/daily`) — never started. Nothing pre-generates a brief overnight yet.
- **Email/password sign-up** — deliberately skipped; anonymous Supabase sign-in exists in code but is disabled in the project.
- **RAG-grounded quiz questions** — quiz questions are labelled hypothetical exercises, not live-market fact IDs.
- **Long-form analyst `evaluate`, Desk drill, lesson persistence, IBKR read-only** — out of scope for the hackathon.
- **Live brokerage** — never. Paper fills are simulated and labelled educational.

## Stack

```
Expo app (apps/mobile)  ─ Bearer JWT ─►  FastAPI (backend/app)  ─ user JWT ─►  Supabase Postgres (RLS)
                                          ├─ market/  Yahoo chart + Treasury.gov       (deterministic facts)
                                          ├─ news/    Fed + WSJ + Yahoo RSS            (headlines only)
                                          ├─ llm/     xAI Grok                         (structured JSON only)
                                          └─ rag/     Qwen embeddings + pgvector       (retrieval)
```

- **Mobile** — Expo SDK 57, Expo Router, TypeScript strict, NativeWind. Types generated from the backend's OpenAPI schema.
- **Backend** — Python FastAPI on Vercel serverless (`backend/api/index.py`). Async routes, Pydantic v2, httpx with timeouts.
- **Database** — Supabase Postgres + pgvector + RLS on all 23 tables. Migrations in `supabase/migrations`.
- **LLM** — xAI Grok through the `openai` SDK. **Embeddings** — Alibaba Qwen `qwen3.7-text-embedding` (1536-d) via DashScope, because OpenAI is blocked in Hong Kong.

## Run it locally

### Backend

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
cp ../.env.example .env
# For a local demo, set in backend/.env:
#   AUTH_DEV_BYPASS=true    # token-less requests act as a fixed dev user
#   DEV_FIXTURES=true       # enables the fixture routes
#   DATA_MODE=demo          # golden day, no network to market providers
.venv/bin/uvicorn app.main:app --reload --port 8000
```

`AUTH_DEV_BYPASS` is ignored whenever the `VERCEL` env var is set, so it can never be live in a deployment.

Smoke it:

```bash
curl localhost:8000/health
curl 'localhost:8000/v1/daily/today?level=beginner'
curl 'localhost:8000/v1/markets/feed?interests=macro,rates&watch=TSLA'
curl localhost:8000/v1/portfolio/
curl -X POST localhost:8000/v1/markets/lab \
  -H 'content-type: application/json' -d '{"level":"beginner","count":6}'
```

### Mobile

```bash
cd apps/mobile
npm install
cp .env.example .env   # set EXPO_PUBLIC_API_URL (+ Supabase anon key if you enable sign-in)
npx expo start         # press `w` for web on localhost:8081, or --tunnel for a phone
```

After changing any backend schema, regenerate the TS types: `scripts/gen_types.sh`.

### Tests

```bash
cd backend && .venv/bin/pytest          # 111 offline tests; live-API tests are deselected
.venv/bin/pytest -m rag                 # live: retrieval eval against Supabase + embeddings
.venv/bin/pytest -m prompts             # live: prompt schema + score-ordering checks
.venv/bin/python ../evals/run_evals.py  # full RAG eval report
```

Last live RAG run: 24 cases, hit@3 20/20, MRR@5 1.000, and beginner queries still return zero research chunks.

### Other useful commands

```bash
# Ingest the knowledge base (drop --store for a dry run into content/processed/)
python scripts/fetch_papers.py
cd backend && .venv/bin/python -m app.rag.ingest ../content/sources/research_papers.yaml --store
cd backend && .venv/bin/python -m app.rag.ingest ../content/lessons --store

# Re-capture the golden demo day from live providers (real numbers only)
cd backend && .venv/bin/python -m app.market.capture --replace

# Verify Supabase persistence + RLS end to end (creates and deletes temp users)
cd backend && PYTHONPATH=. DATA_MODE=demo .venv/bin/python ../scripts/check_daily_db.py
```

## Database

Migrations are **additive only** — never edit one that has been applied.

| Migration | State |
|---|---|
| `0001`–`0007` (core, rag, rls, research type, `match_chunks`, adaptive quiz, daily cycle) | ✅ applied and live-verified |
| `0008_rag_hardening` (`chunks.version`, FTS fallback, `activate_document_version`) | ⚠️ written, **not applied** — ingest therefore only inserts new documents and never deletes existing chunks |
| `0009_paper_book` | ⚠️ written, **not applied** — the paper book falls back to its in-memory store |

Each table that holds user data has an in-memory twin used under the dev bypass, and any DB error falls back to it, so the app never hard-fails on a missing migration.

## Deployment

Two Vercel projects, both Git-connected — **every push to `main` auto-deploys to production**.

| Project | Root | Notes |
|---|---|---|
| `deskready-api` | `backend/` | FastAPI auto-detected; no `rewrites` (they break routing); `vercel.json` sets `maxDuration` only. `DATA_MODE=live`, `PUBLIC_DEMO=true`. |
| `deskready-app` | `apps/mobile/` | `expo export --platform web` → `dist`; `EXPO_PUBLIC_API_URL` baked in at build time. |

Env is pushed with `scripts/vercel_env_push.py`. To get real per-user progress: enable anonymous (or email) sign-in in Supabase Auth, set `EXPO_PUBLIC_SUPABASE_ANON_KEY` on the web project, apply migration `0009`, and unset `PUBLIC_DEMO`.

If live data is dull or a provider breaks during a demo, set `DATA_MODE=demo` + `DEMO_DATE` and redeploy — about a minute.

## The rules this codebase holds to

1. **The LLM never produces a number.** Prices, returns, basis-point moves, attribution and dates all come from `app/market`, `app/portfolio` and `app/learning`. The model gets `fact_id`s and may only reference them; any number it writes anyway is stripped.
2. **Every LLM call is structured.** A Pydantic output model, a versioned prompt, one repair retry, then a deterministic fallback. An LLM outage degrades the app; it never breaks it.
3. **Retrieved text is untrusted data.** It is wrapped in `<source id=…>` blocks, never placed in the system prompt, and every citation ID is validated against what was actually retrieved. The model has no tools and no secrets.
4. **Answers are saved before any LLM call**, so a failed grader never loses your work.
5. **Educational only.** No buy/sell recommendations, no return promises, no live brokerage. The UI labels **Fact** / **Interpretation** / **Teaching** / **Your view** distinctly and always shows the data mode and as-of time.
6. **RLS everywhere.** User data is read through a Supabase client carrying that user's JWT. The service-role key is used only by ingest and reference-data reads.
7. **The demo works offline** — `DATA_MODE=demo` with no network to any market provider.

## Data attribution

Market data from Yahoo Finance (unofficial endpoint, educational use) and Treasury.gov. Headlines from the Federal Reserve, WSJ and Yahoo Finance RSS — headline, summary, publisher, link and timestamp only, with the publisher credited on every card and links pointing back to the original. Research PDFs under `content/raw/` are gitignored and never redistributed; the UI shows short excerpts and always links to the canonical source.

## Design tokens

| Role | Hex |
|---|---|
| Page background | `#FBFAF8` |
| Surface | `#FFFFFF` |
| Primary | `#1E4E8C` |
| Secondary | `#087E8B` |
| Accent | `#F4B942` |
| Success / Error | `#1F7A4D` / `#B42318` |
| Text / muted | `#17181C` / `#5B6270` |

All tokens — spacing, radius, elevation, gradients, on-dark colours — live in `apps/mobile/src/constants/theme.ts`. Motion lives in `src/components/Motion.tsx` and nowhere else: three curves, all gated on `useReducedMotion`.

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the structural contract: what every module is for, what may import what, and the current status table. Read this before changing code.
- [`docs/PLAN.md`](docs/PLAN.md) — product scope, phases and the decisions behind them.
- [`CLAUDE.md`](CLAUDE.md) — commands and rules for agents working in this repo.
