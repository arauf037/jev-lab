"use client";

import type { ControlPhase } from "@/lib/ai/decisionManager";
import { decisionIntervalFor } from "@/lib/ai/control";
import type { DecisionRecord, TacticalState } from "@/lib/game/types";
import { formatAction, formatMs, formatPercent } from "@/lib/utils/formatters";

interface JevDecisionPanelProps {
  decision: DecisionRecord | null;
  lastEvent: DecisionRecord | null;
  humanAction?: "flap" | "wait" | null;
  mode: string;
  inFlight: boolean;
  phase: ControlPhase;
  control: "jev" | "mock" | "fallback" | "local";
  fallbackActive: boolean;
  tactical: TacticalState | null;
}

export function JevDecisionPanel({
  decision,
  lastEvent,
  humanAction,
  mode,
  inFlight,
  phase,
  control,
  fallbackActive,
  tactical,
}: JevDecisionPanelProps) {
  const flap = decision?.probabilities?.flap;
  const wait = decision?.probabilities?.wait;
  const agreement =
    mode === "manual" && humanAction && decision
      ? humanAction === decision.action
        ? "agreement"
        : "different"
      : null;

  return (
    <section className="panel-card">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
          {mode === "manual" ? "Jev Would Choose" : "Jev Decision"}
        </h2>
        <span className="text-[11px] uppercase tracking-wider text-slate-400">
          {fallbackActive ? "offline" : inFlight ? "thinking" : "ready"}
        </span>
      </header>

      {fallbackActive && (
        <p className="mb-3 text-xs font-semibold tracking-[0.14em] text-rose-200">
          {control === "local"
            ? "JEV TIMEOUT · LOCAL MODEL ACTIVE"
            : "JEV OFFLINE · FALLBACK CONTROLLER ACTIVE"}
        </p>
      )}

      <div className="mb-1 text-[11px] uppercase tracking-wider text-slate-500">
        Last decision
      </div>
      <div className="mb-4 font-mono text-3xl font-bold text-white">
        {decision ? formatAction(decision.action) : "—"}
      </div>
      <p className="mb-4 text-xs uppercase tracking-[0.16em] text-slate-400">
        {phaseLabel(phase, lastEvent)}
      </p>

      <ProbBar label="FLAP" value={flap} accent="cyan" />
      <ProbBar label="WAIT" value={wait} accent="violet" />

      {mode === "manual" && (
        <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-400/5 px-3 py-2 text-sm">
          <div className="text-[11px] uppercase tracking-wider text-amber-200/80">
            You chose
          </div>
          <div className="font-mono text-lg text-amber-100">
            {humanAction ? formatAction(humanAction) : "—"}
          </div>
          {agreement === "agreement" && (
            <div className="mt-1 text-xs font-semibold tracking-wide text-emerald-300">
              ✓ AGREEMENT
            </div>
          )}
          {agreement === "different" && (
            <div className="mt-1 text-xs font-semibold tracking-wide text-violet-300">
              DIFFERENT DECISION
            </div>
          )}
        </div>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Metric label="Decision age" value={decision ? formatMs(decision.trace.decisionAgeMs) : "N/A"} />
        <Metric label="Jev latency" value={decision ? formatMs(decision.latencyMs) : "N/A"} />
        <Metric
          label="Decision interval"
          value={tactical ? formatMs(decisionIntervalFor(tactical)) : "N/A"}
        />
        <Metric
          label="Gate distance"
          value={tactical ? `${Math.round(tactical.nextGateDistance)} px` : "N/A"}
        />
        <Metric
          label="Predicted gate arrival"
          value={tactical?.timeToGateMs != null ? formatMs(tactical.timeToGateMs) : "N/A"}
        />
        <Metric
          label="Control"
          value={
            control === "local" ? "LOCAL MODEL" : control === "fallback" ? "FALLBACK" : control.toUpperCase()
          }
        />
        <Metric label="Confidence" value={formatPercent(decision?.confidence)} />
        <Metric
          label="Provider"
          value={`${decision?.provider ?? "N/A"}${decision?.isFallback ? " (fallback)" : ""}`}
        />
      </dl>
    </section>
  );
}

function phaseLabel(phase: ControlPhase, lastEvent: DecisionRecord | null): string {
  if (phase === "in_flight" || phase === "requested") return "Requested · in flight";
  if (phase === "discarded" || lastEvent?.outcome === "stale") return "Received · discarded as stale";
  if (phase === "applied") return "Received · applied";
  return "Idle";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="font-mono text-slate-100">{value}</dd>
    </div>
  );
}

function ProbBar({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | undefined;
  accent: "cyan" | "violet";
}) {
  const pct = value == null ? null : Math.round(value * 100);
  const width = pct ?? 0;
  const bar =
    accent === "cyan"
      ? "from-cyan-400 to-cyan-200"
      : "from-violet-400 to-fuchsia-300";

  return (
    <div className="mb-3">
      <div className="mb-1 flex justify-between text-xs text-slate-300">
        <span>{label}</span>
        <span className="font-mono">{pct == null ? "N/A" : `${pct}%`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${bar} transition-all duration-500`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
