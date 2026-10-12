export type GameMode = "autopilot" | "manual" | "lab" | "compare";

export type DecisionProviderName = "jev" | "openai" | "mock" | "fallback" | "local" | "laya";

/** Why a returned action was thrown away and did not move the drone. */
export type StaleReason =
  | "too_old"
  | "above_opening"
  | "second_flap"
  | "previous_flight"
  | "replaced";

export type GameStatus = "idle" | "running" | "paused" | "game_over";

export type TacticalAction = "flap" | "wait";

export type GameAction =
  | { type: "FLAP" }
  | { type: "WAIT" }
  | { type: "RESET" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "SET_MODE"; mode: GameMode }
  | { type: "START" };

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

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export interface Star {
  x: number;
  y: number;
  depth: number;
  size: number;
  twinkle: number;
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
  canvasWidth: number;
  canvasHeight: number;
  flapCount: number;
  recentFlapTimes: number[];
  shakeMs: number;
}

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
  /** Milliseconds until the drone reaches the next gate at the current horizontal speed. */
  timeToGateMs?: number;
  /** Ballistic gap offset at the gate if no flap is applied. Positive means below center. */
  predictedOffsetAtGate?: number;
  /** Signed room inside the opening. Positive means the drone is inside the gap. */
  gapMargin?: number;
  /** Next opening after the current gate. Used only to aim a decision that will land after this gate is passed. */
  followingGapCenterY?: number;
  followingGateDistance?: number;
  followingGapSize?: number;
}

export type DecisionOutcome =
  | "pending"
  | "survived"
  | "crashed"
  | "scored"
  | "ignored_manual"
  | "lab_only"
  | "stale"
  | "fallback";

export interface DecisionTrace {
  decisionRequestedAt: number;
  gameStateCapturedAt: number;
  jevRequestSentAt: number;
  jevResponseReceivedAt: number;
  decisionAppliedAt: number | null;
  requestLatencyMs: number;
  decisionAgeMs: number;
  timeSincePreviousDecisionMs: number | null;
  droneYAtRequest: number;
  droneVelocityAtRequest: number;
  droneYAtApply: number | null;
  droneVelocityAtApply: number | null;
  nextGateDistanceAtRequest: number;
  nextGateDistanceAtApply: number | null;
  stale: boolean;
  fallback: boolean;
  sessionId: number;
}

export interface DecisionRecord {
  id: string;
  decisionId: string;
  requestId: number;
  action: TacticalAction;
  probabilities?: {
    flap: number;
    wait: number;
  };
  confidence?: number;
  latencyMs: number;
  provider: DecisionProviderName;
  timestamp: number;
  tacticalState: TacticalState;
  outcome: DecisionOutcome;
  isFallback?: boolean;
  sessionId: number;
  trace: DecisionTrace;
  model?: string;
  requestStartedAt: number;
  responseReceivedAt: number;
  appliedAt?: number;
  stateCapturedAt: number;
  decisionAgeMs: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  /** Computed from published token prices. Never invented. */
  estimatedCostUsd?: number;
  /** Copied from provider billing data when the API returns it. */
  reportedCostUsd?: number;
  stale: boolean;
  staleReason?: StaleReason;
  fallback: boolean;
}
