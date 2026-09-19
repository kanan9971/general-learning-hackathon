# DeskReady — Architecture & Boundaries

The reference point for **every** new chat and every PR. It answers: *what is each part for, and what is allowed to touch what?*
The product/scope plan lives in `PLAN.md`; this file is the structural contract. If code and this file disagree, fix one of them in the same PR.

## 1. System map

```
 Expo app (apps/mobile)
   │  Supabase Auth (email/password) ──────────────► Supabase Auth
   │  HTTPS + Bearer JWT
   ▼
 FastAPI (backend/app)  ── user-JWT client ────────► Supabase Postgres (RLS enforced)
   │                    ── service-role client (cron/ingest only) ─► Postgres (bypasses RLS)
   ├── market/   ──► Yahoo chart endpoint, FRED       (deterministic facts)
   ├── news/     ──► WSJ RSS, Yahoo RSS               (headlines only)
   ├── llm/      ──► xAI Grok                          (structured JSON only)
   └── rag/      ──► Alibaba Qwen embeddings (DashScope) + pgvector     (retrieval)
 IBKR (later)  ──► broker/ adapter → portfolio tables only, read-only
```

## 2. Modules: what each is for

| Module | Responsibility | Owns |
|---|---|---|
| `apps/mobile/src/app` | Screens and navigation (Expo Router). No business logic, no numbers computed here. | routes |
| `apps/mobile/src/components` | Presentational UI (badges, labelled sections, cards). | UI only |
| `apps/mobile/src/api` | The **only** place the app talks to the backend. Types generated from OpenAPI. | HTTP client |
| `backend/app/routers` | HTTP layer: parse/validate request, call services, shape response. Thin. | routes, auth deps |
| `backend/app/schemas` | Pydantic models for API bodies **and** LLM outputs. The shared contract. | types |
| `backend/app/deps.py` | Authentication (JWT verify) → `user_id`. All authz decisions start here. | auth |
| `backend/app/config.py` | Reads environment. The only module allowed to read env vars. | settings |
| `backend/app/market` | Fetch prices/yields, snapshot, fallback chain (live → cache → golden), rank moves. Produces `Fact`s. | facts |
| `backend/app/news` | Parse RSS → article rows (headline/summary/url/time). Never fetches article bodies. | articles |
| `backend/app/portfolio` | Deterministic attribution, sector exposure. Pure functions. | portfolio math |
| `backend/app/learning` | Rubric scoring (overall score), mastery updates, Leitner scheduling. Pure functions. | learner math |
| `backend/app/llm` | Grok client, prompts, structured-output parsing, audit log. No DB reads of its own. | AI calls |
| `backend/app/rag` | Ingest (CLI), chunk, embed, hybrid retrieve, boost, build untrusted context, validate citations. | retrieval |
| `backend/app/db` | Supabase client factories (`client.py`) and writes/queries (`knowledge.py`). The only code that talks to Supabase for data. | data access |
| `supabase/migrations` | Schema and RLS. Additive only. | schema |
| `content/` | Lessons, concepts, golden-day data. Data, not code. | knowledge |

## 3. Who may call whom (dependency rules)

Allowed direction is **left → right** ("may import / call"). Anything not listed is forbidden.

| Layer | May depend on | Must NOT depend on |
|---|---|---|
| `routers` | schemas, deps, services (`market`, `portfolio`, `learning`, `llm`, `rag`, `db`) | other routers |
| `llm` | schemas, config | `db`, `rag`, `market`, `routers` (callers pass data in) |
| `rag` | schemas, config, `db`, `llm.embed` only (embedding call lives in `llm/embed.py`; `rag` never imports other `llm` modules) | `routers`, `learning` |
| `market`, `news` | schemas, config, httpx | `llm`, `rag`, `db` writes except via cron entrypoint |
| `portfolio`, `learning` | schemas only (pure functions) | network, DB, `llm` |
| `db` | schemas, config | everything else |
| `schemas` | pydantic only | anything else |
| mobile `app/` | `components`, `api`, `constants` | Supabase tables directly (auth only), market/LLM providers |
| mobile `components` | other components, `constants` | `api` (screens fetch, components render) |

**Orchestration** (composing market + rag + llm + db for one request) happens only in `routers` (or a `services/` module they call). Lower layers never orchestrate.

## 4. Data & trust boundaries

1. **Numbers come from code.** Prices, returns, bp moves, attribution, dates: `market/`, `portfolio/`, `learning/`. The LLM receives `fact_id`s and may only reference them.
2. **LLM output is untrusted until validated.** Pydantic parse → 1 repair retry → deterministic fallback. Concept IDs must exist in `concepts`; source IDs must be a subset of what was provided.
3. **Retrieved text is untrusted data.** Wrapped in `<source id=…>` blocks, never in the system prompt; the LLM has no tools and no secrets.
4. **Knowledge layers stay separate:** `foundation` chunks vs `market` chunks (column `layer`); learner memory is relational (`concept_mastery`), never vectorised.
5. **Two DB identities:** requests use a Supabase client carrying the *user's JWT* (RLS enforces ownership). The service-role key is used only by `/v1/cron/*` and the ingest CLI.
6. **Secrets:** env only, read via `config.py`. Never logged, never in the mobile app (only the Supabase anon key and API URL are public).
7. **Answers are saved before any LLM call**, so a failed grader never loses user input.

