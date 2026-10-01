# JEV Flight Lab — Autopilot Status

## Status

**Complete** (independent QA pass)

Previous completion claim was not trusted. Specs were re-read, the repository was inspected, gaps were fixed, and checks were re-run.

## Implemented

- Canvas neon drone game: gravity, flap, scrolling gates, collision, score, restart, particles, parallax
- Domain types + `GameState → TacticalState` projection
- `TacticalDecisionProvider` with `MockDecisionProvider` and browser `JevDecisionProvider`
- Server route `POST /api/jev/decision` using OpenRouter Decisions API (`POST https://openrouter.ai/api/alpha/decisions`, model `typesafe/jev-1.13`)
- Decision manager: async requests, cooldown, single in-flight, timeout, request IDs, stale rejection, fallback
- UI: Jev decision panel, telemetry (APP CALCULATED risk), history (~20), inspector, mode selector, lab panel, flight analyst, game-over stats
- Modes: Autopilot / Manual (with agreement comparison) / Lab
- Optional LLM analyst via `POST /api/analyst` (local heuristic when `LLM_API_KEY` missing)
- Unit tests for core game + AI decision paths

## QA fixes this pass

- Stale Jev responses no longer clear `inFlight` for a newer request
- Client no longer relabels mock/fallback server decisions as live Jev
- Fallback omits fabricated probabilities/confidence
- Manual mode shows AGREEMENT / DIFFERENT DECISION
- Offline status shows `JEV OFFLINE` + `FALLBACK CONTROLLER ACTIVE`
- `.env.example` is no longer gitignored

## Validation

| Check | Result |
|---|---|
| `npm run lint` | passed |
| `npm run build` | passed |
| `npm test` | passed (22 tests) |
| `GET /` | HTTP 200 |
| `GET /api/status` | mock / demoMode true (no key) |
| `POST /api/jev/decision` | mock FLAP/WAIT decision |
| invalid decision body | HTTP 400 |
| `POST /api/analyst` | local heuristic commentary |
| client bundle secret scan | clean |

## Jev integration

- Live path calls OpenRouter Decisions API, verified against https://openrouter.ai/docs/guides/community/jev and the Decisions API reference
- Request is a typed `choice` question (`flap` / `wait`), not chat completions
- Model: `typesafe/jev-1.13`
- Currently active: **DEMO MODE / MOCK JEV** (`AI_PROVIDER=mock`, no `OPENROUTER_API_KEY`)
- Enable live Jev: set `AI_PROVIDER=jev` and `OPENROUTER_API_KEY` in `.env.local`
- Key remains server-side only (`OPENROUTER_API_KEY` is absent from `.next/static`)

## LLM analyst

- Route implemented; never controls the drone
- Currently: local heuristic (no `LLM_API_KEY`)
- Optional: set `LLM_API_KEY`, `LLM_PROVIDER`, `LLM_MODEL`

## Remaining non-blocking limitations

- Live Jev / LLM paths need credentials to exercise against production APIs
- Difficulty/physics tuned for demo feel
- Debug overlay (`?debug=1`) not implemented (not required by acceptance criteria)

## Run

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000
