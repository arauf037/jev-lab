import { GAME_CONFIG } from "./constants";
import { getGapSize } from "./physics";
import type { GateState } from "./types";

let gateSeq = 0;

function nextGateId(): string {
  gateSeq += 1;
  return `gate-${gateSeq}`;
}

export function createGate(
  x: number,
  canvasHeight: number,
  elapsedMs: number,
  previousCenter?: number
): GateState {
  const gapSize = getGapSize(elapsedMs);
  const margin = gapSize / 2 + 40;
  const minCenter = margin;
  const maxCenter = canvasHeight - margin;
  // Keep the next opening within one flap-and-fall of the last one.
  // A full-canvas jump cannot be corrected before the gate arrives.
  const maxStep = 72;
  const gapCenterY =
    previousCenter == null
      ? minCenter + Math.random() * Math.max(1, maxCenter - minCenter)
      : Math.max(
          minCenter,
          Math.min(
            maxCenter,
            previousCenter + (Math.random() * 2 - 1) * maxStep
          )
        );

  return {
    id: nextGateId(),
    x,
    gapCenterY,
    gapSize,
    width: GAME_CONFIG.gateWidth,
    passed: false,
  };
}

export function seedGates(
  canvasWidth: number,
  canvasHeight: number,
  droneX: number
): GateState[] {
  const gates: GateState[] = [];
  let x = droneX + 320;

  for (let i = 0; i < 4; i += 1) {
    gates.push(createGate(x, canvasHeight, 0, gates.at(-1)?.gapCenterY));
    x += GAME_CONFIG.gateSpacing;
  }

  return gates;
}

export function maintainGates(
  gates: GateState[],
  droneX: number,
  canvasHeight: number,
  elapsedMs: number
): GateState[] {
  const next = gates.filter((gate) => gate.x + gate.width > droneX - 120);

  while (next.length < 4) {
    const last = next[next.length - 1];
    const x = last
      ? last.x + GAME_CONFIG.gateSpacing
      : droneX + GAME_CONFIG.gateSpacing;
    next.push(createGate(x, canvasHeight, elapsedMs, last?.gapCenterY));
  }

  return next;
}

export function findNextGate(
  gates: GateState[],
  droneX: number
): GateState | null {
  for (const gate of gates) {
    if (gate.x + gate.width > droneX) {
      return gate;
    }
  }
  return null;
}
