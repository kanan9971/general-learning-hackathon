# DeskReady — AI daily market tutor (hackathon)

Mobile app that runs a daily loop: OBSERVE → EXPLAIN → APPLY → ANSWER → FEEDBACK → REVISIT.
Full plan: docs/PLAN.md. Deadline-driven (16h, 4 people): prefer working + simple over clever.
Feature freeze at H13. P0 = the "magic moment" loop in docs/PLAN.md §18.

## Stack
- apps/mobile — Expo (React Native, TypeScript), Expo Router, NativeWind, TanStack Query, supabase-js
- backend — Python FastAPI deployed on Vercel serverless (entry: backend/api/index.py)
- supabase — Postgres + pgvector + Auth (email/password) + RLS; SQL migrations in supabase/migrations
- LLM: xAI Grok via `openai` SDK (base_url https://api.x.ai/v1); model IDs from env (`XAI_MODEL_FAST`, `XAI_MODEL_REASONING`)
- Embeddings: OpenAI text-embedding-3-small (1536-d)
- Market data: Finnhub (quotes/news) + FRED (yields/macro), fallback chain live → cached snapshot → golden demo day

## Commands
- Backend dev: `cd backend && uvicorn app.main:app --reload`
- Backend tests: `cd backend && pytest` (markers `-m rag`, `-m prompts` hit live APIs; default run is offline)
- Ingest KB: `cd backend && python -m app.rag.ingest ../content`
- Generate daily brief locally: `scripts/run_cron_local.sh --date YYYY-MM-DD`
- Mobile: `cd apps/mobile && npx expo start --tunnel`
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
