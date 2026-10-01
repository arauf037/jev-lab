"use client";

import type { GameState } from "@/lib/game/types";
import { createTacticalState } from "@/lib/game/tactical";

interface TelemetryPanelProps {
  state: GameState;
}

function computeRisk(state: GameState): "LOW" | "MEDIUM" | "HIGH" {
  const tactical = createTacticalState(state, state.elapsedMs);
  const near = tactical.nextGateDistance < 160;
  const offset = Math.abs(tactical.relativeGapOffset);
  const descending = tactical.verticalVelocity > 3.5;
  const tight = tactical.gapSize < 140;
  if ((near && offset > tactical.gapSize * 0.35) || (descending && near && tight)) {
    return "HIGH";
  }
  if (near || descending || tight) return "MEDIUM";
  return "LOW";
}

export function TelemetryPanel({ state }: TelemetryPanelProps) {
  const tactical = createTacticalState(state, state.elapsedMs);
  const risk = computeRisk(state);

  const rows: [string, string | number][] = [
    ["Altitude", tactical.altitude.toFixed(1)],
    ["Vert Vel", tactical.verticalVelocity.toFixed(2)],
    ["Gate Dist", tactical.nextGateDistance.toFixed(1)],
    ["Gap Center", tactical.gapCenterY.toFixed(1)],
    ["Gap Size", tactical.gapSize.toFixed(1)],
    ["Gap Offset", tactical.relativeGapOffset.toFixed(1)],
    ["World Speed", tactical.horizontalVelocity.toFixed(2)],
    ["Recent Flaps", tactical.recentFlaps],
    ["Since Flap", `${tactical.timeSinceLastFlapMs}ms`],
    ["Risk", risk],
  ];

  return (
    <section className="panel-card">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">
        Flight Telemetry
      </h2>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-white/5 px-2.5 py-2">
            <dt className="text-[10px] uppercase tracking-wider text-slate-500">{label}</dt>
            <dd className="font-mono text-slate-100">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-slate-500">
        Risk · APP CALCULATED
      </p>
    </section>
  );
}
