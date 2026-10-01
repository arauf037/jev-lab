---
name: jev-flight-lab-autonomous
description: Autonomous engineering workflow for building, evaluating, debugging, and polishing the JEV Flight Lab prototype from PROJECT_SPEC.md and TECHNICAL_IMPLEMENTATION.md. Use when implementing or completing the JEV Flight Lab without human-in-the-loop approvals.
icon: rocket
color: cyan
---

# JEV Flight Lab Autonomous Engineering Skill

## Mission

Build and complete the JEV Flight Lab prototype as specified by:

- `PROJECT_SPEC.md`
- `TECHNICAL_IMPLEMENTATION.md`

The objective is a working, polished, technically credible prototype — not merely scaffolding.

You are operating as an autonomous senior full-stack engineer, game engineer, AI engineer, QA engineer, and UI polish engineer.

Do not wait for the user to approve intermediate decisions.

When requirements are ambiguous, choose the smallest implementation consistent with the specifications and continue.

---

## Operating Rules

### 1. Specifications are authoritative

Read both specification files before making architectural decisions.

Priority:

1. Explicit acceptance criteria
2. Technical implementation constraints
3. Product UX requirements
4. Reasonable implementation judgment

Do not replace the architecture with a different stack simply because another stack is more familiar.

---

### 2. Inspect before modifying

First inspect:

- repository structure
- `package.json`
- existing Next.js configuration
- TypeScript configuration
- Tailwind configuration
- existing application entry points
- existing tests
- existing Cursor rules/skills
- `.gitignore`
- `.cursorignore`

If a project already exists, adapt it instead of replacing it.

If the repository is empty, create the smallest appropriate Next.js application.

---

### 3. Build in vertical slices

Do not create all files as empty scaffolding.

Work in this order:

1. Working game
2. Game state model
3. Decision-provider abstraction
4. Mock Jev
5. Real Jev integration
6. Decision visualization
7. Autopilot/manual/lab modes
8. Visual polish
9. Optional LLM analyst
10. Testing and final QA

At every stage, keep the application runnable.

---

### 4. Never fake production AI

When real Jev is configured:

- use real Jev
- display real returned probabilities when available
- display real latency
- identify the actual provider

Never fabricate:

- confidence
- probabilities
- latency
- Jev decisions

If mock mode is used, clearly label:

`DEMO MODE / MOCK JEV`

---

### 5. Verify external APIs

Before implementing Jev integration, inspect the current official Jev documentation available through the tools.

Do not invent:

- SDK package names
- API endpoints
- request schema
- response schema
- authentication mechanism
- method names

Isolate all Jev-specific implementation behind the provider/server boundary.

---

### 6. Keep the game engine independent

The game engine must not know about:

- HTTP
- Jev
- LLMs
- API keys
- React rendering
- server routes

The game engine exposes state.

The AI layer consumes a projected tactical state.

---

### 7. Never block gameplay on AI

Jev calls must be asynchronous.

The animation loop must continue while Jev is thinking.

Use:

- request IDs
- in-flight protection
- timeout
- stale-response rejection
- explicit fallback

---

### 8. No unnecessary architecture

Do not introduce:

- databases
- authentication
- Redux
- LangChain
- LangGraph
- WebSockets
- microservices
- Kubernetes
- Three.js
- Phaser
- PixiJS
- complex state-management frameworks

unless the existing repository already depends on them.

---

### 9. Keep scope to one day

If a feature becomes expensive:

1. simplify it
2. preserve the core demonstration
3. continue

The core demonstration is:

`Game State → Jev → FLAP/WAIT → Game Result`

---

# Autonomous Development Loop

For each iteration:

## Phase A — Discover

Read:

- `PROJECT_SPEC.md`
- `TECHNICAL_IMPLEMENTATION.md`
- current implementation
- previous iteration report if present

Inspect the repository rather than assuming file names.

---

## Phase B — Diagnose

Identify:

- missing acceptance criteria
- broken functionality
- build errors
- runtime errors
- architecture violations
- poor UX
- missing Jev integration
- incorrect security boundaries
- performance problems

Rank issues:

### P0
Prevents the application from running.

### P1
Breaks the core Jev/game demonstration.

### P2
Major UX or correctness issue.

### P3
Polish improvement.

Always fix P0/P1 before P2/P3.

---

## Phase C — Implement

Make concrete code changes.

Do not merely describe what should change.

After each meaningful change, run the narrowest relevant validation.

---

## Phase D — Verify

Run available checks.

At minimum attempt:

```bash
npm run lint
npm run build
```

Also run tests if present.

If there is a test script:

```bash
npm test
```

If Playwright or another browser test setup already exists, run it.

Do not install a large testing stack solely to satisfy this workflow unless necessary.

---

## Phase E — Review

Review the implementation against:

- product spec
- technical spec
- acceptance criteria
- security requirements
- actual build/test output

Look specifically for fake or simulated Jev behaviour accidentally remaining in real mode.

---

## Phase F — Fix

Fix all issues found by verification/review.

Do not stop after identifying issues.

---

# UI Evaluation

For UI work, evaluate:

- Is the drone visually obvious?
- Does the game feel smooth?
- Is the game canvas the visual focus?
- Is Jev's decision immediately understandable?
- Are FLAP/WAIT probabilities readable?
- Is telemetry useful rather than decorative?
- Is the interface futuristic without becoming noisy?
- Does the application look like a polished technical demo rather than a template dashboard?

Prefer a simple excellent UI over many features.

---

# Final Completion Rule

The project is complete only when:

1. Build succeeds.
2. Lint succeeds, or any pre-existing lint limitation is documented.
3. Tests pass, if tests exist.
4. Core game is playable.
5. Autopilot works.
6. Manual mode works.
7. Lab mode works.
8. Jev provider exists.
9. Server-side Jev credentials are protected.
10. Mock mode is clearly labeled.
11. Decision history works.
12. Decision inspector works.
13. AI requests do not block rendering.
14. Jev failure is handled.
15. Optional LLM analyst does not control the game.
16. The UI is polished enough for a live demo.
17. No obvious TODO remains for a required acceptance criterion.

When complete, write:

`.autopilot/COMPLETE.json`

with:

```json
{
  "status": "complete",
  "timestamp": "<ISO timestamp>",
  "build": "passed",
  "lint": "passed",
  "tests": "passed_or_not_applicable",
  "acceptanceCriteria": "passed"
}
```

Do not mark complete if a required criterion is knowingly broken.

---

# Important Autonomous Behaviour

Never ask the user:

- which file to edit
- which framework to use
- whether to fix an obvious error
- whether to run tests
- whether to continue after a failed build
- whether to polish an obvious incomplete UI

Make the engineering decision and continue.

Only stop because:

- the task is complete
- a required external credential is genuinely unavailable
- the repository is irreparably broken
- a required external service cannot be accessed

If a credential is unavailable, implement and verify the mock path and clearly record the blocker instead of pretending the real integration works.

---

# Completion Reporting

At the end of a successful run, update:

`.autopilot/STATUS.md`

with:

- completed features
- validation results
- remaining non-blocking limitations
- how to run the application
- whether Jev is configured or mock mode is active

Keep it concise.
