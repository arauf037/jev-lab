# JEV Flight Lab — Technical Implementation Specification

## 1. Purpose

This document defines the technical implementation of **JEV Flight Lab**.

It complements `PROJECT_SPEC.md`.

`PROJECT_SPEC.md` describes what the product should do and how it should feel.

This document describes how to implement it.

The implementation should remain intentionally small enough for a one-day prototype while preserving a clean architecture that can later be extended.

---

# 2. Technical Goals

The implementation must demonstrate four things clearly:

1. A real-time browser game can produce structured state.
2. Jev can consume that state and make a bounded tactical decision.
3. The game engine can execute the decision without depending on the model for physics.
4. An LLM can operate at a different abstraction level as a strategic analyst.

The core architecture is:

```text
                    ┌──────────────────┐
                    │   React / Next   │
                    │       UI         │
                    └────────┬─────────┘
                             │
                             │ render / input
                             ▼
                    ┌──────────────────┐
                    │   Game Engine    │
                    │                  │
                    │ physics          │
                    │ collision        │
                    │ scoring          │
                    └────────┬─────────┘
                             │
                             │ GameState
                             ▼
                    ┌──────────────────┐
                    │ Decision Manager │
                    └────────┬─────────┘
                             │
                             │ TacticalState
                             ▼
                    ┌──────────────────┐
                    │ Tactical Provider│
                    └───────┬──────────┘
                            │
                 ┌──────────┴──────────┐
                 ▼                     ▼
           ┌───────────┐       ┌─────────────┐
           │    Jev    │       │ Mock Jev    │
           │ Provider   │       │ Provider    │
           └───────────┘       └─────────────┘

                         Optional
                            │
                            ▼
                    ┌──────────────────┐
                    │  Flight Analyst  │
                    │       LLM        │
                    └──────────────────┘
```

---

# 3. Technology Stack

Use the simplest modern stack that supports the requirements.

## Required

- Next.js
- React
- TypeScript
- Tailwind CSS
- HTML Canvas
- Next.js Route Handlers
- Fetch API

## Optional

- Framer Motion for UI transitions
- Lucide React for icons

Do not introduce additional frameworks unless the existing repository already requires them.

Do not introduce:

- Redux
- Zustand
- MobX
- LangChain
- LangGraph
- Three.js
- Phaser
- PixiJS
- a database
- WebSockets

The game is simple enough that these are unnecessary for V1.

---

# 4. Runtime Architecture

Use a single Next.js application.

```text
Browser
  │
  ├── React UI
  │
  ├── Canvas game loop
  │
  └── Browser state
          │
          │ HTTP
          ▼
     Next.js Server
          │
          ├── /api/jev/decision
          │        │
          │        ▼
          │       Jev
          │
          └── /api/analyst
                   │
                   ▼
                  LLM
```

No separate backend service is required.

---

# 5. Browser / Server Boundary

The browser is responsible for:

- rendering
- game simulation
- user input
- visual telemetry
- maintaining current session state
- requesting tactical decisions
- displaying model results

The server is responsible for:

- calling Jev
- calling the LLM
- protecting credentials
- validating incoming requests
- normalizing provider responses

The browser must never receive:

```text
JEV_API_KEY
LLM_API_KEY
```

---

# 6. Core Domain Types

Create a central domain type file.

Suggested:

```typescript
export type GameMode = "autopilot" | "manual" | "lab";

export type GameStatus =
  | "idle"
  | "running"
  | "paused"
  | "game_over";

export type TacticalAction = "flap" | "wait";
```

---

# 7. Game State

The game engine owns the authoritative game state.

Suggested:

```typescript
export interface DroneState {
  x: number;
  y: number;
  velocityY: number;
  velocityX: number;
  rotation: number;
  alive: boolean;
}

export interface GateState {
  id: string;
  x: number;
  gapCenterY: number;
  gapSize: number;
  width: number;
  passed: boolean;
}

export interface GameState {
  drone: DroneState;
  gates: GateState[];

  score: number;
  bestScore: number;

  elapsedMs: number;

  status: GameStatus;
  mode: GameMode;

  lastFlapAt: number | null;

  worldSpeed: number;
}
```

The engine should not store Jev-specific metadata inside the core physics state.

---

# 8. Tactical State Projection

Create a projection from `GameState` to the smaller state sent to Jev.

