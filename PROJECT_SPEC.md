# JEV Flight Lab — Project Specification

## 1. Project Overview

**Project name:** JEV Flight Lab  
**Working title:** Autonomous Decision Demo  
**Prototype target:** One-day Cursor-built web prototype

JEV Flight Lab is a polished, futuristic 2D browser game inspired by Flappy Bird mechanics.

A small **neon futuristic drone** flies continuously through moving obstacle gates. The game engine owns physics and rendering. **Jev is the tactical decision-maker**: at meaningful decision points it chooses between `FLAP` and `WAIT`.

The primary purpose is not to build a complex game. The purpose is to create a visually impressive, immediately understandable demonstration of:

> **Game state → bounded AI decision → action → game result**

An optional LLM acts as a slower **Flight Analyst / Strategy Layer**, demonstrating how an LLM and Jev can have different responsibilities in the same AI system.

---

# 2. Core Product Principle

The architecture must make the following distinction obvious:

### Game Engine
Owns:
- physics
- rendering
- collision detection
- scoring
- obstacle generation
- game lifecycle
- deterministic state

### Jev
Owns:
- tactical decision: `FLAP` or `WAIT`
- decision probabilities
- confidence, where available

### Optional LLM
Owns:
- higher-level observations
- strategic commentary
- recent-flight analysis
- human-readable recommendations

**Do not use an LLM for every game tick.**

**Do not ask Jev to generate prose explanations.**

The application itself should derive telemetry and explanations from the actual game state and Jev's structured decision.

---

# 3. Primary User Experience

When the application opens, the user should immediately see a polished neon flight simulation.

The main screen should contain:

1. Large central game canvas
2. Futuristic drone
3. Neon obstacle gates
4. Animated background/parallax effects
5. Score and flight time
6. Jev decision panel
7. Flight telemetry panel
8. Decision history
9. Game controls
10. Optional LLM Flight Analyst panel

The application should feel like a mixture of:

- futuristic flight simulator
- AI laboratory
- arcade game
- developer demonstration

It should NOT look like a generic admin dashboard.

---

# 4. Visual Direction

## Theme

**Neon futuristic drone / AI laboratory**

Use a dark background with subtle gradients and neon accents.

Suggested palette:

- background: near-black / deep navy
- primary neon: cyan
- secondary neon: violet
- success: green
- warning: amber
- danger: red
- text: white / cool gray

Do not make the interface visually noisy.

Use glow effects selectively.

## Typography

Use a modern technical sans-serif font.

Examples:
- Inter
- Geist
- Space Grotesk

Prefer one primary font family.

## Visual effects

Use lightweight effects:

- soft neon glow
- animated grid
- subtle particles
- parallax stars
- gate glow
- drone exhaust trail
- subtle screen shake on collision
- smooth score transitions
- panel hover transitions

Avoid expensive effects that hurt performance.

---

# 5. Main Game

## Game Concept

The drone continuously moves horizontally from left to right.

The world scrolls from right to left.

The drone automatically maintains horizontal movement.

The only tactical action is:

```text
FLAP
```

or

```text
WAIT
```

This is deliberately simple because Jev needs a clearly bounded decision space.

## Controls

Manual mode:

```text
SPACE = FLAP
```

Optional:
- mouse click = FLAP
- touch/tap = FLAP

Do not require complex keyboard controls.

---

# 6. Game Physics

Keep physics simple and deterministic.

Suggested initial values:

```text
canvas width: responsive
canvas height: approximately 600px desktop

gravity: configurable
flap impulse: configurable
horizontal speed: configurable
maximum vertical velocity: configurable
```

Do not spend time making physics perfectly realistic.

The game should feel smooth and responsive.

The drone should have:

- idle hover animation
- slight rotation based on vertical velocity
- engine glow
- exhaust particles

---

# 7. Obstacles

Obstacles are vertical neon gates with a gap.

Example:

```text
████████████
████████████
████████████

      GAP

████████████
████████████
████████████
```

Each gate has:

```typescript
type Gate = {
  x: number;
  gapCenterY: number;
  gapSize: number;
  width: number;
  passed: boolean;
};
```

Generate gates ahead of the drone.

Difficulty should gradually increase by:

- reducing gap size
- increasing horizontal speed
- varying gap position

Do not create impossible gates.

---

# 8. Collision

Collision occurs when:

1. drone hits the top boundary
2. drone hits the bottom boundary
3. drone intersects a gate outside its gap

On collision:

