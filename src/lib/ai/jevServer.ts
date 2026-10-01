import type { TacticalState } from "@/lib/game/types";
import { GAME_CONFIG } from "@/lib/game/constants";
import type { TacticalDecision } from "./decisionProvider";

/**
 * OpenRouter Decisions API for Jev.
 * Docs: https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request
 * Guide: https://openrouter.ai/docs/guides/community/jev
 *
 * This is not the chat-completions API. Jev returns typed answers.
 */
export const OPENROUTER_DECISIONS_URL =
  "https://openrouter.ai/api/alpha/decisions";

export const DEFAULT_JEV_MODEL = "typesafe/jev-1.13";

interface JevChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

export interface JevDecisionsRequest {
  model: string;
  state: {
    task: string;
    ifYouWait: string;
    oneFlap: string;
    telemetry: TacticalState;
  };
  questions: {
    action: JevChoiceQuestion;
  };
}

interface JevChoiceAnswer {
  type: "choice";
  choice: string;
  probabilities?: Record<string, number>;
  confidence?: number;
}

export function getOpenRouterApiKey(): string | undefined {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  return key || undefined;
}

export function getJevModel(): string {
  const model = process.env.JEV_MODEL?.trim();
  return model || DEFAULT_JEV_MODEL;
}

export function describeTacticalSituation(state: TacticalState): string {
  return forecastIfWaiting(state);
}

/** Pixels of climb one flap produces over a typical decision interval. */
export function flapClimbOverDecision(): number {
  const frames = 30;
  let velocity: number = GAME_CONFIG.flapImpulse;
  let deltaY = 0;
  for (let i = 0; i < frames; i += 1) {
    velocity = Math.max(
      -GAME_CONFIG.maxUpwardSpeed,
      Math.min(GAME_CONFIG.maxVelocityY, velocity + GAME_CONFIG.gravity)
    );
    deltaY += velocity;
  }
  return Math.round(-deltaY);
}

function placePhrase(offset: number): string {
  if (offset > 8) return `${Math.round(offset)}px below the opening center`;
  if (offset < -8) return `${Math.round(-offset)}px above the opening center`;
  return "on the opening center";
}

/** Extra drop if WAIT is held through one more decision window. */
function waitDrop(verticalVelocity: number): number {
  const frames = 30;
  let velocity = verticalVelocity;
  let deltaY = 0;
  for (let i = 0; i < frames; i += 1) {
    velocity = Math.max(
      -GAME_CONFIG.maxUpwardSpeed,
      Math.min(GAME_CONFIG.maxVelocityY, velocity + GAME_CONFIG.gravity)
    );
    deltaY += velocity;
  }
  return deltaY;
}

/** Climb of one flap versus the next opening, both in pixels. */
export function describeFlapAgainstOpening(
  state: TacticalState,
  climb = flapClimbOverDecision()
): string {
  const half = Math.round(state.gapSize / 2);
  const offset = state.relativeGapOffset;
  const afterFlap = offset - climb;
  const compared =
    afterFlap < -half
      ? "would carry the drone above the opening"
      : offset > 8
        ? `covers the ${Math.round(offset)}px below the center and still leaves the drone inside the opening`
        : "would move the drone farther above the center";

  return `One FLAP climbs about ${climb}px. The next opening extends ${half}px above and below its center. Compared with this hurdle, that climb ${compared}. WAIT lets gravity pull the drone down.`;
}

export function forecastIfWaiting(state: TacticalState): string {
  const floor =
    state.altitude < 80
      ? "close to the floor"
      : state.altitude > 420
        ? "close to the ceiling"
        : "clear of the floor";
  const motion =
    state.verticalVelocity > 0.5
      ? "falling"
      : state.verticalVelocity < -0.5
        ? "rising"
        : "level";
  const seconds = Math.max(
    0,
    state.nextGateDistance / (Math.max(state.horizontalVelocity, 0.2) * 60)
  );
  const laterOffset = state.relativeGapOffset + waitDrop(state.verticalVelocity);
  const half = state.gapSize / 2;
  const later =
    laterOffset > half
      ? "below the opening"
      : laterOffset < -half
        ? "above the opening"
        : "inside the opening";

  const atGate =
    typeof state.predictedOffsetAtGate === "number"
      ? ` With no flap, the engine predicts ${placePhrase(state.predictedOffsetAtGate)} at the gate.`
      : "";

  return `If you WAIT, the drone is ${placePhrase(state.relativeGapOffset)}, ${floor}, and ${motion}. The gate arrives in ${seconds.toFixed(1)}s. One more WAIT leaves the drone ${later}.${atGate}`;
}

