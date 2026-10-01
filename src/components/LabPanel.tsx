"use client";

import type { GameState } from "@/lib/game/types";
import { createTacticalState } from "@/lib/game/tactical";

interface LabPanelProps {
  state: GameState;
  onRun: () => void;
  busy: boolean;
}

export function LabPanel({ state, onRun, busy }: LabPanelProps) {
  if (state.mode !== "lab") return null;

  const tactical = createTacticalState(state, state.elapsedMs);

  return (
    <section className="panel-card border-amber-300/20">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">
        Lab Mode
      </h2>
      <p className="mb-3 text-sm text-slate-400">
        Simulation paused. Inspect tactical state and run a single Jev decision.
      </p>
      <pre className="mb-3 max-h-40 overflow-auto rounded-xl bg-black/40 p-3 font-mono text-[11px] text-amber-100/90">
{JSON.stringify(tactical, null, 2)}
      </pre>
      <button
        type="button"
        onClick={onRun}
        disabled={busy}
        className="rounded-xl border border-amber-300/40 bg-amber-400/15 px-4 py-2 text-sm font-semibold text-amber-50 transition hover:bg-amber-400/25 disabled:opacity-50"
      >
        {busy ? "Running…" : "Run Jev Decision"}
      </button>
    </section>
  );
}