- stop gameplay
- show a short visual effect
- preserve final telemetry
- display final score
- allow restart

---

# 9. Game Modes

Implement three modes.

## Mode A — AUTOPILOT

Jev controls the drone.

This is the primary demo mode.

Every decision cycle:

```text
GAME STATE
    ↓
JEV
    ↓
FLAP / WAIT
    ↓
GAME ENGINE
```

The user should see the decision live.

---

## Mode B — MANUAL

The human controls the drone.

Space/click causes `FLAP`.

Jev still evaluates the state and displays:

> "Jev would choose..."

This lets the user compare their own decisions against Jev.

Example:

```text
YOU CHOSE: FLAP

JEV:
FLAP 81%
WAIT 19%

✓ AGREEMENT
```

or:

```text
YOU CHOSE: WAIT

JEV:
FLAP 74%
WAIT 26%

DIFFERENT DECISION
```

Do not imply that disagreement means the human was wrong.

---

## Mode C — LAB

Pause the game and expose the decision state.

Display:

```text
ALTITUDE
61

VERTICAL VELOCITY
-2.4

NEXT GAP DISTANCE
84

GAP SIZE
112

GAP OFFSET
+8

HORIZONTAL SPEED
4.0

TIME SINCE LAST FLAP
180ms
```

Add:

```text
[ RUN JEV DECISION ]
```

When clicked, call Jev and display the result.

This mode is specifically intended for technical demonstrations.

---

# 10. Jev Decision Model

The Jev decision must remain narrowly scoped.

## Decision

```text
Should the drone FLAP or WAIT?
```

Choices:

```text
flap
wait
```

The exact Jev SDK/API syntax must be verified against the current Jev documentation before implementation. Do not invent API methods.

Use the official Jev package/API available for the chosen implementation.

---

# 11. Game State Sent to Jev

Construct a compact state object.

Suggested TypeScript type:

```typescript
type JevGameState = {
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
};
```

Only include information that Jev needs to make the decision.

Do not send:
- rendering data
- particle state
- DOM state
- unnecessary historical data
- secrets
- API credentials

---

# 12. Jev Decision Result

Normalize Jev's result into an internal application type.

```typescript
type JevDecision = {
  action: "flap" | "wait";
  probabilities?: {
    flap: number;
    wait: number;
  };
  confidence?: number;
  latencyMs: number;
  timestamp: number;
};
```

If the current Jev API provides probability information, display it.

If it does not provide a field, do not fabricate one.

---

# 13. Decision Timing

Do NOT call Jev at 60 FPS.

Rendering can run at approximately 60 FPS.

Jev decisions should happen only at meaningful tactical intervals.

Recommended prototype behavior:

```text
game rendering: 60 FPS

Jev decision:
approximately every 150–300ms
OR
when the previous decision expires
```

The exact interval should be configurable.

Use a decision cooldown to prevent excessive API calls.

Example:

```typescript
const JEV_DECISION_INTERVAL_MS = 220;
```

Keep this value in configuration.

---

# 14. Handling Jev Latency

The game must never freeze while waiting for Jev.

Use this model:

```text
GAME LOOP
   │
   ├── render
   ├── physics
   ├── collision
   └── if decision required
             │
             ├── request Jev asynchronously
             │
             └── continue simulation
```

While waiting:

- continue rendering
- maintain last action
- show `THINKING...`
- do not block the UI

Example:

```text
JEV STATUS

● THINKING...

Last decision:
WAIT
```

When the result arrives:

```text
JEV STATUS

● ONLINE

Decision:
FLAP
```

---

# 15. Fallback Behaviour

The game must remain playable if Jev is unavailable.

Implement a deterministic fallback controller.

Example:

```typescript
function fallbackDecision(state: JevGameState): "flap" | "wait" {
  // Simple safe heuristic.
}
```

The UI must clearly indicate:

```text
JEV OFFLINE
FALLBACK CONTROLLER ACTIVE
```

Never pretend the fallback decision came from Jev.

This is important for technical credibility.

---

# 16. Server-Side Security

Jev credentials must NEVER be exposed to browser JavaScript.

Preferred architecture:

```text
Browser
   │
   │ POST /api/jev/decision
   ▼
Next.js Server Route
   │
   │ JEV API key
   ▼
Jev
```

Environment variable:

```text
JEV_API_KEY=
```

The API key must be read only on the server.

Never commit `.env` files containing secrets.

Provide `.env.example`.

---

# 17. API Route

Create:

```text
POST /api/jev/decision
```