```typescript
export interface TacticalState {
  altitude: number;
  verticalVelocity: number;

  nextGateDistance: number;
  gapCenterY: number;
  gapSize: number;
  relativeGapOffset: number;

  horizontalVelocity: number;

  recentFlaps: number;
  timeSinceLastFlapMs: number;

  droneAlive: boolean;
}
```

Function:

```typescript
function createTacticalState(
  gameState: GameState,
  now: number
): TacticalState
```

This separation is important.

The AI should not know about:

- particles
- canvas dimensions
- React state
- animation objects
- rendering details

---

# 9. Game Constants

Centralize game configuration.

Example:

```typescript
export const GAME_CONFIG = {
  gravity: 0.42,
  flapImpulse: -7.5,

  initialVelocityX: 3.2,

  gateWidth: 72,
  initialGapSize: 180,

  gateSpacing: 280,

  maxVelocityY: 10,

  decisionIntervalMs: 220,

  maxDecisionHistory: 20,

  canvasPadding: 24,
};
```

These values are starting points only.

Tune by feel.

Do not hardcode them throughout the codebase.

---

# 10. Game Loop

Use `requestAnimationFrame`.

Conceptually:

```typescript
function frame(timestamp: number) {
  const deltaMs = timestamp - previousTimestamp;

  updateGame(deltaMs);

  renderGame();

  previousTimestamp = timestamp;

  animationFrameId = requestAnimationFrame(frame);
}
```

Use a capped delta:

```typescript
const safeDelta = Math.min(deltaMs, 32);
```

This prevents large jumps when the browser tab temporarily loses focus.

---

# 11. Fixed-Timestep Option

A fixed timestep is preferable if the physics becomes unstable.

For the prototype, either:

- use normalized delta time, or
- use a small fixed simulation step

Do not over-engineer this.

If using fixed timestep:

```text
render FPS
     ≠
simulation FPS
```

The game should remain visually smooth while the simulation stays deterministic.

---

# 12. Game Actions

Use explicit actions.

```typescript
export type GameAction =
  | { type: "FLAP" }
  | { type: "WAIT" }
  | { type: "RESET" }
  | { type: "PAUSE" }
  | { type: "RESUME" };
```

`WAIT` normally does not need to modify state directly.

It exists because Jev must explicitly choose between two actions.

---

# 13. Flap Implementation

Conceptually:

```typescript
function applyFlap(drone: DroneState): DroneState {
  return {
    ...drone,
    velocityY: GAME_CONFIG.flapImpulse,
  };
}
```

The actual implementation can mutate an internal simulation object for performance, while React receives snapshots.

Avoid excessive object allocation inside the 60 FPS loop.

---

# 14. Physics

Each simulation tick:

```text
velocityY += gravity
y += velocityY
x += velocityX
```

Apply limits:

```text
velocityY = clamp(
  velocityY,
  -MAX_UPWARD_SPEED,
  MAX_DOWNWARD_SPEED
)
```

Rotation should be derived from velocity:

```text
rotation ∝ verticalVelocity
```

Keep the visual rotation separate from the actual physics.

---

# 15. Obstacle Generation

Generate gates ahead of the drone.

Each gate:

```typescript
{
  id,
  x,
  gapCenterY,
  gapSize,
  width,
  passed
}
```

The next gate is the first gate satisfying:

```text
gate.x + gate.width > drone.x
```

When a gate moves sufficiently far behind the drone:

```text
remove gate
generate next gate
```

Maintain a small fixed number of active gates.

---

# 16. Difficulty

Difficulty should be deterministic and gradual.

For example:

```typescript
const difficulty = Math.min(
  1,
  elapsedMs / 120000
);
```

Then interpolate:

```text
gapSize decreases
worldSpeed increases
gate variation increases
```

Do not make difficulty depend on Jev performance.

This keeps comparisons meaningful.

---

# 17. Collision Detection

Use simple AABB collision.

Drone bounding box:

```typescript
{
  x,
  y,
  width,
  height
}
```

Gate collision:

```text
if drone overlaps gate horizontally
AND
drone is outside gate gap
THEN collision
```

Top/bottom boundaries also cause collision.

Do not use pixel-perfect collision.

---

# 18. Score

Increase score when the drone successfully passes a gate.

Example:

```typescript
if (!gate.passed && gate.x + gate.width < drone.x) {
  gate.passed = true;
  score += 100;
}
```

