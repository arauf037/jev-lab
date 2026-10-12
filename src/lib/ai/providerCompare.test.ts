import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { GAME_CONFIG } from "../game/constants";
import { applyFlap, applyGravity } from "../game/physics";
import type { TacticalState } from "../game/types";
import {
  agreementRates,
  buildBenchmarkReport,
  compareActions,
  latencyStats,
  summarizeCost,
  summarizeFlight,
} from "./benchmark";
import { decisionAgeMs, decisionIntervalFor } from "./control";
import { DecisionManager } from "./decisionManager";
import { providerDecisionRequest, tacticalStateForProvider } from "./decisionPayload";
import type { TacticalDecision, TacticalDecisionProvider } from "./decisionProvider";
import { createFallbackDecision, JevDecisionProvider } from "./jevProvider";
import { parseJevDecisionsResponse } from "./jevServer";
import { LayaDecisionProvider } from "./layaProvider";
import { MockDecisionProvider } from "./mockProvider";
import { OpenAIDecisionProvider } from "./openaiProvider";
import { estimateOpenAICostUsd } from "./openaiPricing";
import { parseOpenAIDecisionResponse } from "./openaiServer";

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
    timeToGateMs: 900,
    predictedOffsetAtGate: 12,
    gapMargin: 70,
    ...overrides,
  };
}

function responseWith(action: "FLAP" | "WAIT" | "FLY", usage?: Record<string, unknown>) {
  return {
    output_text: JSON.stringify({ action }),
    usage,
  };
}

describe("provider interface", () => {
  it("accepts Jev, GPT, Laya, and mock through the same provider interface", () => {
    const providers: TacticalDecisionProvider[] = [
      new JevDecisionProvider(),
      new OpenAIDecisionProvider(),
      new LayaDecisionProvider(),
      new MockDecisionProvider(),
    ];
    assert.equal(providers.every((provider) => typeof provider.decide === "function"), true);
  });

  it("builds the same live tactical payload for the same lead", () => {
    const state = sampleState();
    assert.deepEqual(tacticalStateForProvider(state, 400), tacticalStateForProvider(state, 400));
  });

  it("posts the recorded tactical state unchanged to both routes", () => {
    const state = sampleState({ altitude: 312, nextGateDistance: 143 });
    const jev = providerDecisionRequest(state);
    const gpt = providerDecisionRequest(state);
    assert.deepEqual(jev, gpt);
    assert.equal(jev.state.altitude, 312);
    assert.equal(jev.state.nextGateDistance, 143);
    assert.equal("messages" in jev, false);
  });
});

