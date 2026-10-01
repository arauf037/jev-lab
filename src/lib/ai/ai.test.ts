import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidTacticalState } from "./decisionProvider";
import { MockDecisionProvider, computeShouldFlap } from "./mockProvider";
import { createFallbackDecision } from "./jevProvider";
import { DecisionManager } from "./decisionManager";
import type { TacticalState } from "../game/types";

function sampleState(overrides: Partial<TacticalState> = {}): TacticalState {
  return {
    altitude: 250,
    verticalVelocity: 1,
    nextGateDistance: 180,
    gapCenterY: 280,
    gapSize: 160,
    relativeGapOffset: 10,
    horizontalVelocity: 3.2,
    recentFlaps: 0,
    timeSinceLastFlapMs: 400,
    droneAlive: true,
    ...overrides,
  };
}

describe("decision validation", () => {
  it("accepts valid tactical payloads", () => {
    assert.equal(isValidTacticalState(sampleState()), true);
  });

  it("rejects malformed payloads", () => {
    assert.equal(isValidTacticalState({ altitude: 1 }), false);
    assert.equal(isValidTacticalState(null), false);
  });
});

describe("mock provider", () => {
  it("returns flap or wait with mock provider label", async () => {
    const provider = new MockDecisionProvider();
    const decision = await provider.decide(
      sampleState({ relativeGapOffset: 80, nextGateDistance: 100 })
    );
    assert.ok(decision.action === "flap" || decision.action === "wait");
    assert.equal(decision.provider, "mock");
    assert.ok(typeof decision.latencyMs === "number");
  });

  it("flaps when very low", () => {
    assert.equal(computeShouldFlap(sampleState({ altitude: 40 })), true);
  });
});

describe("fallback", () => {
  it("never pretends to be jev and omits fake confidence", () => {
    const decision = createFallbackDecision(sampleState({ altitude: 40 }));
    assert.equal(decision.provider, "fallback");
    assert.equal(decision.isFallback, true);
    assert.equal(decision.confidence, undefined);
    assert.equal(decision.probabilities, undefined);
  });
});

describe("decision manager", () => {
  it("records history and applies autopilot decisions", async () => {
    const applied: string[] = [];
    const mgr = new DecisionManager(new MockDecisionProvider(), "mock");
    mgr.onDecisionApplied((record) => applied.push(record.action));
    const record = await mgr.runLabDecision(sampleState());
    assert.ok(record.action === "flap" || record.action === "wait");
    assert.equal(mgr.getSnapshot().history.length, 1);
    // lab outcomes are lab_only — not applied to autopilot
    assert.equal(applied.length, 0);
  });

  it("uses fallback on provider failure", async () => {
    const failing = {
      async decide() {
        throw new Error("network down");
      },
    };
    const mgr = new DecisionManager(failing, "jev");
    const record = await mgr.runLabDecision(sampleState({ altitude: 40 }));
    assert.equal(record.provider, "fallback");
    assert.equal(record.outcome, "fallback");
    assert.equal(mgr.getSnapshot().status, "fallback");
  });
});