export function buildJevDecisionsRequest(
  state: TacticalState
): JevDecisionsRequest {
  const climb = flapClimbOverDecision();
  return {
    model: getJevModel(),
    state: {
      task: "Fly the drone through the gate openings. ifYouWait says where the drone is and where one more WAIT leaves it. Do not add any further prediction.",
      ifYouWait: forecastIfWaiting(state),
      oneFlap: describeFlapAgainstOpening(state, climb),
      telemetry: state,
    },
    questions: {
      action: {
        type: "choice",
        instructions:
          "Use ifYouWait and oneFlap only. Compare the FLAP climb with the opening height. FLAP when the drone is below the opening center and that climb still leaves it inside the opening, or one more WAIT leaves it below the opening, or it is close to the floor. WAIT when that climb would carry the drone above the opening, or the drone is already on or above the opening center and one more WAIT leaves it inside or above the opening, and it is clear of the floor. FLAP never moves the drone downward.",
        criteria: {
          flap: "The drone is below the opening center and one FLAP still leaves it inside the opening, or one more WAIT leaves it below the opening, or it is close to the floor.",
          wait: "One FLAP would carry the drone above the opening, or the drone is on or above the opening center and one more WAIT leaves it inside or above the opening, and it is clear of the floor.",
        },
      },
    },
  };
}

/**
 * Server-only Jev call through OpenRouter.
 * The OpenRouter API key is read here and must never be sent to the browser.
 */
export async function callJevDecision(
  state: TacticalState
): Promise<TacticalDecision> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const started = Date.now();
  const requestBody = buildJevDecisionsRequest(state);

  const response = await fetch(OPENROUTER_DECISIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const latencyMs = Date.now() - started;

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `OpenRouter Decisions API error ${response.status}: ${text.slice(0, 200)}`
    );
  }

  const data: unknown = await response.json();
  return parseJevDecisionsResponse(data, latencyMs);
}

export function parseJevDecisionsResponse(
  data: unknown,
  latencyMs: number
): TacticalDecision {
  if (!data || typeof data !== "object") {
    throw new Error("Jev response was not a decisions object");
  }

  const record = data as Record<string, unknown>;
  if (!record.answers || typeof record.answers !== "object") {
    throw new Error("Jev response missing choice answer");
  }

  const answer = (record.answers as Record<string, unknown>).action;
  if (!answer || typeof answer !== "object") {
    throw new Error("Jev response missing choice answer");
  }

  const choiceAnswer = answer as Partial<JevChoiceAnswer>;
  if (choiceAnswer.type !== "choice") {
    throw new Error("Jev response missing choice answer");
  }

  const actionRaw = choiceAnswer.choice?.toLowerCase();
  if (actionRaw !== "flap" && actionRaw !== "wait") {
    throw new Error(`Unexpected Jev choice: ${choiceAnswer.choice}`);
  }

  const flap = readProbability(choiceAnswer.probabilities, "flap");
  const wait = readProbability(choiceAnswer.probabilities, "wait");

  return {
    action: actionRaw,
    probabilities: flap != null && wait != null ? { flap, wait } : undefined,
    confidence:
      typeof choiceAnswer.confidence === "number" &&
      Number.isFinite(choiceAnswer.confidence)
        ? choiceAnswer.confidence
        : undefined,
    latencyMs,
    provider: "jev",
    timestamp: Date.now(),
  };
}

function readProbability(
  probabilities: Record<string, number> | undefined,
  key: "flap" | "wait"
): number | undefined {
  if (!probabilities) return undefined;
  const direct = probabilities[key];
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  const match = Object.entries(probabilities).find(
    ([name]) => name.toLowerCase() === key
  );
  if (match && typeof match[1] === "number" && Number.isFinite(match[1])) {
    return match[1];
  }
  return undefined;
}
