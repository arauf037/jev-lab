import type { TacticalState } from "@/lib/game/types";
import type {
  TacticalDecision,
  TacticalDecisionProvider,
} from "./decisionProvider";

/**
 * Deterministic heuristic autopilot used when Jev is unavailable
 * or as an explicit DEMO MODE provider.
 */
export class MockDecisionProvider implements TacticalDecisionProvider {
  async decide(state: TacticalState): Promise<TacticalDecision> {
    const started = performance.now();

    // Simulate a tiny async latency so the UI path matches real provider flow.
    await new Promise((resolve) => setTimeout(resolve, 8 + Math.random() * 20));

    const shouldFlap = computeShouldFlap(state);
    const flapProb = shouldFlap ? 0.72 + Math.min(0.2, Math.abs(state.relativeGapOffset) / 400) : 0.28;
    const waitProb = 1 - flapProb;

    return {
      action: shouldFlap ? "flap" : "wait",
      probabilities: {
        flap: round3(flapProb),
        wait: round3(waitProb),
      },
      confidence: round3(Math.max(flapProb, waitProb)),
      latencyMs: Math.round(performance.now() - started),
      provider: "mock",
      timestamp: Date.now(),
    };
  }
}

export function computeShouldFlap(state: TacticalState): boolean {
  if (!state.droneAlive) return false;

  const descendingHard = state.verticalVelocity > 3.2;
  const belowGap = state.relativeGapOffset > 18;
  const nearGate = state.nextGateDistance < 220;
  const veryLow = state.altitude < 90;
  const risingTooMuch = state.verticalVelocity < -4.5 && state.relativeGapOffset < -25;

  if (veryLow) return true;
  if (risingTooMuch) return false;
  if (nearGate && belowGap) return true;
  if (descendingHard && belowGap) return true;
  if (state.relativeGapOffset > 40) return true;
  return false;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
