export const publicConfig = {
  decisionIntervalMs: 70,
  analystIntervalMs: 10000,
  maxDecisionHistory: 20,
};

export function isJevConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

export function getServerAiProvider(): "jev" | "mock" {
  const explicit = process.env.AI_PROVIDER?.toLowerCase();
  if (explicit === "jev" || explicit === "mock") return explicit;
  return isJevConfigured() ? "jev" : "mock";
}

export function isLlmConfigured(): boolean {
  return Boolean(process.env.LLM_API_KEY);
}
