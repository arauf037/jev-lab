"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DecisionManager } from "@/lib/ai/decisionManager";
import type { DecisionManagerSnapshot } from "@/lib/ai/decisionManager";
import { JevDecisionProvider } from "@/lib/ai/jevProvider";
import {
  HttpAnalystProvider,
  LocalHeuristicAnalyst,
  type FlightAnalysis,
} from "@/lib/ai/llmAnalyst";
import { preloadLocalModel, type LocalModelStatus } from "@/lib/ai/localModel";
import { MockDecisionProvider } from "@/lib/ai/mockProvider";
import { GAME_CONFIG } from "@/lib/game/constants";
import { GameEngine } from "@/lib/game/gameEngine";
import { renderGame } from "@/lib/game/renderer";
import { createTacticalState } from "@/lib/game/tactical";
import type {
  DecisionRecord,
  GameMode,
  GameState,
} from "@/lib/game/types";

interface RuntimeStatus {
  aiProvider: "jev" | "mock";
  demoMode: boolean;
  llmConfigured: boolean;
}

export function useFlightGame() {
  const [canvasNode, setCanvasNode] = useState<HTMLCanvasElement | null>(null);
  const canvasRef = useCallback((node: HTMLCanvasElement | null) => {
    setCanvasNode(node);
  }, []);
  const engineRef = useRef<GameEngine | null>(null);
  const decisionRef = useRef<DecisionManager | null>(null);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const lastAnalystAt = useRef(0);
  const lastUiPushAt = useRef(0);
  const runtimeRef = useRef<RuntimeStatus>({
    aiProvider: "mock",
    demoMode: true,
    llmConfigured: false,
  });

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [decisionSnap, setDecisionSnap] = useState<DecisionManagerSnapshot | null>(null);
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<FlightAnalysis | null>(null);
  const [runtime, setRuntime] = useState<RuntimeStatus>({
    aiProvider: "mock",
    demoMode: true,
    llmConfigured: false,
  });
  const [humanAction, setHumanAction] = useState<"flap" | "wait" | null>(null);
  const [localModel, setLocalModel] = useState<LocalModelStatus>("loading");
  const lastHumanFlapAt = useRef(0);

  useEffect(() => {
    const engine = new GameEngine();
    engineRef.current = engine;
    setGameState({ ...engine.getState() });

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    async function boot() {
      const statusRes = await fetch("/api/status").catch(() => null);
      const status = statusRes
        ? ((await statusRes.json()) as RuntimeStatus)
        : { aiProvider: "mock" as const, demoMode: true, llmConfigured: false };

      if (cancelled) return;

      runtimeRef.current = status;
      setRuntime(status);

      const mgr = new DecisionManager(
        status.aiProvider === "mock"
          ? new MockDecisionProvider()
          : new JevDecisionProvider(),
        status.demoMode ? "mock" : "jev"
      );

      mgr.onDecisionApplied((record) => {
        const currentEngine = engineRef.current;
        if (!currentEngine) return;
        const current = currentEngine.getState();
        if (record.sessionId !== currentEngine.getSessionId()) return;
        if (record.action !== "flap") return;
        if (current.mode !== "autopilot" || current.status !== "running") return;
        currentEngine.dispatch({ type: "FLAP" });
      });

      decisionRef.current = mgr;
      setDecisionSnap(mgr.getSnapshot());
      unsubscribe = mgr.subscribe(() => {
        const snap = mgr.getSnapshot();
        setDecisionSnap(snap);
        // In manual mode, absence of a recent flap means the human chose WAIT.
        const mode = engineRef.current?.getState().mode;
        if (mode === "manual" && snap.current && !snap.inFlight) {
          const flappedSinceDecision =
            lastHumanFlapAt.current >= snap.current.timestamp - 50;
          setHumanAction(flappedSinceDecision ? "flap" : "wait");
        }
      });
    }

    void boot();
    void preloadLocalModel().then((status) => {
      if (!cancelled) setLocalModel(status);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const requestAnalysis = useCallback(async (state: GameState, history: DecisionRecord[]) => {
    try {
      const provider = runtimeRef.current.llmConfigured
        ? new HttpAnalystProvider()
        : new LocalHeuristicAnalyst();
      const tactical = createTacticalState(state, state.elapsedMs);
      const result = await provider.analyze({
        score: state.score,
        flightTimeSeconds: state.elapsedMs / 1000,
        recentDecisions: history.slice(0, 8).map((d) => ({
          action: d.action,
          confidence: d.confidence,
          latencyMs: d.latencyMs,
        })),
        telemetry: {
          altitude: tactical.altitude,
          verticalVelocity: tactical.verticalVelocity,
          nextGateDistance: tactical.nextGateDistance,
          gapSize: tactical.gapSize,
        },
      });
      setAnalysis(result);
    } catch {
      // Analyst is optional.
    }
  }, []);

  useEffect(() => {
    const canvas = canvasNode;
    const engine = engineRef.current;
    // FlightLab renders the canvas only after the first state commit, so this
    // effect must wait for that node. Running it once on mount finds no canvas
    // and never starts the animation loop.
    if (!canvas || !engine) return;

    const resize = () => {
      const parent = canvas.parentElement;
      const width = Math.max(320, parent?.clientWidth ?? GAME_CONFIG.defaultCanvasWidth);
      const height = Math.min(620, Math.max(420, Math.round(width * 0.58)));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      engine.resize(width, height);
      setGameState({ ...engine.getState() });
    };

    resize();
    window.addEventListener("resize", resize);

    const loop = (ts: number) => {
      const last = lastTsRef.current || ts;
      const delta = ts - last;
      lastTsRef.current = ts;

      engine.update(delta);
      const state = engine.getState();

      const ctx = canvas.getContext("2d");
      if (ctx) {
        renderGame(ctx, state, engine.getParticles(), engine.getStars(), ts);
      }

      const mgr = decisionRef.current;
      if (mgr) {
        const tactical = createTacticalState(state, state.elapsedMs);
        const now = performance.now();
        mgr.sync(engine.getSessionId(), tactical, now);
        if (state.status === "running" && state.mode !== "lab") {
          mgr.maybeRequest(tactical, state.mode, now);
        }
      }

      if (
        state.status === "running" &&
        ts - lastAnalystAt.current > GAME_CONFIG.analystIntervalMs
      ) {
        lastAnalystAt.current = ts;
        void requestAnalysis(state, decisionRef.current?.getSnapshot().history ?? []);
      }

      // Keep canvas at full FPS; throttle React telemetry panels (~12 Hz).
      if (ts - lastUiPushAt.current > 80 || state.status !== "running") {
        lastUiPushAt.current = ts;
        setGameState({ ...state });
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [canvasNode, requestAnalysis]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      event.preventDefault();
      const engine = engineRef.current;
      if (!engine) return;
      const mode = engine.getState().mode;
      if (mode === "manual") {
        engine.dispatch({ type: "FLAP" });
        lastHumanFlapAt.current = Date.now();
        setHumanAction("flap");
      } else if (engine.getState().status !== "running") {
        engine.dispatch({ type: "START" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const setMode = useCallback((mode: GameMode) => {
    engineRef.current?.dispatch({ type: "SET_MODE", mode });
    setHumanAction(null);
  }, []);

  const start = useCallback(() => {
    engineRef.current?.dispatch({ type: "START" });
  }, []);

  const reset = useCallback(() => {
    engineRef.current?.dispatch({ type: "RESET" });
    setHumanAction(null);
    setSelectedDecisionId(null);
  }, []);

  const flap = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.getState().mode === "manual") {
      engine.dispatch({ type: "FLAP" });
      lastHumanFlapAt.current = Date.now();
      setHumanAction("flap");
    } else if (engine.getState().status !== "running") {
      engine.dispatch({ type: "START" });
    }
  }, []);

  const runLabDecision = useCallback(async () => {
    const engine = engineRef.current;
    const mgr = decisionRef.current;
    if (!engine || !mgr) return;
    const state = engine.getState();
    const tactical = createTacticalState(state, state.elapsedMs);
    const record = await mgr.runLabDecision(tactical);
    setSelectedDecisionId(record.id);
  }, []);

  const selectedDecision =
    decisionSnap?.history.find((d) => d.id === selectedDecisionId) ??
    decisionSnap?.current ??
    null;

  return {
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
  };
}
