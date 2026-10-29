import { THEMES, TAU, clamp, mulberry32 } from './config.js';

const PARTICLE_LIMIT = 220;
const TRAIL_LIMIT = 22;

export class GlowRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.centerX = 0;
    this.centerY = 0;
    this.radius = 200;
    this.theme = THEMES[0];
    this.reducedMotion = false;
    this.shake = 0;
    this.flash = 0;
    this.lastTime = 0;
    this.frameCount = 0;
    this.fps = 60;
    this.fpsTime = 0;
    this.particleCursor = 0;
    this.trailCursor = 0;
    this.particles = Array.from({ length: PARTICLE_LIMIT }, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0, size: 0, color: '#fff' }));
    this.trail = Array.from({ length: TRAIL_LIMIT }, () => ({ x: 0, y: 0, initialized: false }));
    const random = mulberry32(0x47a1c9);
    this.stars = Array.from({ length: 84 }, () => ({ x: random(), y: random(), size: 0.35 + random() * 1.4, alpha: 0.12 + random() * 0.42, phase: random() * TAU }));
    this.resize = this.resize.bind(this);
    this.observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(this.resize) : null;
    this.observer?.observe(canvas);
    window.addEventListener('resize', this.resize, { passive: true });
    this.resize();
  }

  destroy() {
    this.observer?.disconnect();
    window.removeEventListener('resize', this.resize);
  }

  setTheme(id) {
    this.theme = THEMES.find((theme) => theme.id === id) || THEMES[0];
    document.body.dataset.theme = this.theme.id;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const pixelWidth = Math.round(this.width * this.dpr);
    const pixelHeight = Math.round(this.height * this.dpr);
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.background = this.ctx.createRadialGradient(this.width * 0.55, this.height * 0.42, 0, this.width * 0.5, this.height * 0.5, Math.max(this.width, this.height) * 0.85);
    this.background.addColorStop(0, this.theme.background2);
    this.background.addColorStop(1, this.theme.background);
  }

  updateArena(game) {
    const titleOffset = game.state === 'title' && this.width >= 900 ? this.width * 0.19 : 0;
    this.centerX = this.width * 0.5 + titleOffset;
    this.centerY = this.height * (this.width < 600 && game.state === 'title' ? 0.64 : 0.51);
    const reservedVertical = this.width < 600 ? 118 : 76;
    this.radius = clamp(Math.min(this.width * 0.39, (this.height - reservedVertical) * 0.36), 94, 292);
    const arenaKey = `${this.centerX}:${this.centerY}:${this.radius}:${this.theme.id}`;
    if (this.arenaKey !== arenaKey) {
      this.arenaKey = arenaKey;
      this.halo = this.ctx.createRadialGradient(this.centerX, this.centerY, this.radius * 0.1, this.centerX, this.centerY, this.radius * 1.4);
      this.halo.addColorStop(0, `${this.theme.secondary}12`);
      this.halo.addColorStop(0.65, `${this.theme.primary}08`);
      this.halo.addColorStop(1, 'transparent');
    }
  }

  getArena() {
    return { centerX: this.centerX, centerY: this.centerY, radius: this.radius };
  }

  pointAt(angle, radius = this.radius) {
    return { x: this.centerX + Math.sin(angle) * radius, y: this.centerY - Math.cos(angle) * radius };
  }

  burst(angle, color, count = 14, force = 1) {
    const origin = this.pointAt(angle);
    const actualCount = this.reducedMotion ? Math.min(5, count) : count;
    const qualityCap = this.width < 600 ? 120 : PARTICLE_LIMIT;
    for (let i = 0; i < actualCount; i += 1) {
      const particle = this.particles[this.particleCursor % qualityCap];
      this.particleCursor = (this.particleCursor + 1) % qualityCap;
      const direction = (i / actualCount) * TAU + Math.sin(i * 12.31) * 0.35;
      const speed = (34 + (i % 5) * 15) * force;
      particle.active = true;
      particle.x = origin.x;
      particle.y = origin.y;
      particle.vx = Math.cos(direction) * speed;
      particle.vy = Math.sin(direction) * speed;
      particle.age = 0;
      particle.life = 0.38 + (i % 4) * 0.08;
      particle.size = 1.5 + (i % 3);
      particle.color = color;
    }
  }

  impact(strength = 1) {
    if (!this.reducedMotion) this.shake = Math.max(this.shake, 7 * strength);
    this.flash = Math.max(this.flash, 0.42 * strength);
  }

  resetTrail() {
    for (const point of this.trail) point.initialized = false;
  }

  updateEffects(dt) {
    for (const particle of this.particles) {
      if (!particle.active) continue;
      particle.age += dt;
      if (particle.age >= particle.life) {
        particle.active = false;
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.975;
      particle.vy *= 0.975;
    }
    this.shake = Math.max(0, this.shake - dt * 28);
    this.flash = Math.max(0, this.flash - dt * 1.8);
  }

  render(game, dt, now) {
    if (!this.ctx) return;
    this.updateArena(game);
    if (game.state !== 'paused') this.updateEffects(Math.min(dt, 0.05));
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, this.width, this.height);

    const shakeX = this.shake > 0 ? Math.sin(now * 0.071) * this.shake : 0;
    const shakeY = this.shake > 0 ? Math.cos(now * 0.083) * this.shake * 0.65 : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    this.drawBackground(now, game.state === 'paused');
    this.drawArena(now, game);
    if (game.state === 'title') this.drawAmbient(now);
    else this.drawEntities(game, now);
    this.drawParticles();
    ctx.restore();

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 101, 140, ${this.flash * 0.22})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }
    this.trackPerformance(dt);
  }

  drawBackground(now, frozen) {
    const ctx = this.ctx;
    const time = frozen || this.reducedMotion ? 0 : now * 0.001;
    for (const star of this.stars) {
      const alpha = star.alpha * (0.72 + Math.sin(time * 0.7 + star.phase) * 0.28);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.theme.energy;
      ctx.beginPath();
      ctx.arc(star.x * this.width, star.y * this.height, star.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.halo;
    ctx.fillRect(this.centerX - this.radius * 1.5, this.centerY - this.radius * 1.5, this.radius * 3, this.radius * 3);
  }

  drawArena(now, game) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = this.theme.ring;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(this.centerX, this.centerY, this.radius, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 0.34;
    ctx.beginPath();
    ctx.arc(this.centerX, this.centerY, this.radius - 18, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.arc(this.centerX, this.centerY, this.radius + 22, 0, TAU);
    ctx.stroke();

    ctx.strokeStyle = this.theme.secondary;
    ctx.lineWidth = 2;
    for (let i = 0; i < 36; i += 1) {
      const angle = (i / 36) * TAU;
      const major = i % 3 === 0;
      const inner = this.pointAt(angle, this.radius + (major ? 25 : 27));
      const outer = this.pointAt(angle, this.radius + (major ? 34 : 30));
      ctx.globalAlpha = major ? 0.28 : 0.12;
      ctx.beginPath();
      ctx.moveTo(inner.x, inner.y);
      ctx.lineTo(outer.x, outer.y);
      ctx.stroke();
    }

    if (game.state === 'playing') {
      const progress = (game.elapsed % 20) / 20;
      ctx.strokeStyle = this.theme.primary;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.38;
      ctx.beginPath();
      ctx.arc(this.centerX, this.centerY, this.radius + 39, -Math.PI / 2, -Math.PI / 2 + progress * TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawAmbient(now) {
    const time = this.reducedMotion ? 0 : now * 0.00022;
    const orbAngle = time % TAU;
    this.drawEnergy((orbAngle + 1.7) % TAU, now, 0.85);
    this.drawObstacle({ angle: (orbAngle + 3.7) % TAU, width: 0.23, telegraph: 0, age: 1, type: 'shard', speed: 0, phase: 0 }, now, 0.45);
    this.drawPlayer(orbAngle, now, { player: { invulnerable: 0, phaseTimer: 0, charge: 65 }, state: 'title' });
  }

  drawEntities(game, now) {
    for (const energy of game.energies) {
      if (energy.active) this.drawEnergy(energy.angle, now, 1 - energy.age / energy.lifetime * 0.25);
    }
    for (const obstacle of game.obstacles) {
      if (obstacle.active) this.drawObstacle(obstacle, now, 1);
    }
    this.drawPlayer(game.player.angle, now, game);
  }

  drawEnergy(angle, now, opacity = 1) {
    const ctx = this.ctx;
    const point = this.pointAt(angle);
    const pulse = this.reducedMotion ? 1 : 1 + Math.sin(now * 0.006 + angle * 3) * 0.13;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(now * 0.0008 + angle);
    ctx.scale(pulse, pulse);
    ctx.globalAlpha = opacity;
    ctx.shadowColor = this.theme.primary;
    ctx.shadowBlur = 18;
    ctx.fillStyle = this.theme.energy;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 0);
    ctx.lineTo(0, 7);
    ctx.lineTo(-5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = this.theme.primary;
    ctx.globalAlpha = opacity * 0.45;
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  drawObstacle(obstacle, now, opacity = 1) {
    const ctx = this.ctx;
    const telegraphing = obstacle.telegraph > 0;
    const start = -Math.PI / 2 + obstacle.angle - obstacle.width * 0.5;
    const end = -Math.PI / 2 + obstacle.angle + obstacle.width * 0.5;
    ctx.save();
    ctx.strokeStyle = telegraphing ? this.theme.secondary : this.theme.danger;
    ctx.fillStyle = this.theme.danger;
    ctx.lineWidth = telegraphing ? 2 : 12;
    ctx.globalAlpha = telegraphing ? opacity * (0.32 + Math.sin(now * 0.014) * 0.16) : opacity * 0.9;
    if (telegraphing) ctx.setLineDash([5, 7]);
    ctx.shadowColor = telegraphing ? this.theme.secondary : this.theme.danger;
    ctx.shadowBlur = telegraphing ? 4 : 14;
    ctx.beginPath();
    ctx.arc(this.centerX, this.centerY, this.radius, start, end);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!telegraphing) {
      const center = this.pointAt(obstacle.angle);
      ctx.translate(center.x, center.y);
      ctx.rotate(obstacle.angle);
      ctx.globalAlpha = opacity;
      ctx.beginPath();
      ctx.moveTo(0, -15);
      ctx.lineTo(8, 5);
      ctx.lineTo(0, 1);
      ctx.lineTo(-8, 5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  drawPlayer(angle, now, game) {
    const ctx = this.ctx;
    const point = this.pointAt(angle);
    const moving = game.state === 'playing';
    if (moving && game.state !== 'paused') {
      const trailPoint = this.trail[this.trailCursor];
      trailPoint.x = point.x;
      trailPoint.y = point.y;
      trailPoint.initialized = true;
      this.trailCursor = (this.trailCursor + 1) % TRAIL_LIMIT;
    }
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < TRAIL_LIMIT; i += 1) {
      const index = (this.trailCursor + i) % TRAIL_LIMIT;
      const trailPoint = this.trail[index];
      if (!trailPoint.initialized) continue;
      ctx.globalAlpha = (i / TRAIL_LIMIT) * 0.22;
      ctx.fillStyle = this.theme.primary;
      ctx.beginPath();
      ctx.arc(trailPoint.x, trailPoint.y, 2 + i / TRAIL_LIMIT * 4, 0, TAU);
      ctx.fill();
    }
    ctx.translate(point.x, point.y);
    const phased = game.player.phaseTimer > 0;
    const invulnerable = game.player.invulnerable > 0;
    ctx.globalAlpha = invulnerable && !this.reducedMotion ? 0.55 + Math.sin(now * 0.025) * 0.35 : 1;
    ctx.shadowColor = phased ? this.theme.secondary : this.theme.primary;
    ctx.shadowBlur = phased ? 34 : 24;
    ctx.fillStyle = phased ? this.theme.secondary : this.theme.primary;
    ctx.beginPath();
    ctx.arc(0, 0, phased ? 12 : 10, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = this.theme.energy;
    ctx.beginPath();
    ctx.arc(-2.5, -3, 3.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = phased ? this.theme.secondary : this.theme.primary;
    ctx.globalAlpha = phased ? 0.8 : 0.3;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, phased ? 22 + Math.sin(now * 0.02) * 3 : 16, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  drawParticles() {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const particle of this.particles) {
      if (!particle.active) continue;
      const alpha = 1 - particle.age / particle.life;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * alpha, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  trackPerformance(dt) {
    this.frameCount += 1;
    this.fpsTime += dt;
    if (this.fpsTime >= 1) {
      this.fps = Math.round(this.frameCount / this.fpsTime);
      this.frameCount = 0;
      this.fpsTime = 0;
    }
  }

  getStats() {
    return {
      fps: this.fps,
      particles: this.particles.reduce((count, particle) => count + (particle.active ? 1 : 0), 0),
      dpr: this.dpr,
      width: this.width,
      height: this.height,
    };
  }
}
