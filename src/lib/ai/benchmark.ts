import type { DecisionProviderName, StaleReason, TacticalAction, TacticalState } from "@/lib/game/types";

export interface RecordedDecisionState {
  sequence: number;
  timestamp: number;
  tacticalState: TacticalState;
}

export interface FlightSample {
  provider: DecisionProviderName;
  action: TacticalAction;
  latencyMs: number;
  decisionAgeMs: number;
  stale: boolean;
  staleReason?: StaleReason;
  fallback: boolean;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  reportedCostUsd?: number;
}

export interface LatencyStats {
  count: number;
  average: number;
  median: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
}

export type CostStatus = "estimated" | "reported" | "unavailable";

export interface CostSummary {
  status: CostStatus;
  decisionsWithCost: number;
  totalUsd?: number;
  perDecisionUsd?: number;
  per100Usd?: number;
}

export interface FlightSummary {
  provider: "jev" | "openai";
  score: number;
  survivalMs: number;
  decisions: number;
  averageLatencyMs?: number;
  p95LatencyMs?: number;
  maxLatencyMs?: number;
  stale: number;
  staleReasons: Partial<Record<StaleReason, number>>;
  fallback: number;
  averageDecisionAgeMs?: number;
  maxDecisionAgeMs?: number;
  costStatus: CostStatus;
  totalCostUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  tokensFrom: number;
  mixedProviders: boolean;
}

export interface ProviderAttempt {
  action?: TacticalAction;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  reportedCostUsd?: number;
  timedOut: boolean;
  invalid: boolean;
  failed: boolean;
  error?: string;
}

export interface BenchmarkRow {
  sequence: number;
  tacticalState: TacticalState;
  jev: ProviderAttempt;
  openai: ProviderAttempt;
  match: "agreement" | "different" | "incomplete";
}

export interface BenchmarkReport {
  recordedCount: number;
  evaluatedCount: number;
  rows: BenchmarkRow[];
  agreementRate?: number;
  disagreementRate?: number;
  compared: number;
  jev: ProviderBenchmarkStats;
  openai: ProviderBenchmarkStats;
}

export interface ProviderBenchmarkStats {
  latency: LatencyStats | null;
  flapRate?: number;
  waitRate?: number;
  successful: number;
  failed: number;
  timeouts: number;
  invalid: number;
  cost: CostSummary;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))] ?? 0;
}

export function latencyStats(values: number[]): LatencyStats | null {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return null;
  const sorted = [...finite].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count: sorted.length,
    average: total / sorted.length,
    median: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  };
}

export function compareActions(
  jev: TacticalAction | undefined,
  openai: TacticalAction | undefined
): BenchmarkRow["match"] {
  if (jev == null || openai == null) return "incomplete";
  return jev === openai ? "agreement" : "different";
}

export function agreementRates(rows: Array<Pick<BenchmarkRow, "match">>): {
  compared: number;
  agreementRate?: number;
  disagreementRate?: number;
} {
  const comparedRows = rows.filter((row) => row.match !== "incomplete");
  if (comparedRows.length === 0) return { compared: 0 };
  const agreements = comparedRows.filter((row) => row.match === "agreement").length;
  const agreementRate = agreements / comparedRows.length;
  return {
    compared: comparedRows.length,
    agreementRate,
    disagreementRate: 1 - agreementRate,
  };
}

export function actionDistribution(actions: TacticalAction[]): { flapRate?: number; waitRate?: number } {
  if (actions.length === 0) return {};
  const flaps = actions.filter((action) => action === "flap").length;
  const flapRate = flaps / actions.length;
  return { flapRate, waitRate: 1 - flapRate };
}

export function summarizeCost(
  rows: Array<{ estimatedCostUsd?: number; reportedCostUsd?: number }>
): CostSummary {
  const estimated = rows
    .map((row) => row.estimatedCostUsd)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const reported = rows
    .map((row) => row.reportedCostUsd)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const values = estimated.length > 0 ? estimated : reported;
  if (values.length === 0) return { status: "unavailable", decisionsWithCost: 0 };
  const totalUsd = values.reduce((sum, value) => sum + value, 0);
  const perDecisionUsd = totalUsd / values.length;
  return {
    status: estimated.length > 0 ? "estimated" : "reported",
    decisionsWithCost: values.length,
    totalUsd,
    perDecisionUsd,
    per100Usd: perDecisionUsd * 100,
  };
}

