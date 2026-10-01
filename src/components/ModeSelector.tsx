"use client";

import type { GameMode } from "@/lib/game/types";

interface ModeSelectorProps {
  mode: GameMode;
  onChange: (mode: GameMode) => void;
}

const MODES: { id: GameMode; label: string; hint: string }[] = [
  { id: "autopilot", label: "Autopilot", hint: "Jev flies" },
  { id: "manual", label: "Manual", hint: "Space to flap" },
  { id: "lab", label: "Lab", hint: "Paused inspect" },
];

export function ModeSelector({ mode, onChange }: ModeSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {MODES.map((item) => {
        const active = mode === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`rounded-xl border px-3 py-2 text-left transition ${
              active
                ? "border-cyan-300/60 bg-cyan-400/15 text-cyan-50 shadow-[0_0_20px_rgba(34,211,238,0.15)]"
                : "border-white/10 bg-white/5 text-slate-300 hover:border-violet-300/30 hover:bg-white/10"
            }`}
          >
            <div className="text-sm font-semibold">{item.label}</div>
            <div className="text-[11px] text-slate-400">{item.hint}</div>
          </button>
        );
      })}
    </div>
  );
}
