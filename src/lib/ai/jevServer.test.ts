import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { TacticalState } from "../game/types";
import { isJevConfigured } from "../config";
import {
  DEFAULT_JEV_MODEL,
  DEFAULT_LAYA_MODEL,
  OPENROUTER_DECISIONS_URL,
  buildJevDecisionsRequest,
  buildLayaDecisionsRequest,
  callJevDecision,
  callLayaDecision,
  getLayaDecisionsUrl,
  layaNeedsLift,
  parseJevDecisionsResponse,
} from "./jevServer";

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

describe("OpenRouter Jev decisions request", () => {
  it("sends a typed choice question for typesafe/jev-1.13", () => {
    const previous = process.env.JEV_MODEL;
    delete process.env.JEV_MODEL;
    try {
      const body = buildJevDecisionsRequest(sampleState());
      assert.equal(body.model, DEFAULT_JEV_MODEL);
      assert.equal(body.model, "typesafe/jev-1.13");
      assert.equal(body.questions.action.type, "choice");
      assert.equal(typeof body.questions.action.instructions, "string");
      assert.equal(
        body.questions.action.criteria.flap.length > 0 &&
          body.questions.action.criteria.wait.length > 0,
        true
      );
      assert.equal(body.state.telemetry.altitude, 250);
      assert.match(body.state.ifYouWait, /below the opening center/);
      assert.match(body.state.ifYouWait, /clear of the floor/);
      assert.match(body.state.oneFlap, /FLAP climbs/);
      assert.equal(body.questions.action.instructions.includes("Prefer WAIT"), false);
      assert.equal(body.questions.action.instructions.includes("25px"), false);
      assert.equal("messages" in body, false);
      assert.equal("response_format" in body, false);
    } finally {
      if (previous === undefined) delete process.env.JEV_MODEL;
      else process.env.JEV_MODEL = previous;
    }
  });
});

describe("Laya decisions request", () => {
  it("uses a Laya-tuned needLift prompt and does not alter the Jev payload", () => {
    const below = sampleState({
      relativeGapOffset: 40,
      altitude: 220,
      verticalVelocity: 2,
      nextGateDistance: 140,
      predictedOffsetAtGate: 55,
    });
    const above = sampleState({
      relativeGapOffset: -45,
      altitude: 340,
      verticalVelocity: -1.2,
      predictedOffsetAtGate: -20,
    });
    const floor = sampleState({ relativeGapOffset: 10, altitude: 45 });
    // Below now and rising through the center → wait (do not stack climb).
    const risingThrough = sampleState({
      relativeGapOffset: 12,
      altitude: 250,
      verticalVelocity: -2.4,
      nextGateDistance: 80,
      predictedOffsetAtGate: 40,
    });
    // Below, falling, predicted below at gate → flap.
    const fallingBelow = sampleState({
      relativeGapOffset: 20,
      altitude: 240,
      verticalVelocity: 1.5,
      nextGateDistance: 120,
      predictedOffsetAtGate: 45,
    });
    // Near center with a large predicted fall — WAIT (overshoot into pipe_top).
    const nearCenterOverpredict = sampleState({
      relativeGapOffset: -7,
      altitude: 270,
      verticalVelocity: 1,
      nextGateDistance: 150,
      predictedOffsetAtGate: 110,
    });
    // Past the leading edge — WAIT (flap hits the top lip).
    const insidePipe = sampleState({
      relativeGapOffset: 25,
      altitude: 220,
      verticalVelocity: 2,
      nextGateDistance: -30,
      gapSize: 174,
      predictedOffsetAtGate: 25,
    });
    // Deep below center — keep lifting even through a mild climb.
    const deepBelow = sampleState({
      relativeGapOffset: 55,
      altitude: 180,
      verticalVelocity: -1.2,
      nextGateDistance: 100,
      gapSize: 174,
      predictedOffsetAtGate: 40,
    });
    const jev = buildJevDecisionsRequest(below);
    const laya = buildLayaDecisionsRequest(below);

    assert.equal(laya.model, DEFAULT_LAYA_MODEL);
    assert.equal(laya.questions.action.instructions, "Use needLift only.");
    assert.deepEqual(laya.questions.action.criteria, {
      flap: "needLift=true",
      wait: "needLift=false",
    });
    assert.equal(laya.state.needLift, true);
    assert.equal(laya.state.belowCenter, true);
    assert.equal(typeof laya.state.predictedOffsetAtGate, "number");
    assert.equal(buildLayaDecisionsRequest(above).state.needLift, false);
    assert.equal(buildLayaDecisionsRequest(above).state.alreadyAboveCenter, true);
    assert.equal(buildLayaDecisionsRequest(floor).state.needLift, true);
    assert.equal(layaNeedsLift(risingThrough), false);
    assert.equal(buildLayaDecisionsRequest(risingThrough).state.needLift, false);
    assert.equal(layaNeedsLift(fallingBelow), true);
    assert.equal(layaNeedsLift(nearCenterOverpredict), false);
    assert.equal(layaNeedsLift(insidePipe), false);
    assert.equal(layaNeedsLift(deepBelow), true);

    // OpenRouter Jev stays on the long criteria — Laya changes must not leak.
    assert.match(jev.questions.action.instructions, /Compare the FLAP climb/);
    assert.match(jev.questions.action.criteria.flap, /below the opening center/);
    assert.equal("needLift" in jev.state, false);
    assert.notDeepEqual(laya.questions, jev.questions);
  });
});