Request:

```json
{
  "state": {
    "altitude": 61,
    "verticalVelocity": -2.4,
    "nextGateDistance": 84,
    "gapCenterY": 300,
    "gapSize": 112,
    "relativeGapOffset": 8,
    "horizontalVelocity": 4,
    "recentFlaps": 2,
    "timeSinceLastFlapMs": 180,
    "droneAlive": true
  }
}
```

Response should be normalized into:

```json
{
  "action": "flap",
  "probabilities": {
    "flap": 0.74,
    "wait": 0.26
  },
  "confidence": 0.82,
  "latencyMs": 84
}
```

Do not assume all fields are available from Jev. Normalize only fields actually returned by the SDK/API.

---

# 18. LLM Flight Analyst

The LLM is OPTIONAL.

The application must work fully without it.

The LLM should NOT control the drone in the first version.

Its job is to provide higher-level analysis.

Example input:

```json
{
  "score": 1240,
  "flightTimeSeconds": 47,
  "recentDecisions": [
    {
      "action": "flap",
      "confidence": 0.81
    },
    {
      "action": "wait",
      "confidence": 0.67
    }
  ],
  "recentGameStates": [],
  "collisionsAvoided": 19
}
```

Prompt concept:

> Analyze the recent flight behaviour and provide one short strategic observation. Do not control the game. Do not invent telemetry.

Example output:

```text
The drone is descending quickly and the next gate is relatively close.
A conservative flight pattern would reduce late corrective flaps.
```

Keep output short.

Maximum approximately 2–3 sentences.

---

# 19. LLM Architecture

Use:

```text
Game Engine
     │
     ├───────────────┐
     │               │
     ▼               ▼
   Jev              LLM
 Tactical          Strategic
 Decision          Analysis
     │               │
     └───────┬───────┘
             ▼
           UI
```

Do not create an unnecessary agent framework.

For the prototype, a simple server API call is enough.

---

# 20. LLM Failure

If the LLM is unavailable:

```text
FLIGHT ANALYST

Analyst unavailable.
Jev autopilot continues normally.
```

The game must continue.

---

# 21. Main UI Layout

Desktop:

```text
┌──────────────────────────────────────────────────────────────┐
│ JEV FLIGHT LAB                         ● JEV ONLINE           │
│ Autonomous Decision Demonstration                            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                     GAME CANVAS                              │
│                                                              │
│                 🚁                                           │
│                                                              │
│                       ║                                      │
│                       ║                                      │
│                             ║                                │
│                             ║                                │
│                                                              │
├──────────────────────────────┬───────────────────────────────┤
│ JEV DECISION                 │ FLIGHT TELEMETRY              │
│                              │                               │
│ FLAP       ████████  74%     │ Altitude       61             │
│ WAIT       ███      26%      │ Velocity       -2.4           │
│                              │ Gate Distance  84             │
│ → FLAP                       │ Gap Size       112            │
│ Confidence 82%               │ Risk           LOW            │
│ Latency 84ms                 │                               │
├──────────────────────────────┴───────────────────────────────┤
│ DECISION HISTORY                                             │
│ 00:41.2 FLAP 74%   00:41.5 WAIT 63%   00:41.8 FLAP 91%     │
└──────────────────────────────────────────────────────────────┘
```

Mobile should stack panels vertically.

---

# 22. UI Components

Suggested structure:

```text
components/
  GameCanvas.tsx
  GameHud.tsx
  JevDecisionPanel.tsx
  TelemetryPanel.tsx
  DecisionHistory.tsx
  FlightAnalyst.tsx
  ModeSelector.tsx
  ControlBar.tsx
  StatusIndicator.tsx
  LabPanel.tsx
```

Do not create components for every tiny HTML element.

---

# 23. Game Engine Separation

Keep game logic independent from React UI.

Suggested:

```text
lib/game/
  gameEngine.ts
  physics.ts
  collision.ts
  obstacles.ts
  types.ts
  constants.ts
```

The engine should expose state and actions.

Example:

```typescript
type GameAction =
  | { type: "FLAP" }
  | { type: "WAIT" }
  | { type: "RESET" };
```

React should render the state rather than contain all physics logic.

---

# 24. Animation

Use `requestAnimationFrame` for the main game loop.

Do not use React state updates for every physics frame if that creates unnecessary re-rendering.

Use a canvas for the actual game.

React controls:

- HUD
- panels
- controls
- telemetry
- decision history
- status

---

# 25. Visual Game Details

## Drone

