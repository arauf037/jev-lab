import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyFlap, applyGravity } from "./physics";
import { checkCollisions, hitsBoundary, hitsGate } from "./collision";
import { createTacticalState, projectTacticalState } from "./tactical";
import { GameEngine } from "./gameEngine";
import type { DroneState, GateState, GameState } from "./types";
import { GAME_CONFIG } from "./constants";

function makeDrone(overrides: Partial<DroneState> = {}): DroneState {
  return {
    x: 200,
    y: 300,
    velocityY: 0,
    velocityX: 3.2,
    rotation: 0,
    alive: true,
    ...overrides,
  };
}

describe("physics", () => {
  it("flap sets upward impulse", () => {
    const drone = makeDrone({ velocityY: 5 });
    applyFlap(drone);
    assert.equal(drone.velocityY, GAME_CONFIG.flapImpulse);
  });

  it("gravity increases downward velocity and y", () => {
    const drone = makeDrone({ velocityY: 0, y: 100 });
    applyGravity(drone, 1);
    assert.ok(drone.velocityY > 0);
    assert.ok(drone.y > 100);
  });

  it("one decision window stays inside half a gate opening", () => {
    const frames = 30;
    const falling = makeDrone({ velocityY: 0, y: 200 });
    for (let i = 0; i < frames; i += 1) applyGravity(falling, 1);
    const fallen = falling.y - 200;
    assert.ok(fallen > 0);
    assert.ok(fallen < GAME_CONFIG.initialGapSize / 2);

    const climbed = makeDrone({ velocityY: 0, y: 280 });
    applyFlap(climbed);
    for (let i = 0; i < frames; i += 1) applyGravity(climbed, 1);
    const rise = 280 - climbed.y;
    assert.ok(rise > 0);
    assert.ok(rise < GAME_CONFIG.initialGapSize / 2);
  });
});

describe("collision", () => {
  it("detects top/bottom boundary hits", () => {
    assert.equal(hitsBoundary(makeDrone({ y: 2 }), 560), true);
    assert.equal(hitsBoundary(makeDrone({ y: 558 }), 560), true);
    assert.equal(hitsBoundary(makeDrone({ y: 280 }), 560), false);
  });

  it("detects gate collision outside gap", () => {
    const gate: GateState = {
      id: "g1",
      x: 180,
      gapCenterY: 280,
      gapSize: 120,
      width: 72,
      passed: false,
    };
    assert.equal(hitsGate(makeDrone({ x: 200, y: 100 }), gate), true);
    assert.equal(hitsGate(makeDrone({ x: 200, y: 280 }), gate), false);
  });

  it("checkCollisions combines boundary and gates", () => {
    const gates: GateState[] = [
      {
        id: "g1",
        x: 180,
        gapCenterY: 280,
        gapSize: 120,
        width: 72,
        passed: false,
      },
    ];
    assert.equal(checkCollisions(makeDrone({ y: 280 }), gates, 560), false);
    assert.equal(checkCollisions(makeDrone({ y: 40 }), gates, 560), true);
  });
});

describe("tactical projection", () => {
  it("projects compact tactical state from game state", () => {
    const engine = new GameEngine(900, 560);
    engine.dispatch({ type: "START" });
    const state = engine.getState();
    const tactical = createTacticalState(state, state.elapsedMs);
    assert.equal(typeof tactical.altitude, "number");
    assert.equal(typeof tactical.nextGateDistance, "number");
    assert.equal(typeof tactical.gapSize, "number");
    assert.equal(tactical.droneAlive, true);
    assert.ok(tactical.nextGateDistance > 0);
  });

  it("projects the pose forward by the decision lead time", () => {
    const projected = projectTacticalState(
      {
        altitude: 200,
        verticalVelocity: -4,
        nextGateDistance: 300,
        gapCenterY: 280,
        gapSize: 180,
        relativeGapOffset: 40,
        horizontalVelocity: 1.2,
        recentFlaps: 1,
        timeSinceLastFlapMs: 100,
        droneAlive: true,
      },
      800
    );
    assert.ok(projected.altitude > 200);
    assert.ok(projected.relativeGapOffset < 40);
    assert.ok(projected.nextGateDistance < 300);
  });

  it("keeps the current opening when the lead would pass it", () => {
    const projected = projectTacticalState(
      {
        altitude: 220,
        verticalVelocity: 0,
        nextGateDistance: 20,
        gapCenterY: 200,
        gapSize: 180,
        relativeGapOffset: 10,
        horizontalVelocity: 1.2,
        recentFlaps: 0,
        timeSinceLastFlapMs: 9999,
        droneAlive: true,
        followingGapCenterY: 320,
        followingGateDistance: 300,
        followingGapSize: 180,
      },
      800
    );
    assert.equal(projected.nextGateDistance, 0);
    assert.equal(projected.gapCenterY, 200);
    assert.ok(projected.relativeGapOffset > 10);
  });
});

describe("game engine", () => {
  it("passing a gate increases score", () => {
    const engine = new GameEngine(900, 560);
    engine.dispatch({ type: "START" });
    const state = engine.getState() as GameState;
    const gate = state.gates[0];
    gate.x = state.drone.x - gate.width - 1;
    gate.passed = false;
    const before = state.score;
    // Force one update tick while running
    for (let i = 0; i < 3; i += 1) engine.update(16);
    assert.ok(engine.getState().score >= before + 100);
  });

  it("reset restores alive drone and zero score", () => {
    const engine = new GameEngine(900, 560);
    engine.dispatch({ type: "START" });
    engine.getState().score = 500;
    engine.dispatch({ type: "RESET" });
    const state = engine.getState();
    assert.equal(state.score, 0);
    assert.equal(state.drone.alive, true);
  });
});
