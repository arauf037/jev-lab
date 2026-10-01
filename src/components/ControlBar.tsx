"use client";

import type { GameStatus } from "@/lib/game/types";

interface ControlBarProps {
  status: GameStatus;
  mode: string;
  onStart: () => void;
  onReset: () => void;
}

export function ControlBar({ status, mode, onStart, onReset }: ControlBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onStart}
        className="rounded-xl border border-cyan-300/40 bg-cyan-400/20 px-4 py-2 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-400/30"
      >
        {status === "running" ? "Flying" : status === "game_over" ? "Fly Again" : "Start"}
      </button>
      <button
        type="button"
        onClick={onReset}
        className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
      >
        Reset
      </button>
      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
        {mode} · {status.replace("_", " ")}
      </div>
    </div>
  );
}