Best score can be stored in localStorage.

No backend leaderboard.

---

# 19. Decision Provider Interface

This is the most important application abstraction.

```typescript
export interface TacticalDecisionProvider {
  decide(state: TacticalState): Promise<TacticalDecision>;
}
```

Result:

```typescript
export interface TacticalDecision {
  action: TacticalAction;

  probabilities?: {
    flap: number;
    wait: number;
  };

  confidence?: number;

  latencyMs: number;

  provider: "jev" | "mock";
  timestamp: number;
}
```

The UI must consume this interface rather than directly calling Jev.

---

# 20. Jev Provider

Create:

```text
lib/ai/jevProvider.ts
```

Responsibilities:

1. Receive `TacticalState`.
2. Build the Jev request.
3. Call the official Jev SDK/API.
4. Parse the response.
5. Validate the action.
6. Normalize the result.
7. Return `TacticalDecision`.

Do not expose Jev implementation details to React.

---

# 21. Jev API Implementation Rule

Before implementing the Jev provider:

**Verify the current official Jev SDK/API documentation.**

Do not invent:

- package names
- method names
- endpoint names
- authentication headers
- request fields
- response fields

The provider must be isolated so that if Jev's SDK/API changes, only this file and the server route need modification.

---

# 22. Server Jev Endpoint

Create:

```text
app/api/jev/decision/route.ts
```

Flow:

```text
POST
  │
  ▼
validate request
  │
  ▼
create Jev request
  │
  ▼
call Jev
  │
  ▼
validate result
  │
  ▼
normalize result
  │
  ▼
JSON response
```

Use server-side environment variables.

---

# 23. Request Validation

Validate incoming state.

At minimum:

```text
altitude
verticalVelocity
nextGateDistance
gapCenterY
gapSize
relativeGapOffset
horizontalVelocity
recentFlaps
timeSinceLastFlapMs
droneAlive
```

Reject malformed requests with:

```http
400 Bad Request
```

Do not allow arbitrary payloads to be passed directly to the Jev provider.

A lightweight validation library can be used if already installed.

Otherwise use manual TypeScript/runtime validation.

Do not add a dependency solely for this unless useful.

---

# 24. Decision Manager

Create:

```text
lib/ai/decisionManager.ts
```

The decision manager coordinates:

- decision timing
- provider calls
- stale-result protection
- current decision
- fallback
- decision history

The game engine should not know about HTTP.

---

# 25. Decision Lifecycle

```text
Game running
     │
     ▼
Decision timer reached?
     │
    YES
     │
     ▼
Build TacticalState
     │
     ▼
Request Jev
     │
     ├───────────────┐
     │               │
     ▼               ▼
success           failure
     │               │
     ▼               ▼
apply result      fallback
     │               │
     └───────┬───────┘
             ▼
       record decision
```

---

# 26. Avoid Stale Jev Decisions

Because Jev calls are asynchronous, a response may arrive after the game has moved significantly.

Each request should receive a monotonically increasing request ID.

Example:

```typescript
let latestRequestId = 0;

const requestId = ++latestRequestId;

const result = await provider.decide(state);

if (requestId !== latestRequestId) {
  return;
}
```

Discard stale decisions.

This prevents old network responses from overriding newer decisions.

---

# 27. Decision Cooldown

Do not allow multiple concurrent Jev requests.

Use:

```typescript
let decisionInFlight = false;
```

When a request starts:

```text
decisionInFlight = true
```

When it finishes:

```text
decisionInFlight = false
```

If a request is already in flight:

```text
skip new request
```

This keeps API traffic bounded.

---

# 28. What Happens While Jev Thinks

The game continues.

The last tactical action remains active.

For example:

```text
last decision = WAIT

Jev request in flight

game continues

new Jev result arrives
     ↓
FLAP
```

The game must never:

```text
freeze
wait synchronously
stop rendering
```

because an API call is pending.

---

# 29. Autopilot Control

In autopilot mode:

```typescript
if (decision.action === "flap") {
  applyFlap();
}
```

For `wait`:

```typescript
// intentionally do nothing
```

The decision manager controls when the action is applied.

---

# 30. Manual Mode

In manual mode:

```text
SPACE
  │
  ▼
applyFlap()
```

Jev can still be queried in parallel for comparison.

The Jev decision must never override the human.

Display:

```text
YOU: FLAP

JEV: WAIT
```

---

