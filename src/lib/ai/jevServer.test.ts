import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { TacticalState } from "../game/types";
import { isJevConfigured } from "../config";
import {
  DEFAULT_JEV_MODEL,
  OPENROUTER_DECISIONS_URL,
  buildJevDecisionsRequest,
  callJevDecision,
  parseJevDecisionsResponse,
} from "./jevServer";

function sampleState(): TacticalState {
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

describe("browser boundary", () => {
  it("does not reference the OpenRouter key in the browser provider", () => {
    const source = readFileSync(new URL("./jevProvider.ts", import.meta.url), "utf8");
    assert.equal(source.includes("OPENROUTER_API_KEY"), false);
    assert.equal(source.includes("openrouter.ai"), false);
    assert.equal(source.includes("/api/jev/decision"), true);
  });
});
