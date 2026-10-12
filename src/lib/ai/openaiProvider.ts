import type { TacticalState } from "@/lib/game/types";
import { GAME_CONFIG } from "@/lib/game/constants";
import type { TacticalDecision, TacticalDecisionProvider } from "./decisionProvider";
import { tacticalStateForProvider } from "./decisionPayload";

/**
 * Browser-side provider. The OpenAI key stays on the server route.
 * Lead projection matches JevDecisionProvider so both live pilots see the same transform.
 */
export class OpenAIDecisionProvider implements TacticalDecisionProvider {
  private leadMs = 400;

  async decide(state: TacticalState): Promise<TacticalDecision> {
    const started = performance.now();
    const projected = tacticalStateForProvider(state, this.leadMs);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GAME_CONFIG.decisionTimeoutMs);

    try {
      const response = await fetch("/api/openai/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: projected }),
        signal: controller.signal,
      });
      const latencyMs = Math.round(performance.now() - started);
      const data = (await response.json().catch(() => ({}))) as Partial<TacticalDecision> & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : `OpenAI HTTP ${response.status}`);
      }
      if (data.action !== "flap" && data.action !== "wait") {
        throw new Error("Invalid OpenAI action");
      }
      if (data.provider !== "openai") {
        throw new Error("Invalid OpenAI action");
      }

      const latency = typeof data.latencyMs === "number" ? data.latencyMs : latencyMs;
      this.leadMs = Math.min(GAME_CONFIG.maxDecisionAgeMs, Math.max(GAME_CONFIG.remoteLeadFloorMs, Math.round(latency)));

      return {
        action: data.action,
        latencyMs: latency,
        provider: "openai",
        timestamp: Date.now(),
        model: data.model,
        inputTokens: finite(data.inputTokens),
        outputTokens: finite(data.outputTokens),
        totalTokens: finite(data.totalTokens),
        estimatedCostUsd: finite(data.estimatedCostUsd),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