# 31. Lab Mode

Lab mode pauses the game.

The UI exposes the current tactical state.

The user can trigger:

```text
RUN JEV DECISION
```

This should make exactly one provider request.

Display the normalized result.

Lab mode is especially useful when demonstrating the architecture to engineers.

---

# 32. Mock Provider

Create:

```text
lib/ai/mockProvider.ts
```

It should implement the same interface:

```typescript
class MockDecisionProvider
  implements TacticalDecisionProvider
```

The mock should produce plausible but deterministic results.

Example:

```text
if descending quickly
AND
gap is above
→ flap

otherwise
→ wait
```

Add small deterministic probability values.

Do not label mock results as real Jev.

UI:

```text
DEMO MODE
MOCK JEV
```

---

# 33. Provider Selection

At startup:

```text
if JEV_API_KEY exists
    use Jev provider
else
    use Mock provider
```

For production deployment, prefer explicit configuration rather than silently switching.

Recommended:

```text
AI_PROVIDER=jev
```

or:

```text
AI_PROVIDER=mock
```

This avoids accidentally presenting mock output as live AI.

---

# 34. LLM Analyst

Create:

```text
lib/ai/llmAnalyst.ts
```

The LLM is not a tactical controller.

It receives:

```text
score
flight time
recent Jev decisions
selected telemetry
recent outcomes
```

It returns:

```typescript
export interface FlightAnalysis {
  summary: string;
  risk?: "low" | "medium" | "high";
  strategy?: string;
  generatedAt: number;
}
```

Keep the output structured.

Do not depend on arbitrary prose parsing.

---

# 35. Analyst API

Create:

```text
app/api/analyst/route.ts
```

Request:

```typescript
interface AnalystRequest {
  score: number;
  flightTimeSeconds: number;

  recentDecisions: Array<{
    action: TacticalAction;
    confidence?: number;
    latencyMs: number;
  }>;

  telemetry: {
    altitude: number;
    verticalVelocity: number;
    nextGateDistance: number;
    gapSize: number;
  };
}
```

Response:

```typescript
interface AnalystResponse {
  summary: string;
  risk?: "low" | "medium" | "high";
  strategy?: string;
}
```

---

# 36. Analyst Frequency

Do not call the LLM continuously.

Suggested:

```text
once every 8–12 seconds
```

or after a meaningful event:

```text
game started
major difficulty increase
near miss
multiple consecutive low-confidence decisions
game over
```

For the first prototype, simply use a timer.

---

# 37. LLM Provider

The exact provider should be configurable.

Environment:

```text
LLM_PROVIDER=
LLM_API_KEY=
LLM_MODEL=
```

Keep the provider behind a simple interface if practical:

```typescript
interface FlightAnalystProvider {
  analyze(input: AnalystRequest): Promise<FlightAnalysis>;
}
```

Do not introduce a full agent framework.

---

# 38. LLM Prompt

The analyst prompt should explicitly say:

```text
You are the Flight Analyst for a game AI system.

You do not control the drone.

Analyze only the telemetry provided.

Do not invent facts.

Return concise structured guidance.

Focus on:
- recent tactical behaviour
- risk
- flight stability
- whether the current strategy should be more conservative or aggressive
```

The LLM should not output JavaScript or game commands.

---

# 39. LLM vs Jev Responsibility

Maintain this boundary:

```text
                    LLM
                     │
            "What strategy?"
                     │
                     ▼
              Flight Analyst
                     │
                     │
                     ▼
                    Jev
                     │
             "What action now?"
                     │
                     ▼
               Game Engine
```

This is the core AI architecture being demonstrated.

---

# 40. React Architecture

Suggested top-level component:

```text
<App>
  <FlightLab>
    <GameCanvas />
    <GameHud />
    <ModeSelector />
    <JevDecisionPanel />
    <TelemetryPanel />
    <DecisionHistory />
    <FlightAnalyst />
    <ControlBar />
  </FlightLab>
</App>
```

Avoid putting the complete game engine inside `page.tsx`.

---

# 41. Game Canvas Component

`GameCanvas.tsx` should:

- create the canvas
- manage resize
- render game state
- handle pointer input
- connect to the game loop

It should not contain Jev API calls.

Use a `ref` for the canvas.

---

# 42. Game Controller

Create a hook or controller responsible for connecting the engine to React.

Possible:

```text
hooks/useFlightGame.ts
```

