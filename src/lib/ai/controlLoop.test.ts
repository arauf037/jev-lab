import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GAME_CONFIG } from "../game/constants";
import { GameEngine } from "../game/gameEngine";
import type { TacticalState } from "../game/types";
import type { TacticalDecision } from "./decisionProvider";
import { DecisionManager } from "./decisionManager";
import { decisionAgeMs, decisionIntervalFor } from "./control";

function sampleState(overrides: Partial<TacticalState> = {}): TacticalState {
  return {
    altitude: 250,
    verticalVelocity: 1,
    nextGateDistance: 180,
    gapCenterY: 280,
    gapSize: 180,
    relativeGapOffset: 40,
    horizontalVelocity: 2.6,
    recentFlaps: 0,
    timeSinceLastFlapMs: 400,
    droneAlive: true,
    timeToGateMs: 900,
    predictedOffsetAtGate: 48,
    ...overrides,
  };
}

function flapDecision(): TacticalDecision {
  return { action: "flap", latencyMs: 20, provider: "jev", timestamp: 1 };
}

function waitDecision(): TacticalDecision {
  return { action: "wait", latencyMs: 20, provider: "jev", timestamp: 2 };
}

function aborted(): Error {
  return Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
}

describe("control scheduling", () => {
  it("uses a shorter interval near a gate and a longer one far away", () => {
    const far = sampleState({
      timeToGateMs: 2000,
      relativeGapOffset: 0,
      verticalVelocity: 0,
    });
    const close = sampleState({
      timeToGateMs: 400,
      relativeGapOffset: 0,
      verticalVelocity: 0,
    });
    assert.equal(decisionIntervalFor(far), GAME_CONFIG.calmDecisionIntervalMs);
    assert.equal(decisionIntervalFor(close), GAME_CONFIG.urgentDecisionIntervalMs);
  });

  it("calculates decision age from request to apply", () => {
    assert.equal(decisionAgeMs(1000, 1142), 142);
  });
});