describe("openai structured decisions", () => {
  it("accepts FLAP", () => {
    const decision = parseOpenAIDecisionResponse(responseWith("FLAP"), 30, "gpt-4.1-mini");
    assert.equal(decision.action, "flap");
    assert.equal(decision.provider, "openai");
  });

  it("accepts WAIT", () => {
    const decision = parseOpenAIDecisionResponse(responseWith("WAIT"), 30, "gpt-4.1-mini");
    assert.equal(decision.action, "wait");
  });

  it("rejects an action outside FLAP or WAIT", () => {
    assert.throws(
      () => parseOpenAIDecisionResponse(responseWith("FLY"), 30, "gpt-4.1-mini"),
      /Invalid OpenAI response/
    );
  });

  it("leaves token and cost fields unset when usage is missing", () => {
    const decision = parseOpenAIDecisionResponse(responseWith("WAIT"), 12, "gpt-4.1-mini");
    assert.equal(decision.inputTokens, undefined);
    assert.equal(decision.outputTokens, undefined);
    assert.equal(decision.totalTokens, undefined);
    assert.equal(decision.estimatedCostUsd, undefined);
    assert.equal(decision.reportedCostUsd, undefined);
  });

  it("estimates cost only for a verified model and keeps tokens when the price is unknown", () => {
    const usage = { input_tokens: 100, output_tokens: 20, total_tokens: 120 };
    const priced = parseOpenAIDecisionResponse(responseWith("FLAP", usage), 12, "gpt-4.1-mini");
    assert.equal(priced.inputTokens, 100);
    assert.equal(priced.outputTokens, 20);
    assert.equal(priced.totalTokens, 120);
    assert.equal(priced.estimatedCostUsd, estimateOpenAICostUsd("gpt-4.1-mini", { inputTokens: 100, outputTokens: 20 }));
    assert.ok(priced.estimatedCostUsd != null && Math.abs(priced.estimatedCostUsd - 0.000072) < 1e-12);

    const unknown = parseOpenAIDecisionResponse(responseWith("FLAP", usage), 12, "gpt-unknown");
    assert.equal(unknown.inputTokens, 100);
    assert.equal(unknown.estimatedCostUsd, undefined);
  });

  it("does not invent a Jev cost when the decisions payload has no usage", () => {
    const decision = parseJevDecisionsResponse(
      {
        answers: {
          action: { type: "choice", choice: "wait", confidence: 0.5, probabilities: { flap: 0.2, wait: 0.8 } },
        },
      },
      10
    );
    assert.equal(decision.provider, "jev");
    assert.equal(decision.inputTokens, undefined);
    assert.equal(decision.estimatedCostUsd, undefined);
    assert.equal(decision.reportedCostUsd, undefined);
  });
});

describe("shared harness", () => {
  it("uses the existing fallback when the selected provider times out", async () => {
    const mgr = new DecisionManager(
      { async decide() { throw Object.assign(new Error("aborted"), { name: "AbortError" }); } },
      "openai",
      async (state) => createFallbackDecision(state)
    );
    const state = sampleState({ altitude: 40, relativeGapOffset: 50 });
    mgr.sync(1, state, 0);
    const record = await mgr.requestDecision(state, "autopilot", 0);
    assert.equal(record.provider, "fallback");
    assert.equal(record.fallback, true);
    assert.equal(record.outcome, "fallback");
    assert.equal(mgr.getSnapshot().control, "fallback");
  });

  it("keeps physics constants independent of provider selection", () => {
    const gravity = GAME_CONFIG.gravity;
    const flapImpulse = GAME_CONFIG.flapImpulse;
    const speed = GAME_CONFIG.initialVelocityX;
    const mgr = new DecisionManager(new MockDecisionProvider(), "mock");
    mgr.setProvider(new OpenAIDecisionProvider(), "openai");
    mgr.setProvider(new JevDecisionProvider(), "jev");
    const drone = { x: 10, y: 100, velocityY: 0, velocityX: speed, rotation: 0, alive: true };
    applyGravity(drone, 1);
    applyFlap(drone);
    assert.equal(GAME_CONFIG.gravity, gravity);
    assert.equal(GAME_CONFIG.flapImpulse, flapImpulse);
    assert.equal(GAME_CONFIG.initialVelocityX, speed);
    assert.equal(drone.velocityY, flapImpulse);
    const physics = readFileSync(new URL("../game/physics.ts", import.meta.url), "utf8");
    const engine = readFileSync(new URL("../game/gameEngine.ts", import.meta.url), "utf8");
    assert.equal(physics.includes("openai"), false);
    assert.equal(physics.includes("fetch("), false);
    assert.equal(engine.includes("OPENAI_API_KEY"), false);
    assert.equal(engine.includes("OPENROUTER_API_KEY"), false);
  });

  it("schedules the next request from the same interval for either provider", () => {
    const state = sampleState({ timeToGateMs: 2000, relativeGapOffset: 0, verticalVelocity: 0 });
    const interval = decisionIntervalFor(state);
    const pending = () => new Promise<TacticalDecision>(() => undefined);
    const jev = new DecisionManager({ decide: pending }, "jev");
    const gpt = new DecisionManager({ decide: pending }, "openai");
    jev.sync(1, state, 0);
    gpt.sync(1, state, 0);
    jev.maybeRequest(state, "autopilot", 1000);
    gpt.maybeRequest(state, "autopilot", 1000);
    jev.maybeRequest(state, "autopilot", 1000 + interval - 1);
    gpt.maybeRequest(state, "autopilot", 1000 + interval - 1);
    assert.equal(jev.getSnapshot().counts.requested, 1);
    assert.equal(gpt.getSnapshot().counts.requested, 1);
    assert.equal(jev.getSnapshot().counts.requested, gpt.getSnapshot().counts.requested);
  });

  it("calculates decision age with the shared clock", () => {
    assert.equal(decisionAgeMs(1000, 1284), 284);
    assert.equal(decisionAgeMs(1000, 1284), decisionAgeMs(1000, 1284));
  });
});

