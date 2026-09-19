# DeskReady — AI daily market tutor

Hackathon app for Sales & Trading prep. A short mobile loop turns market concepts into adaptive practice — educational only, not a trading app.

## What’s implemented vs mock / deferred

### Live (working in the demo)

| Area | Status |
|---|---|
| **Quiz tab** (replaces Today) | Format multi-select (MCQ, case study, short answer, analysis), **Start quiz** disabled until a format is picked |
| **Choose topics** | Search/select catalog concepts + add free-text finance interests |
| **Infinite adaptive quiz** | Session API prepares **2–3** questions ahead; immediate feedback; continue until the user ends |
| **Adaptation** | Targets weak mastery, due reviews, repeated mistakes, preferred/custom topics; difficulty from proficiency |
| **Mastery + Learn tab** | Server-side mastery updates after each answer; Learn shows bars, recommendations, recent attempts |
| **Question generation** | xAI Grok via structured JSON; deterministic template **fallbacks** if the LLM is down |
| **RAG tutor lesson** | `POST /v1/tutor/lesson` — hybrid retrieval + cited micro-lesson (offline canned fallback) |
| **Onboarding diagnostic** | Local 8-MCQ plan seed (AsyncStorage); retake from Learn |
| **Auth for quiz progress** | Silent **anonymous** Supabase session (no login UI). Local `AUTH_DEV_BYPASS` + in-memory quiz store if no JWT |

### Mock / fixture / not built yet

| Area | Status |
|---|---|
| **Market brief / case-study “Today” feed** | Retired from the main tab; event detail + brief fixtures still exist but are not the primary loop |
| **Portfolio tab** | Demo fixture P&L + narrative placeholders |
| **Daily finite MCQ fixture** | Old `daily-quiz.json` path retired from the active Quiz flow |
| **RAG-grounded quiz questions** | Deferred — questions are **hypothetical** educational exercises today (not live-market fact IDs) |
| **Email/password login** | Deferred — anonymous auth only for the hackathon demo |
| **IBKR / orders / advice** | Out of scope — never implemented |
| **Supabase quiz tables in production** | Migration `0006_adaptive_quiz.sql` is additive; apply it for durable RLS persistence. Without it (or without anon JWT), the API uses the **in-memory** store |

## Demo loop (current)

1. **Onboarding** (once) — diagnostic MCQs → plan tone on device.
2. **Quiz** — pick formats → optional topics → **Start quiz**.
3. **Infinite session** — answer → immediate feedback → continue or end; queue stays topped up to 2–3.
4. **Learn** — mastery / recommendations from quiz performance; optional “Teach me” → live RAG lesson.
5. **Portfolio** — still a fixture demo book (not live market data).

## Run

```bash
# Backend
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
cp ../.env.example .env
# Recommended for local demo:
#   AUTH_DEV_BYPASS=true
#   DEV_FIXTURES=true
# Optional: QUIZ_USE_MEMORY=true to force the in-memory quiz store
.venv/bin/uvicorn app.main:app --reload --port 8000

# Smoke adaptive quiz (no token needed with AUTH_DEV_BYPASS)
curl -X POST localhost:8000/v1/quiz/sessions \
  -H 'content-type: application/json' \
  -d '{"formats":["mcq"],"concept_ids":["bond-price-yield"]}'

# Mobile (Expo web is fine for judges)
cd apps/mobile && npm install
cp .env.example .env   # set EXPO_PUBLIC_API_URL + Supabase anon key for anonymous auth
npx expo start
# press `w` for web on localhost:8081
```

After changing backend OpenAPI schemas: `scripts/gen_types.sh`

Apply quiz persistence (optional but needed for multi-device / durable progress):

```bash
# apply supabase/migrations/0006_adaptive_quiz.sql in the Supabase SQL editor
# enable Anonymous sign-ins in Supabase Auth
```

## Palette

| Role | Hex |
|---|---|
| Page background | `#FAFAF7` |
| Surface | `#FFFFFF` |
| Primary | `#1E4E8C` |
| Secondary (progress/tags) | `#087E8B` |
| Accent | `#F4B942` |
| Success / Error | `#1F7A4D` / `#B42318` |
| Text / muted | `#1F2937` / `#596579` |
| Borders | `#D9E2EC` |

Tokens: `apps/mobile/src/constants/theme.ts`.

## Docs

- Product contract: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Scope / phases: [`docs/PLAN.md`](docs/PLAN.md)
- Agent commands: [`CLAUDE.md`](CLAUDE.md)
