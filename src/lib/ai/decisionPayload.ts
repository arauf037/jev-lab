import type { TacticalState } from "@/lib/game/types";
import { projectTacticalState } from "@/lib/game/tactical";

/**
 * The tactical fields both live providers send.
 * Replay benchmarks do not call this — they forward the recorded state unchanged.
 */
export function tacticalStateForProvider(state: TacticalState, leadMs: number): TacticalState {
  const projected = projectTacticalState(state, leadMs);
  return {
    altitude: projected.altitude,
    verticalVelocity: projected.verticalVelocity,
    nextGateDistance: projected.nextGateDistance,
    gapCenterY: projected.gapCenterY,
    gapSize: projected.gapSize,
    relativeGapOffset: projected.relativeGapOffset,
    horizontalVelocity: projected.horizontalVelocity,
    recentFlaps: projected.recentFlaps,
    timeSinceLastFlapMs: projected.timeSinceLastFlapMs,
    droneAlive: projected.droneAlive,
    timeToGateMs: projected.timeToGateMs,
    predictedOffsetAtGate: projected.predictedOffsetAtGate,
    gapMargin: projected.gapMargin,
  };
}

/** Body posted to both decision routes. The state object is not rewritten here. */
export function providerDecisionRequest(state: TacticalState): { state: TacticalState } {
  return { state };
}
