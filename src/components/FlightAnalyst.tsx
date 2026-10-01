"use client";

import type { FlightAnalysis } from "@/lib/ai/llmAnalyst";

interface FlightAnalystProps {
  analysis: FlightAnalysis | null;
  configured: boolean;
}

export function FlightAnalyst({ analysis, configured }: FlightAnalystProps) {
  return (
    <section className="panel-card">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-fuchsia-300">
          Flight Analyst
        </h2>
        <span className="text-[11px] text-slate-500">
          {configured ? "LLM" : "Local heuristic"}
        </span>
      </header>
      {analysis ? (
        <>
          <p className="text-sm leading-relaxed text-slate-200">{analysis.summary}</p>
          <div className="mt-3 flex gap-2 text-xs">
            {analysis.risk && (
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 uppercase tracking-wider text-slate-300">
                Risk {analysis.risk}
              </span>
            )}
            {analysis.strategy && (
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 uppercase tracking-wider text-slate-300">
                {analysis.strategy}
              </span>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-500">
          Strategic commentary appears every ~10s during flight. The analyst never controls the drone.
        </p>
      )}
    </section>
  );
}
