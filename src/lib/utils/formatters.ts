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

export function explainStaleReason(reason: string | undefined): string {
  switch (reason) {
    case "too_old":
      return "too old, over 1000ms";
    case "above_opening":
      return "already above the opening";
    case "second_flap":
      return "second flap blocked";
    case "previous_flight":
      return "previous flight";
    case "replaced":
      return "replaced by a newer request";
    default:
      return "discarded";
  }
}

export function formatUsd(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "unavailable";
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(6)}`;
  return `$${value.toFixed(4)}`;
}

export function formatRate(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}
