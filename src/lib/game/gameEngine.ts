import { BEST_SCORE_KEY, GAME_CONFIG } from "./constants";
import { checkCollisions } from "./collision";
import { maintainGates, seedGates } from "./obstacles";
import {
  applyFlap,
  applyGravity,
  getWorldSpeed,
} from "./physics";
import type {
  GameAction,
  GameMode,
  GameState,
  Particle,
  Star,
} from "./types";

function loadBestScore(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(BEST_SCORE_KEY);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

function saveBestScore(score: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch {
    // ignore storage failures
  }
}

function createStars(width: number, height: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < GAME_CONFIG.starCount; i += 1) {
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      depth: 0.2 + Math.random() * 0.8,
      size: 0.6 + Math.random() * 1.8,
      twinkle: Math.random() * Math.PI * 2,
    });
  }
  return stars;
}

export class GameEngine {
  private state: GameState;
  private particles: Particle[] = [];
  private stars: Star[] = [];
  private simTime = 0;
  private sessionId = 1;

  constructor(width = GAME_CONFIG.defaultCanvasWidth, height = GAME_CONFIG.defaultCanvasHeight) {
    this.state = this.createInitialState(width, height, "autopilot");
    this.stars = createStars(width, height);
  }

  getState(): GameState {
    return this.state;
  }

  getSessionId(): number {
    return this.sessionId;
  }

  getParticles(): Particle[] {
    return this.particles;
  }

  getStars(): Star[] {
    return this.stars;
  }

  resize(width: number, height: number): void {
    const prevH = this.state.canvasHeight;
    this.state.canvasWidth = width;
    this.state.canvasHeight = height;
    if (prevH > 0 && this.state.status !== "running") {
      this.state.drone.y = (this.state.drone.y / prevH) * height;
    }
    this.stars = createStars(width, height);
  }

  dispatch(action: GameAction): void {
    switch (action.type) {
      case "START":
        if (this.state.status === "idle" || this.state.status === "game_over") {
          this.reset(this.state.mode, true);
        } else if (this.state.status === "paused" && this.state.mode !== "lab") {
          this.state.status = "running";
        }
        break;
      case "FLAP":
        this.flap(true);
        break;
      case "WAIT":
        break;
      case "RESET":
        this.reset(this.state.mode, true);
        break;
      case "PAUSE":
        if (this.state.status === "running") {
          this.state.status = "paused";
        }
        break;
      case "RESUME":
        if (this.state.status === "paused" && this.state.mode !== "lab") {
          this.state.status = "running";
        }
        break;
      case "SET_MODE":
        this.setMode(action.mode);
        break;
    }
  }

  setMode(mode: GameMode): void {
    this.state.mode = mode;
    if (mode === "lab") {
      if (this.state.status === "idle" || this.state.status === "game_over") {
        this.reset(mode, false);
      }
      this.state.status = "paused";
    } else if (this.state.status === "paused") {
      this.state.status = "running";
    }
  }

  /** @param fromAutopilot when true, allows flap even in autopilot mode */
  flap(fromAutopilot = false): void {
    if (this.state.status === "idle") {
      this.reset(this.state.mode, true);
      // Starting a run via click/tap should not also force a flap in autopilot.
      if (this.state.mode !== "manual") return;
    }
    if (this.state.status === "game_over") return;
    if (this.state.mode === "lab") return;
    if (this.state.mode === "autopilot" && !fromAutopilot) return;
    if (this.state.status === "paused") {
      this.state.status = "running";
    }
    if (!this.state.drone.alive) return;

    applyFlap(this.state.drone);
    this.state.lastFlapAt = this.simTime;
    this.state.flapCount += 1;
    this.state.recentFlapTimes.push(this.simTime);
    if (this.state.recentFlapTimes.length > 12) {
      this.state.recentFlapTimes.shift();
    }
    this.spawnExhaust(true);
  }

  reset(mode: GameMode = this.state.mode, startRunning = true): void {
    this.sessionId += 1;
    const { canvasWidth, canvasHeight, bestScore } = this.state;
    this.state = this.createInitialState(canvasWidth, canvasHeight, mode, bestScore);
    this.particles = [];
    this.simTime = 0;
    if (mode === "lab") {
      this.state.status = "paused";
    } else if (startRunning) {
      this.state.status = "running";
    }
  }

