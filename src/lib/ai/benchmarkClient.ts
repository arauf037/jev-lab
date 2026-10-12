import { GAME_CONFIG } from "@/lib/game/constants";
import type { TacticalAction } from "@/lib/game/types";
import {
  buildBenchmarkReport,
  compareActions,
  type BenchmarkReport,
  type ProviderAttempt,
  type RecordedDecisionState,
} from "./benchmark";
import { providerDecisionRequest } from "./decisionPayload";

/** Demo cap so one replay cannot fan out into an unbounded API bill. */
export const BENCHMARK_STATE_LIMIT = 40;

export async function runReplayBenchmark(states: RecordedDecisionState[]): Promise<BenchmarkReport> {
  const slice = states.slice(0, BENCHMARK_STATE_LIMIT);
  const rows = [];
  for (const recorded of slice) {
    const [jev, openai] = await Promise.all([
      attemptProvider("/api/jev/decision", recorded.tacticalState),
      attemptProvider("/api/openai/decision", recorded.tacticalState),
    ]);
    rows.push({
      sequence: recorded.sequence,
      tacticalState: recorded.tacticalState,
      jev,
      openai,
      match: compareActions(jev.action, openai.action),
    });
  }
  return buildBenchmarkReport(states.length, rows);
}

async function attemptProvider(url: string, state: RecordedDecisionState["tacticalState"]): Promise<ProviderAttempt> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GAME_CONFIG.decisionTimeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(providerDecisionRequest(state)),
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => ({}))) as {
      action?: string;
      provider?: string;
      latencyMs?: number;
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
      estimatedCostUsd?: number;
      reportedCostUsd?: number;
      error?: string;
      demoMode?: boolean;
    };
    if (!response.ok) {
      return { timedOut: false, invalid: false, failed: true, error: data.error };
    }
    if (data.provider === "mock" || data.demoMode) {
      return { timedOut: false, invalid: false, failed: true, error: "Live provider was not configured" };
    }
    if (data.action !== "flap" && data.action !== "wait") {
      return { timedOut: false, invalid: true, failed: true };
    }
    const action = data.action as TacticalAction;
    return {
      action,
      latencyMs: typeof data.latencyMs === "number" ? data.latencyMs : undefined,
      inputTokens: finite(data.inputTokens),
      outputTokens: finite(data.outputTokens),
      totalTokens: finite(data.totalTokens),
      estimatedCostUsd: finite(data.estimatedCostUsd),
      reportedCostUsd: finite(data.reportedCostUsd),
      timedOut: false,
      invalid: false,
      failed: false,
    };
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "AbortError" || /abort/i.test(error.message));
    return { timedOut, invalid: false, failed: true };
  } finally {
    clearTimeout(timeout);
  }
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
