export const publicConfig = {
  decisionIntervalMs: 70,
  analystIntervalMs: 10000,
  maxDecisionHistory: 20,
};

export type PilotSelection = "jev" | "openai" | "mock" | "laya";

export function isJevConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/** Local Laya sidecar is always addressable; no API key required. */
export function isLayaConfigured(): boolean {
  return Boolean(getLayaBaseUrl());
}

export const DEFAULT_LAYA_HOST = "127.0.0.1";
export const DEFAULT_LAYA_PORT = "8000";
export const DEFAULT_LAYA_PATH = "/v1/systemone";

/** Base URL for the local Laya HTTP sidecar (no trailing slash or path). */
export function getLayaBaseUrl(): string {
  const explicit = process.env.LAYA_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const host = process.env.LAYA_HOST?.trim() || DEFAULT_LAYA_HOST;
  const port = process.env.LAYA_PORT?.trim() || DEFAULT_LAYA_PORT;
  return `http://${host}:${port}`;
}

/** Full Decisions/ask URL for the local Laya sidecar. */
export function getLayaDecisionsUrl(): string {
  const base = getLayaBaseUrl();
  if (/\/(ask|v1\/ask|v1\/systemone)$/i.test(base)) return base;
  return `${base}${DEFAULT_LAYA_PATH}`;
}

/** Current low-latency mini with structured outputs. `gpt-4-mini` is not an API model id. */
export const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";

export function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

export function getServerAiProvider(): "jev" | "mock" {
  const explicit = process.env.AI_PROVIDER?.toLowerCase();
  if (explicit === "jev" || explicit === "mock") return explicit;
  return isJevConfigured() ? "jev" : "mock";
}

/**
 * Which pilot the lab starts on. The Jev route itself is unchanged:
 * the browser selects the route, and an unconfigured choice stays on mock.
 */
export function getDecisionProvider(): PilotSelection {
  const explicit = process.env.DECISION_PROVIDER?.toLowerCase();
  if (explicit === "mock") return "mock";
  if (explicit === "openai") return isOpenAIConfigured() ? "openai" : "mock";
  if (explicit === "jev") return isJevConfigured() ? "jev" : "mock";
  if (explicit === "laya") return isLayaConfigured() ? "laya" : "mock";

  const legacy = getServerAiProvider();
  if (legacy === "jev" && isJevConfigured()) return "jev";
  return "mock";
}

export function isLlmConfigured(): boolean {
  return Boolean(process.env.LLM_API_KEY);
}
