import type { TacticalDecision } from "./decisionProvider";
import type { TacticalState } from "@/lib/game/types";
import { getOpenAIModel } from "@/lib/config";
import { estimateOpenAICostUsd } from "./openaiPricing";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

const ACTION_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["FLAP", "WAIT"] },
  },
  required: ["action"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are controlling a drone in a real-time obstacle course.
Given the current tactical state, choose exactly one action: FLAP or WAIT.
Return only the structured action.

Field meanings, matching the tactical state JSON:
- altitude: pixels above the floor
- verticalVelocity: positive means falling
- nextGateDistance: pixels to the next opening
- gapCenterY: vertical center of the opening
- gapSize: opening height in pixels
- relativeGapOffset: drone y minus the opening center; positive means the drone is below the center
- horizontalVelocity: forward speed
- recentFlaps: flaps in the recent window
- timeSinceLastFlapMs: milliseconds since the last flap
- droneAlive: whether the drone is still flying
- timeToGateMs: milliseconds until the drone reaches the opening, when present
- predictedOffsetAtGate: predicted relativeGapOffset at the opening, when present
- gapMargin: remaining pixels inside the opening, when present

FLAP applies one upward impulse. WAIT does not flap.`;

export function buildOpenAIDecisionRequest(state: TacticalState, model = getOpenAIModel()) {
  return {
    model,
    temperature: 0,
    max_output_tokens: 32,
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(state) },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "tactical_action",
        strict: true,
        schema: ACTION_SCHEMA,
      },
    },
  };
}

export async function callOpenAIDecision(state: TacticalState): Promise<TacticalDecision> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const model = getOpenAIModel();
  const started = Date.now();
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildOpenAIDecisionRequest(state, model)),
  });
  const latencyMs = Date.now() - started;

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenAI responses error ${response.status}: ${text.slice(0, 200)}`);
  }

  const data: unknown = await response.json();
  return parseOpenAIDecisionResponse(data, latencyMs, model);
}

export function parseOpenAIDecisionResponse(
  data: unknown,
  latencyMs: number,
  model: string
): TacticalDecision {
  const text = extractOpenAIActionText(data);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Invalid OpenAI response");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid OpenAI response");
  }
  const actionRaw = (parsed as { action?: unknown }).action;
  if (actionRaw !== "FLAP" && actionRaw !== "WAIT") {
    throw new Error("Invalid OpenAI response");
  }

  const usage = readUsage(data);
  const estimatedCostUsd =
    usage.inputTokens != null && usage.outputTokens != null
      ? estimateOpenAICostUsd(model, {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cachedInputTokens: usage.cachedInputTokens,
        })
      : undefined;

  return {
    action: actionRaw === "FLAP" ? "flap" : "wait",
    latencyMs,
    provider: "openai",
    timestamp: Date.now(),
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    estimatedCostUsd,
  };
}

export function extractOpenAIActionText(data: unknown): string {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid OpenAI response");
  }
  const record = data as Record<string, unknown>;
  if (typeof record.output_text === "string" && record.output_text.trim()) {
    return record.output_text;
  }
  if (Array.isArray(record.output)) {
    for (const item of record.output) {
      if (!item || typeof item !== "object") continue;
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        const text = (part as { text?: unknown }).text;
        if (typeof text === "string" && text.trim()) return text;
      }
    }
  }
  const choices = record.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === "object") {
    const content = (choices[0] as { message?: { content?: unknown } }).message?.content;
    if (typeof content === "string" && content.trim()) return content;
  }
  throw new Error("Invalid OpenAI response");
}

function readUsage(data: unknown): {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
} {
  if (!data || typeof data !== "object") return {};
  const usage = (data as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return {};
  const record = usage as Record<string, unknown>;
  const inputTokens = finiteNumber(record.input_tokens ?? record.prompt_tokens);
  const outputTokens = finiteNumber(record.output_tokens ?? record.completion_tokens);
  const totalTokens =
    finiteNumber(record.total_tokens) ??
    (inputTokens != null && outputTokens != null ? inputTokens + outputTokens : undefined);
  const inputDetails = record.input_tokens_details ?? record.prompt_tokens_details;
  const cachedInputTokens =
    inputDetails && typeof inputDetails === "object"
      ? finiteNumber((inputDetails as { cached_tokens?: unknown }).cached_tokens)
      : undefined;
  return { inputTokens, outputTokens, totalTokens, cachedInputTokens };
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
