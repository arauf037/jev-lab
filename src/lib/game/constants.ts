export const GAME_CONFIG = {
  // About four Jev decisions per gate. One decision cycle moves the drone
  // by a fraction of the opening, so a late answer is still the same gate.
  gravity: 0.04,
  flapImpulse: -2.4,
  initialVelocityX: 2.6,
  gateWidth: 72,
  initialGapSize: 180,
  minGapSize: 120,
  gateSpacing: 280,
  maxVelocityY: 6,
  maxUpwardSpeed: 6,
  droneWidth: 44,
  droneHeight: 28,
  droneStartXRatio: 0.22,
  decisionIntervalMs: 70,
  /** Near a gate, a fast fall, or the edge of the opening. */
  urgentDecisionIntervalMs: 40,
  /** Far from the next gate. Still shorter than a typical Jev reply, so the next call starts as soon as the last one lands. */
  calmDecisionIntervalMs: 100,
  maxDecisionHistory: 20,
  canvasPadding: 24,
  defaultCanvasWidth: 900,
  defaultCanvasHeight: 560,
  maxParticles: 80,
  starCount: 48,
  /** A hung request must not block the next correction for most of a gate. */
  decisionTimeoutMs: 1000,
  /** Drop a response that no longer describes the drone in front of this gate. */
  maxDecisionAgeMs: 1000,
  /** Suppress a second flap impulse on top of one that just landed. */
  fallbackQuietMs: 280,
  analystIntervalMs: 10000,
} as const;

export const BEST_SCORE_KEY = "jev-flight-lab-best-score";