Design a simple futuristic drone:

- triangular / angular silhouette
- cyan/violet neon outline
- small cockpit
- animated engine trail
- subtle rotation

Do not use external copyrighted artwork.

Use Canvas drawing or CSS/SVG shapes.

## Gates

Use:

- neon vertical structures
- glowing edges
- subtle animated energy lines
- particle effects near the gap

## Background

Use:

- dark gradient
- moving stars
- subtle perspective grid
- distant glowing structures

Keep it lightweight.

---

# 26. HUD

Top HUD:

```text
JEV FLIGHT LAB

SCORE       1240
TIME        00:47
BEST        3840

● AUTOPILOT
```

Jev status:

```text
● JEV ONLINE
```

When waiting:

```text
◌ JEV THINKING
```

When unavailable:

```text
○ JEV OFFLINE
```

---

# 27. Decision History

Maintain the last approximately 20 decisions.

```typescript
type DecisionHistoryItem = {
  timestamp: number;
  action: "flap" | "wait";
  probabilities?: {
    flap: number;
    wait: number;
  };
  confidence?: number;
  latencyMs: number;
};
```

Show the most recent decisions first.

Allow clicking a decision to inspect its associated game state.

---

# 28. Decision Inspector

Clicking a decision opens a small modal/panel.

Show:

```text
DECISION #42

ACTION
FLAP

PROBABILITY
FLAP 74%
WAIT 26%

CONFIDENCE
82%

LATENCY
84ms

GAME STATE

Altitude              61
Vertical velocity     -2.4
Gate distance         84
Gap size              112
Gap offset            +8
Horizontal velocity   4.0
```

This is one of the most important technical-demo features.

---

# 29. Demo Narrative

The application should naturally communicate this story:

### Step 1

> "The game engine continuously produces a structured world state."

### Step 2

> "Jev receives that state and makes one bounded tactical decision."

### Step 3

> "The game executes the decision."

### Step 4

> "The UI exposes the decision probabilities and telemetry."

### Step 5

> "An optional LLM provides slower strategic analysis."

Do not put all of this in large marketing text.

The UI should demonstrate it visually.

---

# 30. Performance Requirements

Target:

- 60 FPS rendering on a normal laptop
- no visible stutter while Jev requests are pending
- no UI freezing
- no unnecessary API requests
- bounded decision history
- bounded particle count

The Jev request must never block the animation loop.

---

# 31. Error Handling

Handle:

- Jev API timeout
- Jev API error
- malformed Jev response
- missing API key
- LLM unavailable
- network failure
- game restart
- browser resize

Use friendly UI messages.

Do not expose stack traces to users.

Console logging is acceptable in development.

---

# 32. Environment

Provide:

```text
.env.example
```

with:

```text
JEV_API_KEY=
LLM_API_KEY=
LLM_MODEL=
```

Only configure the LLM variables if an LLM provider is implemented.

---

# 33. Local Development

The project should support:

```bash
npm install
npm run dev
```

and:

```bash
npm run build
npm run start
```

Also provide:

```bash
npm run lint
```

if the selected Next.js setup supports it.

---

# 34. Deployment

Target easy deployment to Vercel.

Requirements:

- Next.js
- server-side API route for Jev
- environment variables configured in deployment
- no client-side API secret
- no database required

---

# 35. Data Persistence

Do NOT add a database for the prototype.

Keep:

- score
- decision history
- telemetry
- session state

in memory/browser state.

Optional localStorage:

```text
bestScore
```

Nothing else is required.

---

# 36. Scope Restrictions

This is a one-day prototype.

DO NOT implement:

- authentication
- database
- multiplayer
- user accounts
- complex AI agents
- vector database
- RAG
- LangGraph
- microservices
- WebSockets
- Kubernetes
- complex physics
- 3D rendering
- blockchain
- social features
- leaderboards requiring a backend
- elaborate game progression
- multiple maps
- complex weapons

The purpose is a polished AI demonstration, not a production game.

---

# 37. Important Engineering Principle

Avoid fake AI.

Do not:

- hardcode Jev-looking probabilities
- label heuristic decisions as Jev
- generate fake confidence
- fabricate latency
- simulate API responses when Jev is configured

If a development mock mode is required, label it clearly:

```text
DEMO MODE
MOCK JEV
```

The real Jev integration should be used whenever credentials are available.

---

# 38. Mock Mode

The app should include a development fallback so the UI can be developed without an API key.

Mock mode should implement the same internal interface:

