"use client";

import type { DecisionRecord } from "@/lib/game/types";
import { formatAction, formatMs } from "@/lib/utils/formatters";

interface DecisionHistoryProps {
  history: DecisionRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function DecisionHistory({ history, selectedId, onSelect }: DecisionHistoryProps) {
  return (
    <section className="panel-card">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
        Decision History
      </h2>
      <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
        {history.length === 0 && (
          <p className="text-sm text-slate-500">No decisions yet.</p>
        )}
        {history.map((item) => {
          const active = item.id === selectedId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                active
                  ? "border-cyan-300/50 bg-cyan-400/10"
                  : "border-transparent bg-white/5 hover:border-white/10"
              }`}
            >
              <span className="font-mono text-cyan-100">
                {formatAction(item.action)}
                {item.outcome === "stale" ? " · stale" : ""}
                {item.provider === "local"
                  ? " · local model"
                  : item.isFallback
                    ? " · fallback"
                    : ""}
              </span>
              <span className="text-xs text-slate-400">
                {formatMs(item.latencyMs)} · {item.provider}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
