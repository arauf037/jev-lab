import { GAME_CONFIG } from "./constants";
import type { DroneState, GateState } from "./types";

export interface AABB {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getDroneBounds(drone: DroneState): AABB {
  return {
    x: drone.x - GAME_CONFIG.droneWidth / 2,
    y: drone.y - GAME_CONFIG.droneHeight / 2,
    width: GAME_CONFIG.droneWidth,
    height: GAME_CONFIG.droneHeight,
  };
}

export function hitsBoundary(
  drone: DroneState,
  canvasHeight: number
): boolean {
  const half = GAME_CONFIG.droneHeight / 2;
  return drone.y - half <= 0 || drone.y + half >= canvasHeight;
}

export function hitsGate(drone: DroneState, gate: GateState): boolean {
  const bounds = getDroneBounds(drone);
  const overlapsX =
    bounds.x + bounds.width > gate.x && bounds.x < gate.x + gate.width;

  if (!overlapsX) return false;

  const gapTop = gate.gapCenterY - gate.gapSize / 2;
  const gapBottom = gate.gapCenterY + gate.gapSize / 2;

  const outsideGap =
    bounds.y < gapTop || bounds.y + bounds.height > gapBottom;

  return outsideGap;
}

export function checkCollisions(
  drone: DroneState,
  gates: GateState[],
  canvasHeight: number
): boolean {
  if (hitsBoundary(drone, canvasHeight)) return true;
  return gates.some((gate) => hitsGate(drone, gate));
}
