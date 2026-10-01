import type { TacticalAction, TacticalState } from "@/lib/game/types";

export interface TacticalDecision {
  action: TacticalAction;
  probabilities?: {
    flap: number;
    wait: number;
  };
  confidence?: number;
  latencyMs: number;
  provider: "jev" | "mock" | "fallback" | "local";
  timestamp: number;
  isFallback?: boolean;
}

export interface TacticalDecisionProvider {
  decide(state: TacticalState): Promise<TacticalDecision>;
}

export function isValidTacticalState(value: unknown): value is TacticalState {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.altitude === "number" &&
    typeof s.verticalVelocity === "number" &&
    typeof s.nextGateDistance === "number" &&
    typeof s.gapCenterY === "number" &&
    typeof s.gapSize === "number" &&
    typeof s.relativeGapOffset === "number" &&
    typeof s.horizontalVelocity === "number" &&
    typeof s.recentFlaps === "number" &&
    typeof s.timeSinceLastFlapMs === "number" &&
    typeof s.droneAlive === "boolean"
  );
}
