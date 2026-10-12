"use client";

import type { PilotSelection } from "@/lib/config";

interface ProviderSelectorProps {
  pilot: PilotSelection;
  jevConfigured: boolean;
  openaiConfigured: boolean;
  layaConfigured: boolean;
  openaiModel: string;
  onChange: (pilot: PilotSelection) => void;
}

const OPTIONS: { id: PilotSelection; label: string }[] = [
  { id: "jev", label: "JEV" },
  { id: "openai", label: "GPT" },
  { id: "laya", label: "Local Laya (GPU - Accelerated)" },
  { id: "mock", label: "MOCK" },
];

export function ProviderSelector({
  pilot,
  jevConfigured,
  openaiConfigured,
  layaConfigured,
  openaiModel,
  onChange,
}: ProviderSelectorProps) {
  return (
    <section className="panel-card">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
        Decision Provider
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map((option) => {
          const disabled =
            (option.id === "jev" && !jevConfigured) ||
            (option.id === "openai" && !openaiConfigured) ||
            (option.id === "laya" && !layaConfigured);
          const active = pilot === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option.id)}
              className={`rounded-xl border px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                active
                  ? "border-cyan-300/60 bg-cyan-400/15 text-cyan-50"
                  : "border-white/10 bg-white/5 text-slate-300 hover:border-violet-300/30"
              }`}
            >
              <span className="mr-2 font-mono text-cyan-200">{active ? "●" : "○"}</span>
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs uppercase tracking-[0.16em] text-slate-400">
        {pilot === "openai" ? (
          <>
            GPT PILOT · MODEL: {openaiModel || "unset"} · STATUS: {openaiConfigured ? "READY" : "UNAVAILABLE"}
          </>
        ) : pilot === "jev" ? (
          <>JEV PILOT · STATUS: {jevConfigured ? "READY" : "UNAVAILABLE"}</>
        ) : pilot === "laya" ? (
          <>LAYA PILOT · MODEL: typed-decisions · STATUS: {layaConfigured ? "READY" : "UNAVAILABLE"}</>
        ) : (
          <>MOCK PILOT · STATUS: READY</>
        )}
      </p>
    </section>
  );
}
