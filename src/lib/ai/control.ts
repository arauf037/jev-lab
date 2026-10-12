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

/**
 * Local GPU pilots return faster than remote ones. Keep a calmer default
 * cadence (~180ms), but near a gate / fast fall allow ~90ms so a late
 * correction can still land before the pipe.
 */
export function decisionIntervalForProvider(
  state: TacticalState,
  providerLabel: "jev" | "openai" | "mock" | "laya",
  recentLatencyMs = 0
): number {
  const base = decisionIntervalFor(state);
  if (providerLabel !== "laya") return base;
  const latencyFloor = recentLatencyMs > 0 ? Math.round(recentLatencyMs * 1.25) : 0;
  if (base === GAME_CONFIG.urgentDecisionIntervalMs) {
    return Math.max(base, GAME_CONFIG.localPilotUrgentIntervalMs, Math.min(latencyFloor, 120));
  }
  return Math.max(base, GAME_CONFIG.localPilotIntervalMs, latencyFloor);
}

export function decisionAgeMs(requestedAt: number, appliedAt: number): number {
  return appliedAt - requestedAt;
}

export function droneY(state: TacticalState): number {
  return state.gapCenterY + state.relativeGapOffset;
}

/**
 * A FLAP is a single upward impulse. Apply it only while the drone still
 * needs lift. Soft "any flap while not rising" gating let Laya's noisy FLAPs
 * spam into the first pipe; keep the guard strict, with one exception for the
 * lead-projection apply window (requested below, live only mildly above).
 */
export function isFlapStillRelevant(
  live: TacticalState,
  requested?: TacticalState
): boolean {
  if (!live.droneAlive) return false;
  const half = live.gapSize / 2;
  // Past the leading edge while still overlapping the pipe: a flap hits the top lip.
  if (live.nextGateDistance < 0 && live.altitude >= 80) return false;
  // Far above the opening: never climb into the top pipe.
  if (live.relativeGapOffset < -half * 0.7) return false;
  if (live.altitude < 80) return true;
  // Actively rising: never stack another climb.
  if (live.verticalVelocity < -0.5) return false;

  // Above center: discard unless this flap was requested while clearly below
  // and live has only mildly crossed center (lead apply window).
  if (live.relativeGapOffset < -8) {
    return Boolean(
      requested &&
        requested.relativeGapOffset > 8 &&
        live.relativeGapOffset > -half * 0.35
    );
  }

  // Clearly below: keep.
  if (live.relativeGapOffset > 8) return true;

  // On / near center: do not trust long-horizon prediction alone (it stays
  // huge far from the gate and was applying FLAPs at spawn). Only keep a flap
  // that was requested while still below.
  return Boolean(requested && requested.relativeGapOffset > 8);
}
