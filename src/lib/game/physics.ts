import { GAME_CONFIG } from "./constants";
import type { DroneState } from "./types";

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function applyGravity(drone: DroneState, dtScale: number): void {
  drone.velocityY += GAME_CONFIG.gravity * dtScale;
  drone.velocityY = clamp(
    drone.velocityY,
    -GAME_CONFIG.maxUpwardSpeed,
    GAME_CONFIG.maxVelocityY
  );
  drone.y += drone.velocityY * dtScale;
  drone.rotation = clamp(drone.velocityY * 11, -28, 42);
}

export function applyFlap(drone: DroneState): void {
  drone.velocityY = GAME_CONFIG.flapImpulse;
}

export function getDifficulty(elapsedMs: number): number {
  return Math.min(1, elapsedMs / 120000);
}

export function getWorldSpeed(elapsedMs: number): number {
  const difficulty = getDifficulty(elapsedMs);
  return GAME_CONFIG.initialVelocityX + difficulty * 0.7;
}

export function getGapSize(elapsedMs: number): number {
  const difficulty = getDifficulty(elapsedMs);
  return (
    GAME_CONFIG.initialGapSize -
    difficulty * (GAME_CONFIG.initialGapSize - GAME_CONFIG.minGapSize)
  );
}
