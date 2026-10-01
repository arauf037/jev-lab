export function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return "N/A";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatPercent(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return `${Math.round(value * 100)}%`;
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatAction(action: string): string {
  return action.toUpperCase();
}
