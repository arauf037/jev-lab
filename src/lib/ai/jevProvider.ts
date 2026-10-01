import type { TacticalState } from "@/lib/game/types";
import { projectTacticalState } from "@/lib/game/tactical";
import type {
  TacticalDecision,
  TacticalDecisionProvider,
} from "./decisionProvider";
import { GAME_CONFIG } from "@/lib/game/constants";
import { computeShouldFlap } from "./mockProvider";

/**
 * Browser-side provider that calls the Next.js server route.
 * The OpenRouter API key never leaves the server.
 */
export class JevDecisionProvider implements TacticalDecisionProvider {
  private leadMs = 400;

  async decide(state: TacticalState): Promise<TacticalDecision> {
    const started = performance.now();
    const projected = projectTacticalState(state, this.leadMs);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      GAME_CONFIG.decisionTimeoutMs
    );

    try {
      const response = await fetch("/api/jev/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: {
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
          },
        }),
        signal: controller.signal,
      });

      const latencyMs = Math.round(performance.now() - started);

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          typeof body.error === "string" ? body.error : `Jev HTTP ${response.status}`
        );
      }

      const data = (await response.json()) as Partial<TacticalDecision> & {
        action?: string;
        demoMode?: boolean;
      };

      if (data.action !== "flap" && data.action !== "wait") {
        throw new Error("Invalid Jev action");
      }

      // Never relabel mock/fallback server responses as live Jev.
      const provider: TacticalDecision["provider"] =
        data.provider === "mock" || data.demoMode
          ? "mock"
          : data.provider === "fallback" || data.isFallback
            ? "fallback"
            : "jev";

      const latency = typeof data.latencyMs === "number" ? data.latencyMs : latencyMs;
      this.leadMs = Math.min(
        GAME_CONFIG.maxDecisionAgeMs,
        Math.max(200, Math.round(latency))
      );

      return {
        action: data.action,
        probabilities: data.probabilities,
        confidence: data.confidence,
        latencyMs: latency,
        provider,
        timestamp: Date.now(),
        isFallback: Boolean(data.isFallback) || provider === "fallback",
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createFallbackDecision(state: TacticalState): TacticalDecision {
  const action = computeShouldFlap(state) ? "flap" : "wait";
  // No fabricated probabilities/confidence — fallback is an explicit heuristic.
  return {
    action,
    latencyMs: 0,
    provider: "fallback",
    timestamp: Date.now(),
    isFallback: true,
  };
}