Responsibilities:

- initialize engine
- start/stop animation
- expose snapshots
- handle mode changes
- handle reset
- expose user flap action

Keep the high-frequency simulation state outside normal React render cycles.

---

# 43. Snapshot Strategy

The physics loop can mutate internal state.

React should receive periodic snapshots.

Example:

```typescript
interface GameSnapshot {
  drone: DroneState;
  gates: GateState[];
  score: number;
  elapsedMs: number;
  status: GameStatus;
}
```

Update React state at approximately 30–60 FPS if needed.

If 60 FPS causes unnecessary UI re-rendering, render the canvas directly from the internal engine and update HUD telemetry at a lower rate.

---

# 44. Canvas Rendering

Rendering functions:

```text
renderBackground()
renderStars()
renderGrid()
renderGates()
renderDrone()
renderParticles()
renderEffects()
```

Keep each renderer small.

Example:

```typescript
function renderDrone(
  ctx: CanvasRenderingContext2D,
  drone: DroneState
)
```

---

# 45. Responsive Canvas

Use device pixel ratio:

```typescript
const dpr = window.devicePixelRatio || 1;
```

Scale the canvas appropriately.

CSS size:

```text
width: 100%
height: auto
```

Internal canvas resolution should account for DPR.

Do not create huge canvases on mobile.

---

# 46. Visual Rendering Strategy

The canvas should use:

- gradients
- translucent layers
- line glow
- small particle arrays
- simple geometric drone

Do not load large image assets.

This keeps the project:

- portable
- fast
- easy to deploy
- easy for Cursor to modify

---

# 47. Particles

Use a bounded particle pool.

Example:

```typescript
const MAX_PARTICLES = 120;
```

Recycle particles rather than constantly allocating objects.

Particles should be cosmetic only.

If particles cause performance issues, disable them.

---

# 48. Game State and React State

Do not use React state for:

```text
x
y
velocity
particle positions
gate positions
```

at every physics tick.

Use an imperative game state/controller.

Use React state for:

```text
mode
status
score display
telemetry display
Jev decision
decision history
analyst output
```

---

# 49. Decision History Storage

Keep the last 20 decisions in memory.

```typescript
const MAX_DECISION_HISTORY = 20;
```

Each item should contain:

```typescript
interface DecisionRecord {
  id: number;
  timestamp: number;

  state: TacticalState;

  decision: TacticalDecision;

  outcome?: "survived" | "collision" | "pending";
}
```

The stored state allows the decision inspector to reproduce what Jev saw.

---

# 50. Decision Inspector

When the user selects a decision:

```text
selectedDecisionId
```

The UI retrieves the full `DecisionRecord`.

Display:

- action
- probabilities
- confidence
- latency
- exact tactical state
- provider
- timestamp
- outcome if known

Do not regenerate the decision.

The inspector shows historical data.

---

# 51. Telemetry

Compute derived telemetry in application code.

Examples:

```text
risk
distance to gap
vertical error
time to gate
```

Risk should be clearly labeled as:

```text
APP CALCULATED
```

if displayed.

Do not claim that Jev generated it unless it actually did.

---

# 52. Latency Measurement

Measure actual round-trip time:

```typescript
const start = performance.now();

const result = await fetch(...);

const latencyMs = performance.now() - start;
```

Server can optionally report provider latency separately.

Do not fabricate latency.

---

# 53. Client Request Timeout

Set a reasonable timeout.

Example:

```typescript
const controller = new AbortController();

const timeout = setTimeout(
  () => controller.abort(),
  2500
);
```

If Jev does not respond:

```text
use fallback
```

Do not allow a request to remain pending indefinitely.

---

# 54. Retry Policy

For the one-day prototype:

- no aggressive retry loops
- at most one retry for transient failures if desired
- never retry continuously during gameplay

A failed decision should not stall the game.

---

# 55. Error Classification

Internally distinguish:

```text
CONFIG_ERROR
NETWORK_ERROR
TIMEOUT
PROVIDER_ERROR
INVALID_RESPONSE
```

UI can show:

```text
JEV OFFLINE
Fallback controller active
```

Detailed error can go to console during development.

---

# 56. Logging

Use structured development logging:

```typescript
console.info("[JEV]", {
  action,
  latencyMs,
  requestId,
});
```

Do not log:

- API keys
- authorization headers
- sensitive provider payloads

