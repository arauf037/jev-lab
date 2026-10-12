"use client";

import type { BenchmarkReport, FlightSummary } from "@/lib/ai/benchmark";
import { explainStaleReason, formatMs, formatRate, formatSeconds, formatUsd } from "@/lib/utils/formatters";

interface BenchmarkPanelProps {
  flights: Partial<Record<"jev" | "openai", FlightSummary>>;
  recordedStates: number;
  report: BenchmarkReport | null;
  busy: boolean;
  error: string | null;
  onRun: () => void;
  canRun: boolean;
}

export function BenchmarkPanel({
  flights,
  recordedStates,
  report,
  busy,
  error,
  onRun,
  canRun,
}: BenchmarkPanelProps) {
  return (
    <section className="panel-card border-violet-300/20">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-200">
          Decision Provider Benchmark
        </h2>
        <button
          type="button"
          onClick={onRun}
          disabled={!canRun || busy || recordedStates === 0}
          className="rounded-xl border border-violet-300/40 bg-violet-400/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-violet-50 disabled:opacity-40"
        >
          {busy ? "Running" : "Run Benchmark"}
        </button>
      </header>
      <p className="mb-4 text-xs text-slate-400">
        Independent flights use one provider at a time. Replay sends the same recorded tactical states to both.
        {recordedStates > 0 ? ` ${recordedStates} states retained.` : " Fly an autopilot flight to record states."}
      </p>
      {error && <p className="mb-3 text-xs text-rose-200">{error}</p>}

      <h3 className="mb-2 text-[11px] uppercase tracking-[0.2em] text-slate-500">Flight Results</h3>
      <p className="mb-3 text-xs text-slate-500">
        Call time is how long Jev or GPT took to answer. Decision age is how old that pose was when the
        game judged it. A short call can still be discarded. Discarded answers did not move the drone.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="py-1 pr-3 font-medium" />
              <th className="py-1 pr-3 font-medium">JEV</th>
              <th className="py-1 font-medium">GPT</th>
            </tr>
          </thead>
          <tbody className="font-mono text-cyan-50">
            <FlightRow label="Score" jev={flights.jev ? String(flights.jev.score) : "—"} gpt={flights.openai ? String(flights.openai.score) : "—"} />
            <FlightRow label="Survival" jev={flights.jev ? formatSeconds(flights.jev.survivalMs) : "—"} gpt={flights.openai ? formatSeconds(flights.openai.survivalMs) : "—"} />
            <FlightRow label="Decisions" jev={num(flights.jev?.decisions)} gpt={num(flights.openai?.decisions)} />
            <FlightRow label="Avg call time" jev={ms(flights.jev?.averageLatencyMs)} gpt={ms(flights.openai?.averageLatencyMs)} />
            <FlightRow label="Slowest call" jev={ms(flights.jev?.maxLatencyMs)} gpt={ms(flights.openai?.maxLatencyMs)} />
            <FlightRow label="P95 call time" jev={ms(flights.jev?.p95LatencyMs)} gpt={ms(flights.openai?.p95LatencyMs)} />
            <FlightRow label="Avg decision age" jev={ms(flights.jev?.averageDecisionAgeMs)} gpt={ms(flights.openai?.averageDecisionAgeMs)} />
            <FlightRow label="Oldest decision" jev={ms(flights.jev?.maxDecisionAgeMs)} gpt={ms(flights.openai?.maxDecisionAgeMs)} />
            <FlightRow label="Discarded" jev={staleCell(flights.jev)} gpt={staleCell(flights.openai)} />
            <FlightRow label="Backup answers" jev={num(flights.jev?.fallback)} gpt={num(flights.openai?.fallback)} />
            <FlightRow label="Cost" jev={costCell(flights.jev)} gpt={costCell(flights.openai)} />
          </tbody>
        </table>
      </div>
      {(flights.jev?.mixedProviders || flights.openai?.mixedProviders) && (
        <p className="mt-2 text-xs text-amber-200/80">This flight changed providers before it ended.</p>
      )}

      {report && (
        <div className="mt-5">
          <div className="mb-3 grid gap-3 md:grid-cols-2">
            <ProviderCard name="JEV" stats={report.jev} />
            <ProviderCard name="GPT" stats={report.openai} />
          </div>
          <p className="mb-3 text-xs text-slate-400">
            Same recorded poses sent to both models, outside the live 1000ms cutoff. Agreement{" "}
            {formatRate(report.agreementRate)} · Disagreement {formatRate(report.disagreementRate)} ·{" "}
            {report.evaluatedCount} of {report.recordedCount} states. A mismatch is a different action, not a score.
          </p>
          <h3 className="mb-2 text-[11px] uppercase tracking-[0.2em] text-slate-500">Decision Timeline</h3>
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-1 pr-3 font-medium">#</th>
                  <th className="py-1 pr-3 font-medium">State</th>
                  <th className="py-1 pr-3 font-medium">JEV</th>
                  <th className="py-1 pr-3 font-medium">GPT</th>
                  <th className="py-1 font-medium">Match</th>
                </tr>
              </thead>
              <tbody className="font-mono text-slate-100">
                {report.rows.map((row) => (
                  <tr key={row.sequence} className="border-t border-white/5">
                    <td className="py-1.5 pr-3 text-slate-400">{row.sequence}</td>
                    <td className="py-1.5 pr-3 text-xs text-slate-400">
                      alt {Math.round(row.tacticalState.altitude)} · gate {Math.round(row.tacticalState.nextGateDistance)}
                    </td>
                    <td className="py-1.5 pr-3">{attemptLabel(row.jev)}</td>
                    <td className="py-1.5 pr-3">{attemptLabel(row.openai)}</td>
                    <td className="py-1.5">{row.match === "agreement" ? "✓" : row.match === "different" ? "≠" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function ProviderCard({
  name,
  stats,
}: {
  name: string;
  stats: BenchmarkReport["jev"];
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{name}</div>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <Metric label="Avg call time" value={stats.latency ? formatMs(stats.latency.average) : "—"} />
        <Metric label="Slowest call" value={stats.latency ? formatMs(stats.latency.max) : "—"} />
        <Metric label="P95 call time" value={stats.latency ? formatMs(stats.latency.p95) : "—"} />
        <Metric label="Decisions" value={String(stats.successful)} />
        <Metric label="FLAP / WAIT" value={`${formatRate(stats.flapRate)} / ${formatRate(stats.waitRate)}`} />
        <Metric label="Timeouts" value={String(stats.timeouts)} />
        <Metric label="Invalid" value={String(stats.invalid)} />
        <Metric label="Failed" value={String(stats.failed)} />
        <Metric label="Cost" value={costSummary(stats.cost)} />
      </dl>
      <p className="mt-2 text-[11px] text-slate-500">
        Tokens {tokenLine(stats.inputTokens, stats.outputTokens, stats.totalTokens)}
        {stats.cost.status === "estimated"
          ? ` · per decision ${formatUsd(stats.cost.perDecisionUsd)} · per 100 ${formatUsd(stats.cost.per100Usd)}`
          : ""}
      </p>
    </div>
  );
}

function FlightRow({ label, jev, gpt }: { label: string; jev: string; gpt: string }) {
  return (
    <tr className="border-t border-white/5">
      <td className="py-1.5 pr-3 font-sans text-xs uppercase tracking-wider text-slate-500">{label}</td>
      <td className="py-1.5 pr-3">{jev}</td>
      <td className="py-1.5">{gpt}</td>
    </tr>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-mono text-cyan-50">{value}</div>
    </div>
  );
}

function attemptLabel(attempt: BenchmarkReport["rows"][number]["jev"]): string {
  if (attempt.timedOut) return "timeout";
  if (attempt.invalid) return "invalid";
  if (attempt.failed || !attempt.action) return "failed";
  const latency = attempt.latencyMs != null ? ` ${formatMs(attempt.latencyMs)}` : "";
  return `${attempt.action.toUpperCase()}${latency}`;
}

function staleCell(summary: FlightSummary | undefined): string {
  if (!summary) return "—";
  const reasons = Object.entries(summary.staleReasons)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0)
    .map(([reason, count]) => `${count} ${explainStaleReason(reason)}`);
  if (reasons.length === 0) return String(summary.stale);
  return `${summary.stale} · ${reasons.join(", ")}`;
}

function costCell(summary: FlightSummary | undefined): string {
  if (!summary) return "—";
  if (summary.costStatus === "unavailable" || summary.totalCostUsd == null) return "unavailable";
  const kind = summary.costStatus === "estimated" ? "est. " : "reported ";
  return `${kind}${formatUsd(summary.totalCostUsd)}`;
}

function costSummary(cost: BenchmarkReport["jev"]["cost"]): string {
  if (cost.status === "unavailable" || cost.totalUsd == null) return "unavailable";
  const kind = cost.status === "estimated" ? "est. " : "reported ";
  return `${kind}${formatUsd(cost.totalUsd)}`;
}

function tokenLine(input?: number, output?: number, total?: number): string {
  if (input == null && output == null && total == null) return "unavailable";
  return `${input ?? "—"} in / ${output ?? "—"} out / ${total ?? "—"} total`;
}

function num(value: number | undefined): string {
  return value == null ? "—" : String(value);
}

function ms(value: number | undefined): string {
  return value == null ? "—" : formatMs(value);
}