describe("asynchronous decision controller", () => {
  it("keeps the game running while a jev request is pending", async () => {
    let release!: (decision: TacticalDecision) => void;
    const gate = new Promise<TacticalDecision>((resolve) => {
      release = resolve;
    });
    const mgr = new DecisionManager({ decide: () => gate }, "jev");
    const engine = new GameEngine(900, 520);
    engine.dispatch({ type: "START" });
    const y0 = engine.getState().drone.y;
    const state = sampleState();
    mgr.sync(engine.getSessionId(), state, 0);
    const pending = mgr.requestDecision(state, "autopilot", 0);
    assert.equal(mgr.getSnapshot().inFlight, true);
    engine.update(32);
    engine.update(32);
    assert.ok(engine.getState().elapsedMs > 0);
    assert.notEqual(engine.getState().drone.y, y0);
    assert.equal(engine.getState().status, "running");
    release(waitDecision());
    await pending;
    assert.equal(mgr.getSnapshot().inFlight, false);
  });

  it("applies a fresh flap and records its age", async () => {
    const mgr = new DecisionManager(
      { async decide() { return flapDecision(); } },
      "jev"
    );
    const applied: string[] = [];
    mgr.onDecisionApplied((record) => applied.push(record.action));
    const state = sampleState();
    mgr.sync(1, state, 1000);
    const record = await mgr.requestDecision(state, "autopilot", 1000);
    assert.equal(record.outcome, "pending");
    assert.equal(record.trace.stale, false);
    assert.equal(record.trace.decisionAgeMs, 0);
    assert.equal(record.trace.droneYAtRequest, state.gapCenterY + state.relativeGapOffset);
    assert.equal(record.trace.nextGateDistanceAtApply, state.nextGateDistance);
    assert.deepEqual(applied, ["flap"]);
    assert.equal(mgr.getSnapshot().phase, "applied");
    assert.equal(mgr.getSnapshot().counts.applied, 1);
  });

  it("rejects a decision that is older than the age limit", async () => {
    const mgr = new DecisionManager(
      { async decide() { return flapDecision(); } },
      "jev"
    );
    const applied: string[] = [];
    mgr.onDecisionApplied((record) => applied.push(record.action));
    const state = sampleState();
    mgr.sync(1, state, 0);
    const pending = mgr.requestDecision(state, "autopilot", 0);
    mgr.sync(1, state, GAME_CONFIG.maxDecisionAgeMs + 50);
    const record = await pending;
    assert.equal(record.outcome, "stale");
    assert.equal(record.trace.stale, true);
    assert.ok(record.trace.decisionAgeMs > GAME_CONFIG.maxDecisionAgeMs);
    assert.equal(applied.length, 0);
    assert.equal(mgr.getSnapshot().counts.stale, 1);
    assert.equal(mgr.getSnapshot().inFlight, false);
  });

  it("rejects a flap that is no longer relevant to the live pose", async () => {
    const mgr = new DecisionManager(
      { async decide() { return flapDecision(); } },
      "jev"
    );
    const applied: string[] = [];
    mgr.onDecisionApplied((record) => applied.push(record.action));
    const captured = sampleState({ relativeGapOffset: 40 });
    const live = sampleState({
      relativeGapOffset: -120,
      predictedOffsetAtGate: -80,
      altitude: 320,
    });
    mgr.sync(1, live, 200);
    const record = await mgr.requestDecision(captured, "autopilot", 200);
    assert.equal(record.outcome, "stale");
    assert.equal(applied.length, 0);
  });

  it("drops a response from a previous game session", async () => {
    let release!: (decision: TacticalDecision) => void;
    const gate = new Promise<TacticalDecision>((resolve) => {
      release = resolve;
    });
    const mgr = new DecisionManager({ decide: () => gate }, "jev");
    const applied: string[] = [];
    mgr.onDecisionApplied((record) => applied.push(record.action));
    const engine = new GameEngine(900, 520);
    const state = sampleState();
    mgr.sync(engine.getSessionId(), state, 0);
    const pending = mgr.requestDecision(state, "autopilot", 0);
    engine.dispatch({ type: "RESET" });
    mgr.sync(engine.getSessionId(), state, 30);
    release(flapDecision());
    const record = await pending;
    assert.equal(record.outcome, "stale");
    assert.equal(applied.length, 0);
    assert.notEqual(engine.getSessionId(), 1);
  });

  it("uses a loaded local model when jev times out", async () => {
    const mgr = new DecisionManager(
      { async decide() { throw aborted(); } },
      "jev",
      async () => ({
        action: "wait",
        latencyMs: 18,
        provider: "local",
        timestamp: 1,
        isFallback: true,
        probabilities: { flap: 0.22, wait: 0.78 },
        confidence: 0.78,
      })
    );
    const state = sampleState({ relativeGapOffset: -20, predictedOffsetAtGate: -10, altitude: 280 });
    mgr.sync(1, state, 0);
    const record = await mgr.requestDecision(state, "autopilot", 0);
    assert.equal(record.provider, "local");
    assert.equal(record.action, "wait");
    assert.equal(record.isFallback, true);
    assert.equal(record.latencyMs, 18);
    assert.equal(mgr.getSnapshot().control, "local");
  });

  it("activates fallback when jev times out", async () => {
    const mgr = new DecisionManager(
      { async decide() { throw aborted(); } },
      "jev"
    );
    const applied: string[] = [];
    mgr.onDecisionApplied((record) => applied.push(record.provider));
    const state = sampleState({ altitude: 40, relativeGapOffset: 50 });
    mgr.sync(1, state, 0);
    const record = await mgr.requestDecision(state, "autopilot", 0);
    assert.equal(record.provider, "fallback");
    assert.equal(record.outcome, "fallback");
    assert.equal(record.trace.fallback, true);
    assert.deepEqual(applied, ["fallback"]);
    assert.equal(mgr.getSnapshot().status, "fallback");
    assert.equal(mgr.getSnapshot().control, "fallback");
  });

  it("does not let fallback flap on top of a fresh jev flap", async () => {
    let mode: "jev" | "fail" = "jev";
    const mgr = new DecisionManager(
      {
        async decide() {
          if (mode === "fail") throw aborted();
          return flapDecision();
        },
      },
      "jev"
    );
    const applied: string[] = [];
    mgr.onDecisionApplied((record) => applied.push(`${record.provider}:${record.action}`));
    const state = sampleState({ altitude: 40, relativeGapOffset: 50 });
    mgr.sync(1, state, 1000);
    await mgr.requestDecision(state, "autopilot", 1000);
    mode = "fail";
    mgr.sync(1, state, 1100);
    const second = await mgr.requestDecision(state, "autopilot", 1100, true);
    assert.equal(second.outcome, "stale");
    assert.deepEqual(applied, ["jev:flap"]);
    assert.equal(mgr.getSnapshot().control, "jev");
  });

  it("accepts a later jev flap after the quiet window", async () => {
    let mode: "jev" | "fail" = "fail";
    const mgr = new DecisionManager(
      {
        async decide() {
          if (mode === "fail") throw aborted();
          return flapDecision();
        },
      },
      "jev"
    );
    const applied: string[] = [];
    mgr.onDecisionApplied((record) => applied.push(record.provider));
    const state = sampleState({ altitude: 40, relativeGapOffset: 50 });
    mgr.sync(1, state, 0);
    await mgr.requestDecision(state, "autopilot", 0);
    mode = "jev";
    const later = GAME_CONFIG.fallbackQuietMs + 40;
    mgr.sync(1, state, later);
    const record = await mgr.requestDecision(state, "autopilot", later, true);
    assert.equal(record.provider, "jev");
    assert.equal(record.outcome, "pending");
    assert.deepEqual(applied, ["fallback", "jev"]);
  });

  it("allows only one in-flight request", async () => {
    let calls = 0;
    const mgr = new DecisionManager(
      {
        decide() {
          calls += 1;
          return new Promise<TacticalDecision>(() => {});
        },
      },
      "jev"
    );
    void mgr.requestDecision(sampleState(), "autopilot", 0);
    void mgr.requestDecision(sampleState(), "autopilot", 400);
    void mgr.requestDecision(sampleState(), "autopilot", 800);
    assert.equal(calls, 1);
    assert.equal(mgr.getSnapshot().inFlight, true);
    assert.equal(mgr.getSnapshot().counts.requested, 1);
  });

  it("does not let wait block the next decision", async () => {
    let calls = 0;
    const mgr = new DecisionManager(
      {
        async decide() {
          calls += 1;
          return waitDecision();
        },
      },
      "jev"
    );
    const state = sampleState({
      relativeGapOffset: -20,
      predictedOffsetAtGate: -10,
      altitude: 280,
    });
    await mgr.requestDecision(state, "autopilot", 0);
    assert.equal(mgr.getSnapshot().inFlight, false);
    await mgr.requestDecision(state, "autopilot", 500, true);
    assert.equal(calls, 2);
    assert.equal(mgr.getSnapshot().history.length, 2);
    assert.equal(mgr.getSnapshot().counts.applied, 2);
  });

  it("applies flap as one bounded impulse", () => {
    const engine = new GameEngine(900, 520);
    engine.dispatch({ type: "START" });
    engine.dispatch({ type: "FLAP" });
    assert.equal(engine.getState().drone.velocityY, GAME_CONFIG.flapImpulse);
    engine.update(16);
    const fallen = engine.getState().drone.velocityY;
    assert.ok(fallen > GAME_CONFIG.flapImpulse);
    engine.dispatch({ type: "FLAP" });
    assert.equal(engine.getState().drone.velocityY, GAME_CONFIG.flapImpulse);
  });

  it("schedules the next request from the live interval", async () => {
    let calls = 0;
    const mgr = new DecisionManager(
      {
        async decide() {
          calls += 1;
          return waitDecision();
        },
      },
      "jev"
    );
    const far = sampleState({
      timeToGateMs: 2200,
      relativeGapOffset: 0,
      verticalVelocity: 0,
      predictedOffsetAtGate: 4,
    });
    await mgr.requestDecision(far, "autopilot", 0);
    calls = 0;
    mgr.maybeRequest(far, "autopilot", GAME_CONFIG.calmDecisionIntervalMs - 20);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(calls, 0);
    mgr.maybeRequest(far, "autopilot", GAME_CONFIG.calmDecisionIntervalMs);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(calls, 1);
  });
});