describe("replay benchmark", () => {
  it("scores agreement without treating a mismatch as a winner", () => {
    assert.equal(compareActions("flap", "flap"), "agreement");
    assert.equal(compareActions("flap", "wait"), "different");
    const rates = agreementRates([
      { match: "agreement" },
      { match: "different" },
      { match: "incomplete" },
    ]);
    assert.equal(rates.compared, 2);
    assert.equal(rates.agreementRate, 0.5);
    assert.equal(rates.disagreementRate, 0.5);
  });

  it("keeps latency and cost unavailable when a provider returns no usage", () => {
    const state = sampleState();
    const report = buildBenchmarkReport(1, [
      {
        sequence: 1,
        tacticalState: state,
        jev: { action: "flap", latencyMs: 100, timedOut: false, invalid: false, failed: false },
        openai: { action: "wait", latencyMs: 250, timedOut: false, invalid: false, failed: false },
        match: "different",
      },
    ]);
    assert.equal(report.jev.cost.status, "unavailable");
    assert.equal(report.openai.cost.status, "unavailable");
    assert.equal(report.jev.latency?.average, 100);
    assert.equal(report.openai.latency?.p95, 250);
    const flight = summarizeFlight({
      provider: "jev",
      score: 1,
      survivalMs: 1000,
      samples: [
        {
          provider: "jev",
          action: "flap",
          latencyMs: 100,
          decisionAgeMs: 110,
          stale: false,
          fallback: false,
        },
      ],
    });
    assert.equal(flight.totalCostUsd, undefined);
    assert.equal(flight.costStatus, "unavailable");
    assert.equal(flight.inputTokens, undefined);
  });

  it("summarizes estimated OpenAI cost from actual token counts", () => {
    const cost = summarizeCost([{ estimatedCostUsd: 0.000072 }, { estimatedCostUsd: 0.000072 }]);
    assert.equal(cost.status, "estimated");
    assert.equal(cost.totalUsd, 0.000144);
    assert.equal(cost.per100Usd, 0.0072);
    const stats = latencyStats([10, 20, 30, 40]);
    assert.equal(stats?.min, 10);
    assert.equal(stats?.max, 40);
    assert.equal(stats?.median, 20);
  });
});

describe("client secret boundary", () => {
  it("does not put API keys in browser provider modules", () => {
    const files = [
      "./openaiProvider.ts",
      "./jevProvider.ts",
      "./layaProvider.ts",
      "./benchmarkClient.ts",
      "./decisionPayload.ts",
    ];
    for (const file of files) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      assert.equal(source.includes("OPENAI_API_KEY"), false, file);
      assert.equal(source.includes("OPENROUTER_API_KEY"), false, file);
      assert.equal(source.includes("api.openai.com"), false, file);
      assert.equal(source.includes("127.0.0.1"), false, file);
    }
    const browser = readFileSync(new URL("./openaiProvider.ts", import.meta.url), "utf8");
    assert.equal(browser.includes("/api/openai/decision"), true);
    const laya = readFileSync(new URL("./layaProvider.ts", import.meta.url), "utf8");
    assert.equal(laya.includes("/api/laya/decision"), true);
  });
});
