import type { TacticalState } from "@/lib/game/types";
import { GAME_CONFIG } from "@/lib/game/constants";
import type { TacticalDecision, TacticalDecisionProvider } from "./decisionProvider";
import { tacticalStateForProvider } from "./decisionPayload";

/**
 * Browser-side provider. The Laya sidecar stays reachable only from the server route.
 *
 * Lead projection tracks the *client* round-trip so the pose Laya sees matches the
 * pose when the answer is applied. Remote pilots keep a 200ms floor; local GPU
 * RTTs are tens of ms, so the floor is much lower.
 */
export class LayaDecisionProvider implements TacticalDecisionProvider {
  private leadMs = GAME_CONFIG.localLeadInitialMs;

  async decide(state: TacticalState): Promise<TacticalDecision> {
    const started = performance.now();
    const projected = tacticalStateForProvider(state, this.leadMs);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GAME_CONFIG.decisionTimeoutMs);

    try {
      const response = await fetch("/api/laya/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: projected }),
        signal: controller.signal,
      });
      const clientLatencyMs = Math.round(performance.now() - started);
      const data = (await response.json().catch(() => ({}))) as Partial<TacticalDecision> & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : `Laya HTTP ${response.status}`);
      }
      if (data.action !== "flap" && data.action !== "wait") {
        throw new Error("Invalid Laya action");
      }
      if (data.provider !== "laya") {
        throw new Error("Invalid Laya action");
      }

      // Lead must track time until apply (browser → Next → sidecar → back), not
      // server-only inference time. Floor stays near one frame budget, not 200ms.
      this.leadMs = Math.min(
        GAME_CONFIG.maxDecisionAgeMs,
        Math.max(GAME_CONFIG.localLeadFloorMs, clientLatencyMs)
      );

      return {
        action: data.action,
        probabilities:
          data.probabilities &&
          typeof data.probabilities.flap === "number" &&
          typeof data.probabilities.wait === "number"
            ? { flap: data.probabilities.flap, wait: data.probabilities.wait }
            : undefined,
        confidence: finite(data.confidence),
        latencyMs: clientLatencyMs,
        provider: "laya",
        timestamp: Date.now(),
        model: data.model,
        inputTokens: finite(data.inputTokens),
        outputTokens: finite(data.outputTokens),
        totalTokens: finite(data.totalTokens),
        reportedCostUsd: finite(data.reportedCostUsd),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
