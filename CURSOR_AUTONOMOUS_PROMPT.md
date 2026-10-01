# Cursor Master Prompt — Autonomous JEV Flight Lab Builder

You are the primary autonomous implementation agent for this repository.

Your mission is to **build, evaluate, debug, polish, and complete the JEV Flight Lab prototype without waiting for human approval**.

## Required context

Before changing code, read:

- `PROJECT_SPEC.md`
- `TECHNICAL_IMPLEMENTATION.md`
- `.cursor/skills/jev-flight-lab-autonomous/SKILL.md`

The specification documents are authoritative.

---

# Objective

Build a polished, working, one-day prototype called:

**JEV Flight Lab**

It is a futuristic neon 2D drone game inspired by Flappy Bird.

The central AI demonstration is:

```text
Game State
    ↓
Jev
    ↓
FLAP / WAIT
    ↓
Game Engine
    ↓
Telemetry / Result
```

An optional LLM is a slower Flight Analyst and must not control the drone in V1.

---

# Autonomy

You are explicitly authorized to:

- inspect the repository
- create files
- modify files
- install reasonable dependencies
- run shell commands
- run tests
- run builds
- inspect errors
- fix errors
- refactor when required
- improve UI
- repeat implementation/evaluation cycles
- continue until the acceptance criteria are satisfied

Do not ask for confirmation between steps.

Do not stop after producing a plan.

Do not merely report what should be implemented.

Actually implement it.

---

# First action: repository discovery

Start by inspecting:

```text
pwd
find .
package.json
tsconfig.json
next.config.*
tailwind.config.*
src/
app/
components/
lib/
.cursor/
```

Use whatever inspection commands are appropriate for the repository.

Do not assume the repository is empty.

Do not replace an existing application unnecessarily.

---

# Implementation strategy

Work through these stages.

## Stage 1 — Understand

Read both specifications completely enough to identify:

- product requirements
- architecture
- acceptance criteria
- security constraints
- non-goals

Inspect existing code.

Create a short internal implementation plan.

Do not wait for approval.

---

## Stage 2 — Build the game first

Implement a smooth Canvas-based game:

- futuristic neon drone
- gravity
- flap
- wait
- scrolling gates
- collision
- score
- game over
- restart
- smooth animation

The game must work before AI integration.

Use:

```text
requestAnimationFrame
```

Do not put Jev calls inside the rendering loop.

---

## Stage 3 — Create clean domain boundaries

Implement:

```text
GameState
DroneState
GateState
TacticalState
TacticalAction
TacticalDecision
```

Create a function that projects:

```text
GameState → TacticalState
```

Only the compact tactical state should reach Jev.

---

## Stage 4 — Implement the decision provider

Create:

```typescript
interface TacticalDecisionProvider {
  decide(state: TacticalState): Promise<TacticalDecision>;
}
```

Create:

```text
MockDecisionProvider
JevDecisionProvider
```

The UI and game engine must not directly depend on Jev.

---

## Stage 5 — Implement mock autopilot

Before using real Jev, make the game autonomously playable with the mock provider.

Verify:

```text
game
 ↓
tactical state
 ↓
provider
 ↓
decision
 ↓
game action
```

If this loop does not work, fix it before moving on.

---

# Stage 6 — Real Jev integration

Before writing Jev-specific code:

**Inspect the current official Jev documentation/API available through your tools.**

Use the current official API/SDK syntax.

Do not guess.

Implement the Jev call server-side.

Required architecture:

```text
Browser
   ↓
POST /api/jev/decision
   ↓
Next.js server route
   ↓
Jev API
```

The browser must never receive the Jev API key.

Use:

```text
JEV_API_KEY
```

from server-side environment variables.

---

# Stage 7 — Robust decision loop

Implement:

- asynchronous Jev requests
- decision cooldown
- one in-flight request at a time
- timeout
- request IDs
- stale-result rejection
- fallback controller
- actual latency measurement
- actual provider status

Never freeze gameplay while Jev is thinking.

The game must continue rendering.

---

# Stage 8 — Build the AI UI

Create a visually strong Jev panel.

It should show something like:

```text
JEV DECISION

FLAP
████████████████░░░░ 74%

WAIT
██████░░░░░░░░░░░░░░ 26%

→ FLAP

Confidence: 82%
Latency: 84ms
```

Only display confidence if the provider actually returns confidence.

Do not fabricate AI metadata.

If the API does not provide something, show:

```text
N/A
```

or omit it.

---

# Stage 9 — Decision history

Create a rolling history of approximately 20 decisions.

Each record should retain the tactical state that was sent to Jev.

Support selecting a decision and inspecting:

```text
action
probabilities
confidence if available
latency
provider
timestamp
tactical state
outcome
```

