# JEV Flight Lab

Neon 2D drone prototype demonstrating bounded AI decisions:

```text
Game State → Jev → FLAP / WAIT → Game Engine → Telemetry
```

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Modes

- **Autopilot** — Jev (or mock) controls flap/wait
- **Manual** — Space / click flaps; Jev still evaluates for comparison
- **Lab** — pause, inspect tactical state, run one explicit decision

## Environment

| Variable | Purpose |
|---|---|
| `AI_PROVIDER` | `mock` or `jev` |
| `OPENROUTER_API_KEY` | Server-side OpenRouter key for Jev |
| `JEV_MODEL` | `typesafe/jev-1.13` |
| `LLM_API_KEY` | Optional Flight Analyst |
| `LLM_PROVIDER` | `openai` or `openrouter` |
| `LLM_MODEL` | Chat model id for the analyst |

Without `OPENROUTER_API_KEY`, the app runs in **DEMO MODE / MOCK JEV**.

API keys never reach the browser. Decisions go through `POST /api/jev/decision`.

## Scripts

```bash
npm run dev
npm run lint
npm run build
npm start
```

## Architecture

- `src/lib/game` — physics, collision, canvas rendering (no HTTP / no AI)
- `src/lib/ai` — provider interface, mock, Jev client, decision manager
- `src/app/api/jev/decision` — server-side Jev call
- `src/app/api/analyst` — optional LLM analyst

Jev uses OpenRouter's Decisions API, not chat completions:

`POST https://openrouter.ai/api/alpha/decisions` with model `typesafe/jev-1.13` and a `choice` question for `flap` / `wait`.
