# DeskReady — AI daily market tutor

Hackathon app for Sales & Trading prep. A 5–10 minute mobile loop turns market news into practice — not a trading app.

## Demo loop (current frontend)

1. **Onboarding diagnostic (once)** — 8 multiple-choice questions seed a custom plan (level + focus concepts). Stored on-device; skipped on later launches. **Retake diagnostic** lives on the Learn tab.
2. **Today** — DEMO/LIVE/CACHED badge, cross-asset strip, event cards as short case studies.
3. **Case study** — Facts vs causal chain vs alternatives, then today’s quiz.
4. **Daily MCQ quiz** — Grades the case study and updates mastery.
5. **Feedback → Lesson** — Hits/misses, then a cited micro-lesson.
6. **Portfolio** — Demo-book day P&L (deterministic numbers) + labelled AI narrative.
7. **Learn** — Living custom plan + mastery bars.

**Auth is skipped for the hackathon demo** (no sign-up). No IBKR, no order execution.

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

Tokens live in `apps/mobile/src/constants/theme.ts`.

## Run

```bash
# Backend (optional — Today falls back to a local brief if offline)
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
cp .env.example .env   # set DEV_FIXTURES=true
.venv/bin/uvicorn app.main:app --reload --port 8000

# Mobile (Expo web is fine for judges)
cd apps/mobile && npm install && npx expo start
# press `w` for web on localhost:8081
```

Product contract: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · Scope: [`docs/PLAN.md`](docs/PLAN.md)