Avoid logging every animation frame.

---

# 57. Configuration

Create:

```text
lib/config.ts
```

Configuration should include:

```typescript
export const config = {
  aiProvider: process.env.AI_PROVIDER ?? "mock",

  jevDecisionIntervalMs: 220,

  analystIntervalMs: 10000,

  maxDecisionHistory: 20,
};
```

Do not import server-only secrets into client components.

Separate public and server configuration.

---

# 58. Environment Variables

`.env.example`:

```env
AI_PROVIDER=mock

JEV_API_KEY=

LLM_PROVIDER=
LLM_API_KEY=
LLM_MODEL=
```

For production:

```env
AI_PROVIDER=jev
JEV_API_KEY=...
```

LLM can remain disabled.

---

# 59. Security

Never do this:

```typescript
const key = process.env.JEV_API_KEY;

return <Game apiKey={key} />;
```

Never include secrets in:

- client bundles
- URL query parameters
- localStorage
- game state
- decision history
- console logs

Server route only.

---

# 60. CORS

No CORS configuration is required if the browser calls:

```text
/api/jev/decision
```

on the same Next.js origin.

The server route makes the external provider request.

---

# 61. API Response Validation

Treat external model responses as untrusted.

Validate:

```text
action ∈ {"flap", "wait"}
probabilities are numeric if present
confidence numeric if present
```

If invalid:

```text
throw INVALID_RESPONSE
```

then use fallback.

Never execute arbitrary provider output.

---

# 62. Probability Normalization

If Jev returns probabilities, preserve the real values.

Do not modify them merely to make the UI look nicer.

If values are not normalized:

```text
normalize only if the official response semantics require it
```

Otherwise display the raw provider semantics accurately.

---

# 63. Confidence

Only display confidence if Jev actually provides a confidence value.

If no confidence is returned:

```text
Confidence
N/A
```

Do not derive a fake confidence from the highest probability unless explicitly labeled:

```text
Top-choice probability
```

---

# 64. Decision Visualization

The primary visualization:

```text
FLAP
████████████████░░░░  74%

WAIT
██████░░░░░░░░░░░░░░  26%
```

Use animated bars.

The selected action should receive a subtle glow.

Do not over-animate the entire dashboard.

---

# 65. Status Machine

Jev UI status:

```text
offline
idle
thinking
online
error
```

Transitions:

```text
idle → thinking
thinking → online
thinking → error
error → thinking
```

When provider is mock:

```text
mock
```

Use a separate indicator.

---

# 66. Game Status Machine

```text
idle
  ↓
running
  ↓
paused
  ↓
running
  ↓
game_over
  ↓
idle
```

Prevent invalid actions.

For example:

```text
game_over + flap
```

should do nothing.

---

# 67. Manual Controls

Desktop:

```text
SPACE
```

Mobile:

```text
TAP GAME
```

Do not make buttons overlap the canvas in a way that interferes with gameplay.

---

# 68. Accessibility

Basic accessibility:

- keyboard controls
- visible focus states
- sufficient text contrast
- buttons have accessible labels
- status messages use appropriate ARIA where useful

Do not sacrifice the game visual design for excessive accessibility abstraction.

---

# 69. Mobile

Mobile should support:

- portrait mode
- tap to flap
- vertically stacked panels
- smaller telemetry
- hidden/condensed decision history if necessary

The game canvas should remain usable.

---

# 70. Desktop Priority

Desktop is the primary demonstration environment.

Optimize the main layout for:

```text
1280x720
1440x900
1920x1080
```

The game should remain the dominant visual element.

---

# 71. Recommended Layout Grid

Use:

```text
Main:
  70% game
  30% telemetry/control

Bottom:
  decision history
```

Or, if viewport width is limited:

```text
Game: full width
Panels: 2-column below
```

Do not let telemetry dominate the game.

---

# 72. UX Microcopy

Use concise language.

Good:

```text
JEV ONLINE
THINKING
FLAP
WAIT
AUTOPILOT
MANUAL
LAB
FLIGHT ANALYST
```

Avoid:

```text
Our advanced artificial intelligence model has determined...
```

This is a technical demo, not marketing copy.

---

# 73. Initial Landing State

When the page loads:

```text
JEV FLIGHT LAB

AUTONOMOUS DECISION DEMO

[ START AUTOPILOT ]

[ MANUAL ]

[ LAB ]
```