describe("OpenRouter Jev decisions response", () => {
  it("maps a choice answer onto flap/wait probabilities", () => {
    const decision = parseJevDecisionsResponse(
      {
        id: "gen-dec-1",
        model: "typesafe/jev-1.13-20260917",
        provider: "TypeSafe",
        answers: {
          action: {
            type: "choice",
            choice: "flap",
            confidence: 0.81,
            probabilities: { flap: 0.9, wait: 0.1 },
          },
        },
        usage: { input_tokens: 120, output_tokens: 12, cost: 0.00001 },
      },
      42
    );

    assert.equal(decision.action, "flap");
    assert.deepEqual(decision.probabilities, { flap: 0.9, wait: 0.1 });
    assert.equal(decision.confidence, 0.81);
    assert.equal(decision.latencyMs, 42);
    assert.equal(decision.provider, "jev");
  });

  it("rejects chat-completions payloads", () => {
    assert.throws(
      () =>
        parseJevDecisionsResponse(
          {
            choices: [
              { message: { role: "assistant", content: '{"action":"flap"}' } },
            ],
          },
          1
        ),
      /missing choice answer/
    );
  });

  it("rejects a choice outside flap/wait", () => {
    assert.throws(
      () =>
        parseJevDecisionsResponse(
          {
            answers: {
              action: {
                type: "choice",
                choice: "payments",
                confidence: 0.5,
                probabilities: { payments: 1 },
              },
            },
          },
          1
        ),
      /Unexpected Jev choice/
    );
  });
});

describe("Laya decisions response", () => {
  it("parses a FastAPI-shaped sidecar payload as provider laya", () => {
    const decision = parseJevDecisionsResponse(
      {
        ok: true,
        model: "typed-decisions",
        answers: {
          action: {
            question_id: "action",
            type: "choice",
            choice: "wait",
            confidence: 0.72,
            probabilities: { flap: 0.25, wait: 0.75 },
          },
        },
        usage: {
          input_tokens_padded: 96,
          output_tokens: 4,
          questions: 1,
        },
        latency_ms: 18.5,
      },
      33,
      "laya"
    );

    assert.equal(decision.action, "wait");
    assert.deepEqual(decision.probabilities, { flap: 0.25, wait: 0.75 });
    assert.equal(decision.confidence, 0.72);
    assert.equal(decision.latencyMs, 33);
    assert.equal(decision.provider, "laya");
    assert.equal(decision.model, "typed-decisions");
    assert.equal(decision.inputTokens, 96);
    assert.equal(decision.outputTokens, 4);
    assert.equal(decision.totalTokens, 100);
  });
});

