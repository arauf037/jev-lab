import { GAME_CONFIG } from "./constants";
import type { GameState, Particle, Star } from "./types";

export function renderGame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  particles: Particle[],
  stars: Star[],
  now: number
): void {
  const { canvasWidth: w, canvasHeight: h } = state;
  ctx.clearRect(0, 0, w, h);

  const shake =
    state.shakeMs > 0
      ? {
          x: (Math.random() - 0.5) * 6,
          y: (Math.random() - 0.5) * 6,
        }
      : { x: 0, y: 0 };

  ctx.save();
  ctx.translate(shake.x, shake.y);

  drawBackground(ctx, w, h);
  drawGrid(ctx, w, h, state.elapsedMs);
  drawStars(ctx, stars, now);
  drawGates(ctx, state);
  drawParticles(ctx, particles);
  drawDrone(ctx, state, now);

  ctx.restore();
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, "#050816");
  gradient.addColorStop(0.45, "#0a1228");
  gradient.addColorStop(1, "#12061f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  const glow = ctx.createRadialGradient(w * 0.7, h * 0.2, 20, w * 0.7, h * 0.2, w * 0.55);
  glow.addColorStop(0, "rgba(124, 58, 237, 0.18)");
  glow.addColorStop(1, "rgba(124, 58, 237, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const cyanGlow = ctx.createRadialGradient(w * 0.2, h * 0.8, 10, w * 0.2, h * 0.8, w * 0.4);
  cyanGlow.addColorStop(0, "rgba(34, 211, 238, 0.12)");
  cyanGlow.addColorStop(1, "rgba(34, 211, 238, 0)");
  ctx.fillStyle = cyanGlow;
  ctx.fillRect(0, 0, w, h);
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  elapsedMs: number
): void {
  const offset = (elapsedMs * 0.04) % 40;
  ctx.strokeStyle = "rgba(34, 211, 238, 0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -offset; x < w; x += 40) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = 0; y < h; y += 40) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();
}

function drawStars(ctx: CanvasRenderingContext2D, stars: Star[], now: number): void {
  for (const star of stars) {
    const alpha = 0.25 + Math.abs(Math.sin(star.twinkle + now / 700)) * 0.55;
    ctx.fillStyle = `rgba(186, 230, 253, ${alpha})`;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGates(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const gate of state.gates) {
    const gapTop = gate.gapCenterY - gate.gapSize / 2;
    const gapBottom = gate.gapCenterY + gate.gapSize / 2;

    ctx.shadowColor = "#22d3ee";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "rgba(34, 211, 238, 0.22)";
    ctx.fillRect(gate.x, 0, gate.width, gapTop);
    ctx.fillRect(gate.x, gapBottom, gate.width, state.canvasHeight - gapBottom);

    ctx.shadowBlur = 0;
    const edge = ctx.createLinearGradient(gate.x, 0, gate.x + gate.width, 0);
    edge.addColorStop(0, "rgba(167, 139, 250, 0.9)");
    edge.addColorStop(0.5, "rgba(34, 211, 238, 1)");
    edge.addColorStop(1, "rgba(167, 139, 250, 0.9)");
    ctx.fillStyle = edge;
    ctx.fillRect(gate.x, gapTop - 6, gate.width, 6);
    ctx.fillRect(gate.x, gapBottom, gate.width, 6);

    ctx.strokeStyle = "rgba(34, 211, 238, 0.55)";
    ctx.lineWidth = 2;
    ctx.strokeRect(gate.x + 1, 0, gate.width - 2, gapTop);
    ctx.strokeRect(gate.x + 1, gapBottom, gate.width - 2, state.canvasHeight - gapBottom);
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawDrone(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
  const { drone } = state;
  if (!drone.alive && state.status === "game_over") {
    ctx.globalAlpha = 0.45;
  }

  ctx.save();
  ctx.translate(drone.x, drone.y);
  ctx.rotate((drone.rotation * Math.PI) / 180);

  const hover = Math.sin(now / 180) * 1.5;
  ctx.translate(0, hover);

  // engine glow
  const glow = ctx.createRadialGradient(-8, 0, 2, -8, 0, 28);
  glow.addColorStop(0, "rgba(34, 211, 238, 0.7)");
  glow.addColorStop(1, "rgba(34, 211, 238, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(-10, 0, 28, 0, Math.PI * 2);
  ctx.fill();

  // body
  ctx.shadowColor = "#22d3ee";
  ctx.shadowBlur = 16;
  const body = ctx.createLinearGradient(-20, -12, 22, 12);
  body.addColorStop(0, "#0ea5e9");
  body.addColorStop(0.45, "#67e8f9");
  body.addColorStop(1, "#a78bfa");
  ctx.fillStyle = body;
  roundRect(ctx, -GAME_CONFIG.droneWidth / 2, -GAME_CONFIG.droneHeight / 2, GAME_CONFIG.droneWidth, GAME_CONFIG.droneHeight, 8);
  ctx.fill();

  // canopy
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
  roundRect(ctx, -2, -8, 16, 12, 4);
  ctx.fill();
  ctx.fillStyle = "rgba(165, 243, 252, 0.55)";
  roundRect(ctx, 0, -6, 10, 7, 3);
  ctx.fill();

  // wings
  ctx.strokeStyle = "rgba(196, 181, 253, 0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-6, -12);
  ctx.lineTo(-18, -20);
  ctx.moveTo(-6, 12);
  ctx.lineTo(-18, 20);
  ctx.stroke();

  // thruster
  ctx.fillStyle = "#c4b5fd";
  ctx.beginPath();
  ctx.ellipse(-20, 0, 5, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  ctx.globalAlpha = 1;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