Background animation can already run.

Once started, enter the game immediately.

---

# 74. Game Over

Show:

```text
FLIGHT TERMINATED

SCORE
2480

FLIGHT TIME
01:12

JEV DECISIONS
184

AVG LATENCY
91ms

[ FLY AGAIN ]
```

If autopilot:

```text
JEV made 184 tactical decisions.
```

If mock:

```text
MOCK JEV
```

Do not compare performance against humans unless there is enough data.

---

# 75. Debug Overlay

Support a development-only debug mode.

Example:

```text
?debug=1
```

Display:

```text
FPS: 59
GAME TIME: 42.2
JEV IN FLIGHT: false
LAST REQUEST: 812ms
GATES: 4
PARTICLES: 87
```

Do not show this in the normal demo.

---

# 76. Testing Strategy

Focus testing on deterministic logic.

## Unit tests

If the repository already has a test framework, add tests for:

```text
physics
collision
score
gate generation
tactical state projection
mock provider
decision normalization
```

If no test framework exists, do not spend significant time configuring one solely for this prototype.

---

# 77. Game Engine Determinism

Given the same:

```text
initial state
configuration
input sequence
```

the engine should produce the same result.

This is valuable for future benchmarking.

Random gate generation should use a seedable random function if practical.

For V1, deterministic seeded generation is preferred but not mandatory.

---

# 78. Benchmark / Experiment Mode

Do not implement a large benchmark system in V1.

However, structure the code so the following can be added later:

```text
runScenario()
  ↓
decision provider
  ↓
simulate
  ↓
collect metrics
```

Potential future metrics:

```text
score
survival time
decisions
average latency
timeouts
invalid responses
fallback count
```

---

# 79. Future Jev vs LLM Experiment

Architecture should make this possible later:

```text
                  SAME GAME STATE
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
             JEV                   LLM
              │                     │
          flap/wait             flap/wait
              │                     │
              └──────────┬──────────┘
                         ▼
                    SIMULATOR
```

The first prototype should not require this mode.

The provider interface already makes it possible.

---

# 80. Future Hybrid Mode

Potential V2:

```text
LLM:
"Prefer conservative flight strategy."

             ↓

Jev:
"Given the current state, FLAP."

             ↓

Game:
execute FLAP
```

The LLM should never bypass the tactical safety/decision layer without an explicit architecture change.

---

# 81. Folder Structure

Recommended:

```text
app/
├── api/
│   ├── analyst/
│   │   └── route.ts
│   └── jev/
│       └── decision/
│           └── route.ts
├── globals.css
├── layout.tsx
└── page.tsx

components/
├── ControlBar.tsx
├── DecisionHistory.tsx
├── DecisionInspector.tsx
├── FlightAnalyst.tsx
├── GameCanvas.tsx
├── GameHud.tsx
├── JevDecisionPanel.tsx
├── LabPanel.tsx
├── ModeSelector.tsx
├── StatusIndicator.tsx
└── TelemetryPanel.tsx

hooks/
└── useFlightGame.ts

lib/
├── ai/
│   ├── decisionManager.ts
│   ├── decisionProvider.ts
│   ├── jevProvider.ts
│   ├── mockProvider.ts
│   └── llmAnalyst.ts
├── config.ts
└── game/
    ├── collision.ts
    ├── constants.ts
    ├── gameEngine.ts
    ├── obstacles.ts
    ├── physics.ts
    └── types.ts

public/
.env.example
PROJECT_SPEC.md
TECHNICAL_IMPLEMENTATION.md
README.md
```

Adapt this structure if the repository already has a better convention.

---

# 82. Implementation Order

Follow this order strictly.

## Step 1 — Repository inspection

Inspect:

- package.json
- Next.js version
- existing components
- Tailwind configuration
- TypeScript configuration

Do not replace an existing project unnecessarily.

## Step 2 — Minimal game

Build:

- canvas
- drone
- gates
- physics
- collision
- scoring
- reset

## Step 3 — Game state

Add:

- `GameState`
- `TacticalState`
- projection

## Step 4 — Provider interface

Add:

```text
TacticalDecisionProvider
```

## Step 5 — Mock Jev

Make autopilot work entirely with mock decisions.

## Step 6 — Real Jev

Verify current official Jev SDK/API.

Implement server route.

## Step 7 — Jev telemetry UI

Add:

- decision
- probabilities
- confidence if available
- latency
- provider status