This should make the demo useful to technical audiences.

---

# Stage 10 — Three modes

Implement:

### AUTOPILOT

Jev controls the drone.

### MANUAL

The human controls the drone with:

```text
SPACE
```

Jev still evaluates the state and displays what it would choose.

Jev must never override manual input.

### LAB

Pause the game.

Show tactical state.

Allow:

```text
RUN JEV DECISION
```

This is a single explicit decision call.

---

# Stage 11 — Visual polish

Once functionality works, make the UI feel polished.

Use:

- dark futuristic background
- cyan/violet neon
- subtle grid
- particles
- drone engine glow
- gate glow
- parallax stars
- smooth panel transitions
- clean typography
- subtle animations

Do not turn it into a generic dashboard.

The game canvas should remain visually dominant.

Avoid excessive effects that reduce performance.

---

# Stage 12 — Optional LLM analyst

Only implement this after the Jev game is working.

The LLM is:

**Flight Analyst**

It analyzes:

- recent Jev decisions
- score
- flight time
- telemetry
- recent behaviour

It returns concise strategic commentary.

Example:

> The drone is descending quickly and the next gate is relatively close. A more conservative flight pattern would reduce late corrections.

The LLM must not:

- call game actions
- choose FLAP/WAIT
- replace Jev
- run every frame

Call it roughly every 8–12 seconds.

If unavailable, the game continues normally.

---

# Stage 13 — Verify everything

Run available validation.

At minimum:

```bash
npm run lint
npm run build
```

If available:

```bash
npm test
```

Also inspect:

```bash
git diff
git status
```

Fix issues rather than merely reporting them.

---

# Stage 14 — Runtime verification

If the project has a browser/e2e test setup, use it.

If no browser automation exists, at minimum:

```bash
npm run build
```

and inspect application code carefully.

If possible, launch the development server and verify:

- page loads
- game starts
- game restarts
- manual mode works
- autopilot works
- lab mode works
- panels render
- API route responds correctly when credentials are available

Do not leave a dev server running unnecessarily when finished.

---

# Stage 15 — Final engineering review

Before declaring completion, review the implementation against both specifications.

Specifically verify:

### Security

- Jev API key server-side
- LLM API key server-side
- no secrets in client bundle
- no secrets in logs

### Architecture

- game engine independent from AI
- tactical state projection exists
- provider abstraction exists
- Jev integration isolated
- LLM does not control gameplay

### Performance

- requestAnimationFrame
- no model call every frame
- no blocking fetch
- bounded decision history
- bounded particles

### Correctness

- no fake Jev output in real mode
- fallback is clearly identified
- stale requests cannot override current decisions
- timeout exists

### UX

- game is immediately understandable
- Jev decision is visually obvious
- telemetry is readable
- neon drone aesthetic is strong
- no broken or placeholder UI

---

# Autonomous iteration rule

Do not stop after one implementation pass.

Repeat:

```text
INSPECT
   ↓
IMPLEMENT
   ↓
RUN
   ↓
EVALUATE
   ↓
FIX
   ↓
RUN AGAIN
```

Continue until:

- build passes
- lint passes or known pre-existing issues are isolated
- core gameplay works
- Jev architecture is implemented
- required UI exists
- no P0/P1 issue remains
- obvious P2 issues affecting the demo are fixed

---

# Avoid scope creep

Do not implement:

- authentication
- database
- multiplayer
- leaderboard backend
- 3D engine
- RAG
- agent frameworks
- vector database
- complex weapons
- social features
- cloud infrastructure

Keep the implementation small.

---

# Important rule about uncertainty

If an implementation detail is uncertain:

1. inspect the repository
2. inspect official documentation
3. inspect installed package versions
4. choose the smallest compatible solution
5. implement
6. test

Do not ask the user unless the task is genuinely impossible without a missing external dependency or credential.

---

# Completion artifact

When everything is complete, create:

```text
.autopilot/COMPLETE.json
```

with valid JSON:

```json
{
  "status": "complete",
  "build": "passed",
  "lint": "passed",
  "tests": "passed_or_not_applicable",
  "acceptanceCriteria": "passed"
}
```

Also create/update:

```text
.autopilot/STATUS.md
```

containing:

- what was implemented
- validation results
- whether real Jev or mock Jev is active
- whether the optional LLM is configured
- remaining non-blocking limitations
- run instructions

Do not create `COMPLETE.json` until the actual checks have been run.

---

# Final response

When complete, return a concise report containing:

1. What was built
2. Validation performed
3. Jev integration status
4. LLM analyst status
5. Remaining limitations, if any
6. How to run the application

Do not dump the entire implementation into the response.
