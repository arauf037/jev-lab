"use client";

import { ControlBar } from "@/components/ControlBar";
import { DecisionHistory } from "@/components/DecisionHistory";
import { DecisionInspector } from "@/components/DecisionInspector";
import { FlightAnalyst } from "@/components/FlightAnalyst";
import { GameCanvas } from "@/components/GameCanvas";
import { GameHud } from "@/components/GameHud";
import { JevDecisionPanel } from "@/components/JevDecisionPanel";
import { LabPanel } from "@/components/LabPanel";
import { BenchmarkPanel } from "@/components/BenchmarkPanel";
import { ModeSelector } from "@/components/ModeSelector";
import { ProviderSelector } from "@/components/ProviderSelector";
import { StatusIndicator } from "@/components/StatusIndicator";
import { TelemetryPanel } from "@/components/TelemetryPanel";
import { useFlightGame } from "@/hooks/useFlightGame";
import { createTacticalState } from "@/lib/game/tactical";
import type { DecisionRecord, GameState } from "@/lib/game/types";
import { formatMs, formatSeconds } from "@/lib/utils/formatters";

export function FlightLab() {
  const {
    canvasRef,
    gameState,
    decisionSnap,
    selectedDecision,
    selectedDecisionId,
    setSelectedDecisionId,
    analysis,
    runtime,
    humanAction,
    setMode,
    start,
    reset,
    flap,
    runLabDecision,
    localModel,
    selectPilot,
    pilot,
    flightResults,
    benchmark,
    benchmarkBusy,
    benchmarkError,
    runBenchmark,
  } = useFlightGame();

  if (!gameState) {
    return (
      <div className="flex min-h-screen items-center justify-center text-cyan-200">
        Initializing flight lab…
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(34,211,238,0.12),_transparent_45%),radial-gradient(ellipse_at_bottom_right,_rgba(167,139,250,0.14),_transparent_40%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.05)_1px,transparent_1px)] [background-size:48px_48px]" />

      <main className="relative mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-[0.28em] text-cyan-300/80">
              Autonomous Decision Demo
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              JEV Flight Lab
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Game engine owns physics. The selected pilot chooses <span className="text-cyan-300">FLAP</span> or{" "}
              <span className="text-violet-300">WAIT</span>. An optional LLM analyzes — never pilots.
            </p>
          </div>
          <StatusIndicator
            status={decisionSnap?.status ?? "idle"}
            demoMode={runtime.demoMode}
            providerLabel={decisionSnap?.providerLabel ?? "mock"}
            inFlight={decisionSnap?.inFlight ?? false}
            lastError={decisionSnap?.lastError ?? null}
            control={decisionSnap?.control ?? "mock"}
            localModel={localModel}
            openaiModel={runtime.openaiModel}
          />
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,0.9fr)]">
          <section className="space-y-4">
            <div className="relative">
              <GameCanvas canvasRef={canvasRef} onFlap={flap} />
              <GameHud state={gameState} />
              {gameState.status === "idle" && (
                <OverlayMessage title="Ready for launch" body="Press Start or click the canvas" />
              )}
              {gameState.status === "game_over" && (
                <GameOverOverlay
                  state={gameState}
                  decisions={decisionSnap?.history ?? []}
                  demoMode={runtime.demoMode}
                />
              )}
              {gameState.mode === "lab" && gameState.status !== "game_over" && (
                <OverlayMessage title="Lab paused" body="Inspect state · Run one decision" />
              )}
              {gameState.mode === "compare" && gameState.status !== "game_over" && (
                <OverlayMessage title="Compare" body="One pilot per flight. Switch to Autopilot to fly." />
              )}
            </div>

            <ModeSelector mode={gameState.mode} onChange={setMode} />
            <ProviderSelector
              pilot={pilot}
              jevConfigured={runtime.jevConfigured}
              openaiConfigured={runtime.openaiConfigured}
              layaConfigured={runtime.layaConfigured}
              openaiModel={runtime.openaiModel}
              onChange={selectPilot}
            />
            {gameState.mode === "compare" && (
              <BenchmarkPanel
                flights={flightResults}
                recordedStates={decisionSnap?.recordedStates ?? 0}
                report={benchmark}
                busy={benchmarkBusy}
                error={benchmarkError}
                onRun={() => void runBenchmark()}
                canRun={runtime.jevConfigured && runtime.openaiConfigured}
              />
            )}
            <ControlBar
              status={gameState.status}
              mode={gameState.mode}
              onStart={start}
              onReset={reset}
            />
            <LabPanel
              state={gameState}
              onRun={() => void runLabDecision()}
              busy={decisionSnap?.inFlight ?? false}
            />
          </section>

          <aside className="space-y-4">
            <JevDecisionPanel
              decision={decisionSnap?.current ?? null}
              lastEvent={decisionSnap?.lastEvent ?? null}
              humanAction={humanAction}
              mode={gameState.mode}
              inFlight={decisionSnap?.inFlight ?? false}
              phase={decisionSnap?.phase ?? "idle"}
              control={decisionSnap?.control ?? "mock"}
              providerLabel={decisionSnap?.providerLabel ?? pilot}
              fallbackActive={decisionSnap?.status === "fallback"}
              tactical={createTacticalState(gameState, gameState.elapsedMs)}
            />
            <TelemetryPanel state={gameState} />
            <DecisionHistory
              history={decisionSnap?.history ?? []}
              selectedId={selectedDecisionId}
              onSelect={setSelectedDecisionId}
            />
            <DecisionInspector decision={selectedDecision} />
            <FlightAnalyst analysis={analysis} configured={runtime.llmConfigured} />
          </aside>
        </div>
      </main>
    </div>
  );
}

function OverlayMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/35 backdrop-blur-[1px]">
      <div className="rounded-2xl border border-cyan-300/30 bg-slate-950/80 px-6 py-4 text-center shadow-[0_0_30px_rgba(34,211,238,0.15)]">
        <div className="text-lg font-semibold text-cyan-50">{title}</div>
        <div className="mt-1 text-sm text-slate-300">{body}</div>
      </div>
    </div>
  );
}

function GameOverOverlay({
  state,
  decisions,
  demoMode,
}: {
  state: GameState;
  decisions: DecisionRecord[];
  demoMode: boolean;
}) {
  const avgLatency =
    decisions.length === 0
      ? null
      : Math.round(
          decisions.reduce((sum, d) => sum + d.latencyMs, 0) / decisions.length
        );

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/45 backdrop-blur-[1px]">
      <div className="w-[min(92%,360px)] rounded-2xl border border-rose-300/30 bg-slate-950/85 px-6 py-5 text-center shadow-[0_0_30px_rgba(244,63,94,0.12)]">
        <div className="text-[11px] uppercase tracking-[0.24em] text-rose-200/80">
          Flight Terminated
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-left text-sm">
          <Stat label="Score" value={String(state.score)} />
          <Stat label="Flight Time" value={formatSeconds(state.elapsedMs)} />
          <Stat label="Decisions" value={String(decisions.length)} />
          <Stat
            label="Avg Latency"
            value={avgLatency == null ? "N/A" : formatMs(avgLatency)}
          />
        </div>
        <p className="mt-4 text-xs text-slate-400">
          {demoMode
            ? "MOCK JEV · Press Fly Again"
            : state.mode === "autopilot"
              ? `${decisions.length} tactical decisions · Press Fly Again`
              : "Press Fly Again"}
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-mono text-cyan-100">{value}</div>
    </div>
  );
}
