import { GAME_CONFIG } from "@/lib/game/constants";
import type { TacticalState } from "@/lib/game/types";
import type { TacticalDecision } from "./decisionProvider";

/** Small zero-shot model. Runs in the browser only after Jev does not answer. */
export const LOCAL_BACKUP_MODEL = "Xenova/mobilebert-uncased-mnli";

export type LocalModelStatus = "loading" | "ready" | "unavailable";

type ZeroShotResult = { labels: string[]; scores: number[] };

type Classifier = (text: string, labels: string[]) => Promise<ZeroShotResult>;

let classifier: Classifier | null = null;
let loading: Promise<LocalModelStatus> | null = null;

function climbPixels(): number {
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

function premise(state: TacticalState): string {
  const offset = Math.round(state.relativeGapOffset);
  const place =
    offset > 8
      ? `${offset} pixels below the opening center`
      : offset < -8
        ? `${Math.abs(offset)} pixels above the opening center`
        : "on the opening center";
  const half = Math.round(state.gapSize / 2);
  const climb = climbPixels();
  const after = offset - climb;
  const hurdle =
    after < -half
      ? "one flap would carry the drone above the opening"
      : "one flap still leaves the drone inside the opening";
  return `The drone is ${place}. The opening extends ${half} pixels above and below its center. One flap climbs about ${climb} pixels, and ${hurdle}. The gate is ${Math.round(state.nextGateDistance)} pixels away.`;
}

/**
 * Start the download during page load. The flight loop does not wait for this.
 * Returns ready, or unavailable when the model cannot run in this environment.
 */
export function preloadLocalModel(): Promise<LocalModelStatus> {
  if (classifier) return Promise.resolve("ready");
  if (typeof window === "undefined") return Promise.resolve("unavailable");
  if (loading) return loading;

  loading = (async () => {
    try {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.allowLocalModels = false;
      const model = await pipeline("zero-shot-classification", LOCAL_BACKUP_MODEL);
      classifier = async (text, labels) => {
        const raw = await model(text, labels);
        const result = Array.isArray(raw) ? raw[0] : raw;
        return {
          labels: result.labels,
          scores: result.scores,
        };
      };
      return "ready";
    } catch (error) {
      console.warn("Local backup model failed to load", error);
      classifier = null;
      return "unavailable";
    } finally {
      loading = null;
    }
  })();

  return loading;
}

export function localModelStatus(): LocalModelStatus {
  if (classifier) return "ready";
  if (typeof window === "undefined") return "unavailable";
  return loading ? "loading" : "unavailable";
}

/**
 * Local transformer decision. Null means the model is not loaded yet,
 * so the caller keeps the heuristic backup.
 */
export async function decideWithLocalModel(
  state: TacticalState
): Promise<TacticalDecision | null> {
  if (!classifier) return null;
  const started = performance.now();
  const result = await classifier(premise(state), [
    "flap, the drone should hop upward",
    "wait, the drone should not hop",
  ]);
  const flapIndex = result.labels.findIndex((label) => label.startsWith("flap"));
  const waitIndex = result.labels.findIndex((label) => label.startsWith("wait"));
  const flap = flapIndex >= 0 ? result.scores[flapIndex] ?? 0 : 0;
  const wait = waitIndex >= 0 ? result.scores[waitIndex] ?? 0 : 0;

  return {
    action: flap >= wait ? "flap" : "wait",
    probabilities: { flap, wait },
    confidence: Math.max(flap, wait),
    latencyMs: Math.round(performance.now() - started),
    provider: "local",
    timestamp: Date.now(),
    isFallback: true,
  };
}