  update(deltaMs: number): void {
    const safeDelta = Math.min(deltaMs, 32);
    const dtScale = safeDelta / (1000 / 60);

    if (this.state.shakeMs > 0) {
      this.state.shakeMs = Math.max(0, this.state.shakeMs - safeDelta);
    }

    this.updateParticles(dtScale);
    this.updateStars(dtScale);

    if (this.state.status !== "running" || !this.state.drone.alive) {
      if (this.state.status === "idle" || this.state.status === "paused") {
        this.state.drone.y += Math.sin(this.simTime / 280) * 0.15;
      }
      this.simTime += safeDelta;
      return;
    }

    this.simTime += safeDelta;
    this.state.elapsedMs += safeDelta;
    this.state.worldSpeed = getWorldSpeed(this.state.elapsedMs);
    this.state.drone.velocityX = this.state.worldSpeed;

    applyGravity(this.state.drone, dtScale);

    for (const gate of this.state.gates) {
      gate.x -= this.state.worldSpeed * dtScale;
      if (!gate.passed && gate.x + gate.width < this.state.drone.x) {
        gate.passed = true;
        this.state.score += 100;
        if (this.state.score > this.state.bestScore) {
          this.state.bestScore = this.state.score;
          saveBestScore(this.state.bestScore);
        }
      }
    }

    this.state.gates = maintainGates(
      this.state.gates,
      this.state.drone.x,
      this.state.canvasHeight,
      this.state.elapsedMs
    );

    this.spawnExhaust(false);

    if (
      checkCollisions(
        this.state.drone,
        this.state.gates,
        this.state.canvasHeight
      )
    ) {
      this.state.drone.alive = false;
      this.state.status = "game_over";
      this.state.shakeMs = 280;
      this.spawnCrashBurst();
    }
  }

  private createInitialState(
    width: number,
    height: number,
    mode: GameMode,
    bestScore = loadBestScore()
  ): GameState {
    const droneX = width * GAME_CONFIG.droneStartXRatio;
    const gates = seedGates(width, height, droneX);
    const startY = gates[0]?.gapCenterY ?? height * 0.45;
    return {
      drone: {
        x: droneX,
        y: startY,
        velocityY: 0,
        velocityX: GAME_CONFIG.initialVelocityX,
        rotation: 0,
        alive: true,
      },
      gates,
      score: 0,
      bestScore,
      elapsedMs: 0,
      status: "idle",
      mode,
      lastFlapAt: null,
      worldSpeed: GAME_CONFIG.initialVelocityX,
      canvasWidth: width,
      canvasHeight: height,
      flapCount: 0,
      recentFlapTimes: [],
      shakeMs: 0,
    };
  }

  private spawnExhaust(boost: boolean): void {
    if (this.particles.length >= GAME_CONFIG.maxParticles) {
      this.particles.splice(0, this.particles.length - GAME_CONFIG.maxParticles + 4);
    }
    const count = boost ? 5 : Math.random() < 0.45 ? 1 : 0;
    for (let i = 0; i < count; i += 1) {
      this.particles.push({
        x: this.state.drone.x - 18,
        y: this.state.drone.y + (Math.random() - 0.5) * 10,
        vx: -1.5 - Math.random() * 2.2,
        vy: (Math.random() - 0.5) * 1.4,
        life: 1,
        maxLife: 1,
        size: 1.5 + Math.random() * 2.5,
        color: boost ? "#c4b5fd" : "#22d3ee",
      });
    }
  }

  private spawnCrashBurst(): void {
    for (let i = 0; i < 24; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 4;
      this.particles.push({
        x: this.state.drone.x,
        y: this.state.drone.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: 1,
        size: 2 + Math.random() * 3,
        color: Math.random() > 0.5 ? "#f472b6" : "#22d3ee",
      });
    }
  }

  private updateParticles(dtScale: number): void {
    for (const p of this.particles) {
      p.x += p.vx * dtScale;
      p.y += p.vy * dtScale;
      p.life -= 0.03 * dtScale;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private updateStars(dtScale: number): void {
    const width = this.state.canvasWidth;
    for (const star of this.stars) {
      star.x -= this.state.worldSpeed * star.depth * 0.25 * dtScale;
      star.twinkle += 0.04 * dtScale;
      if (star.x < 0) {
        star.x = width + Math.random() * 40;
        star.y = Math.random() * this.state.canvasHeight;
      }
    }
  }
}
