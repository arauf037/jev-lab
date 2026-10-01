"use client";

import type { GameState } from "@/lib/game/types";
import { formatSeconds } from "@/lib/utils/formatters";

interface GameHudProps {
  state: GameState;
}

export function GameHud({ state }: GameHudProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-4">
      <div className="rounded-xl border border-cyan-400/20 bg-slate-950/70 px-4 py-2 backdrop-blur">
        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/70">Score</div>
        <div className="font-mono text-2xl text-cyan-100">{state.score}</div>
      </div>
      <div className="rounded-xl border border-violet-400/20 bg-slate-950/70 px-4 py-2 text-right backdrop-blur">
        <div className="text-[10px] uppercase tracking-[0.22em] text-violet-300/70">Flight</div>
        <div className="font-mono text-lg text-violet-100">{formatSeconds(state.elapsedMs)}</div>
        <div className="text-xs text-slate-400">Best {state.bestScore}</div>
      </div>
    </div>
  );
}