## Step 8 — Decision history

Add:

- history
- inspector

## Step 9 — Modes

Add:

- autopilot
- manual
- lab

## Step 10 — Visual polish

Add:

- neon drone
- particles
- parallax
- glow
- transitions
- responsive layout

## Step 11 — Optional LLM

Only after Jev gameplay works.

## Step 12 — Validation

Run:

```bash
npm run lint
npm run build
```

Fix all issues.

---

# 83. Definition of Done

Technical implementation is complete when:

### Game

- [ ] Canvas renders
- [ ] Drone moves
- [ ] Gravity works
- [ ] Flap works
- [ ] Gates generate
- [ ] Collision works
- [ ] Score works
- [ ] Reset works
- [ ] Game over works

### AI

- [ ] Tactical state is generated
- [ ] Provider interface exists
- [ ] Mock provider works
- [ ] Real Jev provider works
- [ ] Jev API key is server-side
- [ ] Requests are asynchronous
- [ ] Requests are bounded
- [ ] Stale responses are ignored
- [ ] Failures use explicit fallback
- [ ] Real provider status is visible

### UI

- [ ] Neon futuristic drone
- [ ] Smooth animation
- [ ] Jev decision panel
- [ ] Telemetry
- [ ] Decision history
- [ ] Decision inspector
- [ ] Autopilot
- [ ] Manual
- [ ] Lab mode
- [ ] Responsive desktop/mobile layout

### Optional LLM

- [ ] Analyst route
- [ ] Analyst provider
- [ ] Periodic analysis
- [ ] Failure handling
- [ ] No control over game

### Engineering

- [ ] No secrets in client
- [ ] No unnecessary frameworks
- [ ] No database
- [ ] No blocking model requests
- [ ] No fake Jev data in real mode
- [ ] Build succeeds
- [ ] README explains setup

---

# 84. Non-Goals

Do not optimize for:

- production-grade infrastructure
- enterprise authentication
- massive scale
- multi-user state
- sophisticated AI planning
- model fine-tuning
- reinforcement learning
- 3D graphics
- advanced game physics

The goal is:

> **A beautiful, technically credible, real Jev-powered prototype that can be built and demonstrated in one day.**

---

# 85. Engineering Quality Bar

Prefer:

```text
simple
typed
observable
testable
replaceable
```

Avoid:

```text
clever
over-abstracted
framework-heavy
distributed
```

A small prototype with clean boundaries is better than a large prototype with impressive folder structure.

---

# 86. Final Architecture

The final V1 should look like:

```text
                         BROWSER
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                     JEV FLIGHT LAB                           │
│                                                              │
│  ┌──────────────────── GAME CANVAS ───────────────────────┐  │
│  │                                                        │  │
│  │                     🚁                                 │  │
│  │                                                        │  │
│  │              ║                         ║               │  │
│  │              ║         GAP             ║               │  │
│  │                                                        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────┐   ┌────────────────────────────────┐  │
│  │ JEV DECISION     │   │ TELEMETRY                     │  │
│  │                  │   │                                │  │
│  │ FLAP  █████ 74%  │   │ altitude: 61                  │  │
│  │ WAIT  ██    26%  │   │ velocity: -2.4                │  │
│  │                  │   │ gate: 84                      │  │
│  │ → FLAP           │   │ gap: 112                      │  │
│  │ latency: 84ms    │   │                                │  │
│  └──────────────────┘   └────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ DECISION HISTORY                                      │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                             │
                             │ POST
                             ▼
                  ┌─────────────────────┐
                  │ Next.js API Route   │
                  └─────────┬───────────┘
                            │
                  ┌─────────┴─────────┐
                  ▼                   ▼
             ┌─────────┐       ┌──────────┐
             │   JEV   │       │   LLM    │
             │tactical │       │ analyst  │
             └─────────┘       └──────────┘
```

The central technical story is:

```text
                 STATE
                   │
                   ▼
          ┌─────────────────┐
          │      JEV        │
          │ bounded choice  │
          └────────┬────────┘
                   │
             FLAP / WAIT
                   │
                   ▼
              GAME ENGINE
                   │
                   ▼
                RESULT
                   │
                   ├──────────────► TELEMETRY
                   │
                   └──────────────► LLM ANALYST
```

This is the implementation boundary that should remain intact even if the UI, game mechanics, or model provider changes.
