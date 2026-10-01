import { GAME_CONFIG } from "@/lib/game/constants";
import type { TacticalState } from "@/lib/game/types";

export function timeToGateMs(state: TacticalState): number {
  if (typeof state.timeToGateMs === "number") return state.timeToGateMs;
  const vx = Math.max(state.horizontalVelocity, 0.05);
  return (state.nextGateDistance / vx) * (1000 / 60);
}

/**
 * Far from a gate, poll slowly. Close, fast, or near the lip, poll sooner.
 * One in-flight request still caps the real rate at the network round trip.
 */
export function decisionIntervalFor(state: TacticalState): number {
  const arrival = timeToGateMs(state);
  const lip = state.gapSize / 2;
  const nearEdge = Math.abs(state.relativeGapOffset) > lip * 0.55;
  const fast = Math.abs(state.verticalVelocity) > 2.2;
  const closing = arrival < 650;
  if (nearEdge || fast || closing) return GAME_CONFIG.urgentDecisionIntervalMs;
  if (arrival > 1500) return GAME_CONFIG.calmDecisionIntervalMs;
  return GAME_CONFIG.decisionIntervalMs;
}

export function decisionAgeMs(requestedAt: number, appliedAt: number): number {
  return appliedAt - requestedAt;
}

export function droneY(state: TacticalState): number {
  return state.gapCenterY + state.relativeGapOffset;
}

/**
 * A FLAP is a single upward impulse. Apply it only while the drone still
 * needs to go up. A late flap above the opening climbs into the pipe.
 */
export function isFlapStillRelevant(state: TacticalState): boolean {
  if (!state.droneAlive) return false;
  const half = state.gapSize / 2;
  if (state.relativeGapOffset < -half * 0.7) return false;
  if (state.altitude < 80) return true;
  if (state.relativeGapOffset > 8) return true;
  const predicted = state.predictedOffsetAtGate ?? state.relativeGapOffset;
  return predicted > half * 0.75;
}
