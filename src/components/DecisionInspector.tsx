"use client";

import type { DecisionRecord } from "@/lib/game/types";
import { formatAction, formatMs, formatPercent } from "@/lib/utils/formatters";

interface DecisionInspectorProps {
  decision: DecisionRecord | null;
}

export function DecisionInspector({ decision }: DecisionInspectorProps) {
  if (!decision) {
    return (
      <section className="panel-card">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">
          Decision Inspector
        </h2>
        <p className="text-sm text-slate-500">Select a decision to inspect tactical state.</p>
      </section>
    );
  }

  const state = decision.tacticalState;

  return (
    <section className="panel-card">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">
        Decision Inspector
      </h2>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <Badge label="Action" value={formatAction(decision.action)} />
        <Badge label="Confidence" value={formatPercent(decision.confidence)} />
        <Badge label="Latency" value={formatMs(decision.latencyMs)} />
        <Badge label="Provider" value={decision.provider} />
        <Badge label="Outcome" value={decision.outcome} />
      </div>
      <pre className="overflow-x-auto rounded-xl bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-cyan-100/90">
{JSON.stringify(
  {
    action: decision.action,
    probabilities: decision.probabilities ?? "N/A",
    confidence: decision.confidence ?? "N/A",
    latencyMs: decision.latencyMs,
    provider: decision.provider,
    timestamp: new Date(decision.timestamp).toISOString(),
    outcome: decision.outcome,
    tacticalState: state,
  },
  null,
  2
)}
      </pre>
    </section>
  );
}

function Badge({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300">
      <span className="text-slate-500">{label}: </span>
      {value}
    </span>
  );
}
