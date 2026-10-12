/**
 * Published OpenAI text-token prices in USD per 1M tokens.
 * Source: https://developers.openai.com/api/docs/models/gpt-4.1-mini
 * (checked 2026-10-01). Models missing from this table do not get a cost.
 */
const USD_PER_MILLION: Record<string, { input: number; cachedInput: number; output: number }> = {
  "gpt-4.1-mini": { input: 0.4, cachedInput: 0.1, output: 1.6 },
  "gpt-4.1-mini-2025-04-14": { input: 0.4, cachedInput: 0.1, output: 1.6 },
};

export function estimateOpenAICostUsd(
  model: string,
  usage: { inputTokens: number; outputTokens: number; cachedInputTokens?: number }
): number | undefined {
  const price = USD_PER_MILLION[model];
  if (!price) return undefined;
  if (!Number.isFinite(usage.inputTokens) || !Number.isFinite(usage.outputTokens)) return undefined;
  const cached = Math.max(0, Math.min(usage.cachedInputTokens ?? 0, usage.inputTokens));
  const fresh = usage.inputTokens - cached;
  return (fresh / 1_000_000) * price.input + (cached / 1_000_000) * price.cachedInput + (usage.outputTokens / 1_000_000) * price.output;
}