describe("OpenRouter Jev HTTP call", () => {
  it("posts to the decisions endpoint with a bearer key that stays out of the body", async () => {
    const previousKey = process.env.OPENROUTER_API_KEY;
    const previousModel = process.env.JEV_MODEL;
    const previousFetch = globalThis.fetch;
    process.env.OPENROUTER_API_KEY = "sk-or-test-key";
    process.env.JEV_MODEL = "typesafe/jev-1.13";

    let capturedUrl = "";
    let capturedBody = "";
    let authorization = "";

    globalThis.fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedBody = String(init?.body ?? "");
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return new Response(
        JSON.stringify({
          answers: {
            action: {
              type: "choice",
              choice: "wait",
              confidence: 0.6,
              probabilities: { flap: 0.2, wait: 0.8 },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    try {
      const decision = await callJevDecision(sampleState());
      assert.equal(capturedUrl, OPENROUTER_DECISIONS_URL);
      assert.equal(authorization, "Bearer sk-or-test-key");
      assert.equal(capturedBody.includes("sk-or-test-key"), false);
      assert.equal(capturedBody.includes('"messages"'), false);
      const parsed = JSON.parse(capturedBody) as { model: string };
      assert.equal(parsed.model, "typesafe/jev-1.13");
      assert.equal(decision.action, "wait");
      assert.equal(decision.provider, "jev");
    } finally {
      globalThis.fetch = previousFetch;
      if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = previousKey;
      if (previousModel === undefined) delete process.env.JEV_MODEL;
      else process.env.JEV_MODEL = previousModel;
    }
  });

  it("does not call OpenRouter when the key is missing", async () => {
    const previousKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    let called = false;
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      called = true;
      return new Response("{}", { status: 200 });
    };

    try {
      await assert.rejects(callJevDecision(sampleState()), /OPENROUTER_API_KEY/);
      assert.equal(called, false);
      assert.equal(isJevConfigured(), false);
    } finally {
      globalThis.fetch = previousFetch;
      if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = previousKey;
    }
  });
});

describe("Laya HTTP call", () => {
  it("posts typed-decisions to the local sidecar without an auth header", async () => {
    const previousFetch = globalThis.fetch;
    let capturedUrl = "";
    let authorization = "";
    let capturedBody = "";

    globalThis.fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedBody = String(init?.body ?? "");
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return new Response(
        JSON.stringify({
          ok: true,
          model: "typed-decisions",
          answers: {
            action: {
              type: "choice",
              choice: "flap",
              confidence: 0.9,
              probabilities: { flap: 0.88, wait: 0.12 },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    try {
      const decision = await callLayaDecision(sampleState());
      assert.equal(capturedUrl, getLayaDecisionsUrl());
      assert.equal(authorization, "");
      const parsed = JSON.parse(capturedBody) as { model: string };
      assert.equal(parsed.model, "typed-decisions");
      assert.equal(decision.action, "flap");
      assert.equal(decision.provider, "laya");
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

describe("browser boundary", () => {
  it("does not reference the OpenRouter key in the browser provider", () => {
    const source = readFileSync(new URL("./jevProvider.ts", import.meta.url), "utf8");
    assert.equal(source.includes("OPENROUTER_API_KEY"), false);
    assert.equal(source.includes("openrouter.ai"), false);
    assert.equal(source.includes("/api/jev/decision"), true);
  });

  it("keeps the Laya sidecar URL on the server route", () => {
    const source = readFileSync(new URL("./layaProvider.ts", import.meta.url), "utf8");
    assert.equal(source.includes("127.0.0.1"), false);
    assert.equal(source.includes("/api/laya/decision"), true);
  });
});