```typescript
interface DecisionProvider {
  decide(state: JevGameState): Promise<JevDecision>;
}
```

Implement:

```text
JevDecisionProvider
MockDecisionProvider
```

The UI should not care which provider is being used.

---

# 39. Provider Architecture

Use a lightweight provider abstraction:

```typescript
interface TacticalDecisionProvider {
  decide(state: JevGameState): Promise<JevDecision>;
}
```

Implementation:

```text
lib/ai/
  decisionProvider.ts
  jevProvider.ts
  mockProvider.ts
  llmAnalyst.ts
```

Do not build a generic AI framework.

The abstraction exists only to:

- keep the game testable
- support mock mode
- isolate Jev integration
- avoid coupling UI to the API

---

# 40. Testing

At minimum test:

### Game logic

- flap changes vertical velocity
- gravity works
- collision works
- gate passing increases score
- reset works

### Jev integration

- request payload is valid
- response is normalized
- API failure activates fallback
- API key is server-side

### UI

- autopilot mode works
- manual mode works
- lab mode works
- decision history updates

Do not spend hours building exhaustive tests.

---

# 41. Acceptance Criteria

The prototype is complete when:

1. The app starts locally.
2. A neon futuristic drone is visible.
3. Obstacles move smoothly.
4. The game is playable.
5. Autopilot mode works.
6. Jev makes real `FLAP` / `WAIT` decisions when configured.
7. Jev decisions appear in the UI.
8. Decision probabilities are displayed when provided by Jev.
9. Jev latency is displayed from the actual request.
10. Jev does not block the animation loop.
11. Manual mode works.
12. Lab mode works.
13. Decision history works.
14. Clicking a decision shows its state.
15. Jev failure is handled gracefully.
16. The LLM analyst is optional.
17. No API secrets reach the browser.
18. The UI looks polished enough for a live demo.
19. `npm run build` succeeds.
20. The code remains small and understandable.

---

# 42. Suggested Project Structure

```text
app/
  api/
    jev/
      decision/
        route.ts
    analyst/
      route.ts
  page.tsx
  layout.tsx
  globals.css

components/
  GameCanvas.tsx
  GameHud.tsx
  JevDecisionPanel.tsx
  TelemetryPanel.tsx
  DecisionHistory.tsx
  DecisionInspector.tsx
  FlightAnalyst.tsx
  ModeSelector.tsx
  ControlBar.tsx
  StatusIndicator.tsx
  LabPanel.tsx

lib/
  game/
    gameEngine.ts
    physics.ts
    collision.ts
    obstacles.ts
    types.ts
    constants.ts
  ai/
    decisionProvider.ts
    jevProvider.ts
    mockProvider.ts
    llmAnalyst.ts
  utils/
    formatters.ts

public/

.env.example
README.md
```

The exact structure may be adjusted if the existing repository already has a sensible architecture.

---

# 43. Cursor Implementation Strategy

Implement in this order:

## Phase 1 — Game

Build a fully playable Flappy-Bird-style game with a futuristic drone.

Do not integrate AI yet.

## Phase 2 — Game State

Create a clean `JevGameState`.

## Phase 3 — Mock AI

Implement the decision-provider interface and mock Jev.

Verify the entire decision pipeline.

## Phase 4 — Real Jev

Implement the server-side Jev integration using the current official Jev SDK/API documentation.

Do not invent API syntax.

## Phase 5 — Decision UI

Add:

- probabilities
- confidence
- latency
- status
- history
- inspector

## Phase 6 — Modes

Add:

- Autopilot
- Manual
- Lab

## Phase 7 — Visual Polish

Add:

- neon effects
- drone animation
- particles
- transitions
- responsive layout
- polished typography

## Phase 8 — Optional LLM

Add the Flight Analyst only after the core Jev experience works.

## Phase 9 — Verification

Run:

```bash
npm run lint
npm run build
```

Fix all build/runtime errors.

---

# 44. Final Product Positioning

The application should communicate this concept:

> **JEV Flight Lab**
>
> A tiny autonomous flight simulator demonstrating bounded AI decision-making.
>
> The game engine controls the world.
> Jev controls the tactical decision.
> An optional LLM provides strategic analysis.

The project should feel like a **technical experiment disguised as a polished game**.

The priority order is:

1. Real Jev integration
2. Smooth gameplay
3. Clear decision visualization
4. Beautiful UI
5. Optional LLM
6. Everything else

If a feature threatens the one-day scope, remove the feature rather than compromising the core Jev demonstration.