## 5. Request flows

- **Daily brief (cron, post-close):** cron → `market` snapshot (fallback chain) + `news` RSS → `rag` ingest market chunks → `llm.explain_event` per top-ranked move → validated → `daily_briefs`. Request path only *reads* the stored brief.
- **Onboarding diagnostic (mobile, current demo):** static MCQ fixture → client scores → persist plan (level + focus concepts) in AsyncStorage. Retake from Learn overwrites plan only; mastery history kept. (Server `POST /v1/onboarding` still planned for auth profiles later.)
- **Daily case-study quiz (mobile, current demo):** MCQs from local fixture grounded in the brief event → mastery bumps in AsyncStorage → feedback → lesson fixture. Long-form `evaluate` route remains for a later P1 essay challenge.
- **Teaching:** misconception / weak concept → `rag.retrieve` (foundation layer) → `llm.tutor` → citations → mastery update. Demo uses lesson fixture until RAG ships.
- **Portfolio:** positions × snapshot → `portfolio.attribution` (deterministic) ; optional `llm.portfolio_narrative` labelled as interpretation.

## 6. Extension points (future work slots in here)

- **IBKR (read-only):** new `backend/app/broker/ibkr.py` implementing `PortfolioSource` (returns `Position[]`). May write **only** to `portfolios`/`positions`. OAuth/token storage encrypted; no passwords; no order endpoints exist. Nothing else in the codebase learns IBKR exists.
- **New market provider:** implement `MarketDataProvider` in `market/providers/`, register in `market/snapshot.py`. Nothing outside `market/` changes.
- **New LLM task:** add prompt module in `llm/prompts/` + output model in `schemas/` + call from a router. No new dependency edges.
- **New content:** drop Markdown into `content/lessons/`, run ingest.

## 6b. Research-paper ingestion (RAG owner's pipeline)

`content/sources/research_papers.yaml` (manifest: id, title, authors, publisher, canonical `source_url`, `pdf_url`, concept_ids) →
`rag/extract.py` (PDF→text; refuses scanned PDFs) → `rag/clean.py` (running headers/footers, references, equation/table debris, injection flag) →
`rag/chunk.py` (section-aware, ≤350-token target / 500 max, 1-sentence overlap, `Title > Section` path) →
`llm/embed.py` (Alibaba Qwen qwen3.7-text-embedding, 1536-d, batch ≤10) → `db/knowledge.py` (upsert `documents` + `chunks`, layer=`foundation`, content_type=`research`).
Run: `python -m app.rag.ingest ../content/sources/research_papers.yaml` (dry run, writes `content/processed/*.jsonl`) or add `--store`.
**Rules:** PDFs (`content/raw/`) and extracted text (`content/processed/`) are gitignored, not redistributed. The UI shows short excerpts and always links to `source_url`. Papers are difficulty 3 / trust_level 2 and are only retrieved for advanced learners or explicit momentum/strategy topics, never for beginner misconception lessons.

## 7. Current status (update as phases land)

| Area | State |
|---|---|
| FastAPI app, config, typed errors, JWT dependency (ES256 via Supabase JWKS fetched with httpx; HS256 legacy fallback), `/health` | done, live-verified |
| Pydantic API schemas + placeholder fixtures (`app/fixtures`, served at `/v1/dev/fixtures/*` when `DEV_FIXTURES=true`) | done (phase 0) |
| Supabase migrations 0001–0004 (core, rag, rls, research type) | **applied** to project `apsojsuiginpuqljutyo` on 2026-09-19 via MCP; 17 tables, RLS on all. Known advisories: `llm_calls` has no policy (intentional, service-role only); `vector` extension sits in `public` (leave, moving it means recreating `chunks.embedding`). Seeded `concepts` (29) + `concept_edges` (14) via `supabase/seed/concepts.sql`. Live-verified 2026-09-19 (`scripts/check_supabase.py`, 12/12): signup/login, backend verifies ES256 tokens via JWKS, RLS isolation between users, reference tables read-only, KB store path (pgvector insert + re-ingest replace). |
| Expo app: onboarding MCQ → plan → Today / case study / daily quiz / feedback / lesson / Portfolio / Learn (palette + AsyncStorage gate; auth skipped) | done (mobile loop UI) |
| RAG ingest pipeline + 5 momentum papers | **done and stored**: 377 chunks embedded (Qwen `qwen3.7-text-embedding`, 1536-d, layer=foundation, type=research) in Supabase. Smoke retrieval with real embeddings: hit@3 4/5. |
| market / news / portfolio / learning / llm prompts | empty packages (later phases) |
| retrieval (`rag/retrieve.py`, `match_chunks`), citations, context builder | not started (next) |
| `match_chunks` SQL function | not started |
