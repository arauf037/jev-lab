import { GAME_CONFIG } from "./constants";
import { clamp } from "./physics";
import type { GameState, TacticalState } from "./types";

export function createTacticalState(
  gameState: GameState,
  now: number
): TacticalState {
  const upcoming = gameState.gates.filter(
    (gate) => gate.x + gate.width > gameState.drone.x
  );
  const nextGate = upcoming[0];
  const followingGate = upcoming[1];
  const altitude = gameState.canvasHeight - gameState.drone.y;
  const gapCenterY = nextGate?.gapCenterY ?? gameState.canvasHeight / 2;
  const gapSize = nextGate?.gapSize ?? 180;
  const nextGateDistance = nextGate
    ? nextGate.x - gameState.drone.x
    : GAME_FALLBACK_DISTANCE;
  const recentWindowMs = 2000;
  const recentFlaps = gameState.recentFlapTimes.filter(
    (t) => now - t <= recentWindowMs
  ).length;

  return enrichPrediction({
    altitude: round2(altitude),
    verticalVelocity: round2(gameState.drone.velocityY),
    nextGateDistance: round2(nextGateDistance),
    gapCenterY: round2(gapCenterY),
    gapSize: round2(gapSize),
    relativeGapOffset: round2(gameState.drone.y - gapCenterY),
    horizontalVelocity: round2(gameState.worldSpeed),
    recentFlaps,
    timeSinceLastFlapMs:
      gameState.lastFlapAt == null ? 9999 : Math.max(0, now - gameState.lastFlapAt),
    droneAlive: gameState.drone.alive,
    followingGapCenterY: followingGate?.gapCenterY,
    followingGateDistance: followingGate
      ? round2(followingGate.x - gameState.drone.x)
      : undefined,
    followingGapSize: followingGate?.gapSize,
  });
}

const GAME_FALLBACK_DISTANCE = 400;

/**
 * Ballistic pose at the moment a decision will be applied.
 * Assumes no flap until then, matching the in-flight wait.
 */
export function projectTacticalState(
  state: TacticalState,
  leadMs: number
): TacticalState {
  const frames = Math.max(0, Math.round((leadMs / 1000) * 60));
  let velocity = state.verticalVelocity;
  let deltaY = 0;
  for (let i = 0; i < frames; i += 1) {
    velocity = clamp(
      velocity + GAME_CONFIG.gravity,
      -GAME_CONFIG.maxUpwardSpeed,
      GAME_CONFIG.maxVelocityY
    );
    deltaY += velocity;
  }

  // Stay on the opening still in front of the drone. Switching early makes a
  // falling drone look high above the next hole, so Jev waits through this one.
  const nextGateDistance = Math.max(
    0,
    state.nextGateDistance - state.horizontalVelocity * frames
  );

  return enrichPrediction({
    ...state,
    altitude: round2(state.altitude - deltaY),
    verticalVelocity: round2(velocity),
    relativeGapOffset: round2(state.relativeGapOffset + deltaY),
    nextGateDistance: round2(nextGateDistance),
  });
}

/** Deterministic look-ahead. Jev decides; the engine does the physics. */
export function enrichPrediction(state: TacticalState): TacticalState {
  const vx = Math.max(state.horizontalVelocity, 0.05);
  const timeToGateMs = (state.nextGateDistance / vx) * (1000 / 60);
  const frames = Math.min(180, Math.max(0, Math.round((timeToGateMs / 1000) * 60)));
  let velocity = state.verticalVelocity;
  let deltaY = 0;
  for (let i = 0; i < frames; i += 1) {
    velocity = clamp(
      velocity + GAME_CONFIG.gravity,
      -GAME_CONFIG.maxUpwardSpeed,
      GAME_CONFIG.maxVelocityY
    );
    deltaY += velocity;
  }

  return {
    ...state,
    timeToGateMs: round2(timeToGateMs),
    predictedOffsetAtGate: round2(state.relativeGapOffset + deltaY),
    gapMargin: round2(state.gapSize / 2 - Math.abs(state.relativeGapOffset)),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