function sumPresent(values: Array<number | undefined>): { total?: number; count: number } {
  const present = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (present.length === 0) return { count: 0 };
  return { total: present.reduce((sum, value) => sum + value, 0), count: present.length };
}

function countStaleReasons(samples: FlightSample[]): Partial<Record<StaleReason, number>> {
  const counts: Partial<Record<StaleReason, number>> = {};
  for (const sample of samples) {
    if (!sample.stale || !sample.staleReason) continue;
    counts[sample.staleReason] = (counts[sample.staleReason] ?? 0) + 1;
  }
  return counts;
}

export function summarizeFlight(input: {
  provider: "jev" | "openai";
  score: number;
  survivalMs: number;
  samples: FlightSample[];
}): FlightSummary {
  const latency = latencyStats(input.samples.map((sample) => sample.latencyMs));
  const ages = latencyStats(input.samples.map((sample) => sample.decisionAgeMs));
  const cost = summarizeCost(input.samples);
  const inputTokens = sumPresent(input.samples.map((sample) => sample.inputTokens));
  const outputTokens = sumPresent(input.samples.map((sample) => sample.outputTokens));
  const totalTokens = sumPresent(input.samples.map((sample) => sample.totalTokens));
  const liveProviders = new Set(
    input.samples
      .map((sample) => sample.provider)
      .filter((provider) => provider === "jev" || provider === "openai")
  );
  return {
    provider: input.provider,
    score: input.score,
    survivalMs: input.survivalMs,
    decisions: input.samples.length,
    averageLatencyMs: latency?.average,
    p95LatencyMs: latency?.p95,
    maxLatencyMs: latency?.max,
    stale: input.samples.filter((sample) => sample.stale).length,
    staleReasons: countStaleReasons(input.samples),
    fallback: input.samples.filter((sample) => sample.fallback).length,
    averageDecisionAgeMs: ages?.average,
    maxDecisionAgeMs: ages?.max,
    costStatus: cost.status,
    totalCostUsd: cost.totalUsd,
    inputTokens: inputTokens.total,
    outputTokens: outputTokens.total,
    totalTokens: totalTokens.total,
    tokensFrom: totalTokens.count,
    mixedProviders: liveProviders.size > 1,
  };
}

export function providerStats(attempts: ProviderAttempt[]): ProviderBenchmarkStats {
  const successful = attempts.filter((attempt) => attempt.action != null && !attempt.failed && !attempt.invalid && !attempt.timedOut);
  const latency = latencyStats(
    successful.map((attempt) => attempt.latencyMs).filter((value): value is number => typeof value === "number")
  );
  const distribution = actionDistribution(
    successful.map((attempt) => attempt.action).filter((action): action is TacticalAction => action != null)
  );
  const tokens = {
    inputTokens: sumPresent(attempts.map((attempt) => attempt.inputTokens)).total,
    outputTokens: sumPresent(attempts.map((attempt) => attempt.outputTokens)).total,
    totalTokens: sumPresent(attempts.map((attempt) => attempt.totalTokens)).total,
  };
  return {
    latency,
    ...distribution,
    successful: successful.length,
    failed: attempts.filter((attempt) => attempt.failed && !attempt.timedOut && !attempt.invalid).length,
    timeouts: attempts.filter((attempt) => attempt.timedOut).length,
    invalid: attempts.filter((attempt) => attempt.invalid).length,
    cost: summarizeCost(attempts),
    ...tokens,
  };
}

export function buildBenchmarkReport(recordedCount: number, rows: BenchmarkRow[]): BenchmarkReport {
  const rates = agreementRates(rows);
  return {
    recordedCount,
    evaluatedCount: rows.length,
    rows,
    agreementRate: rates.agreementRate,
    disagreementRate: rates.disagreementRate,
    compared: rates.compared,
    jev: providerStats(rows.map((row) => row.jev)),
    openai: providerStats(rows.map((row) => row.openai)),
  };
}
