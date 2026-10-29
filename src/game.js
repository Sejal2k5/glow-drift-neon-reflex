import { DIFFICULTIES, TAU, angleDelta, angularDistance, clamp, createDailyChallenge, mulberry32, wrapAngle } from './config.js';

const MAX_OBSTACLES = 30;
const MAX_ENERGY = 12;
const PLAYER_ANGULAR_RADIUS = 0.055;

function makeObstacle() {
  return { active: false, angle: 0, speed: 0, width: 0.2, telegraph: 0, age: 0, lifetime: 0, type: 'shard', nearAwarded: false, phase: 0 };
}

function makeEnergy() {
  return { active: false, angle: 0, age: 0, lifetime: 0, value: 10 };
}

function randomSeed() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0];
  }
  return (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
}

export class GlowDriftGame {
  constructor(onEvent = () => {}) {
    this.onEvent = onEvent;
    this.state = 'title';
    this.obstacles = Array.from({ length: MAX_OBSTACLES }, makeObstacle);
    this.energies = Array.from({ length: MAX_ENERGY }, makeEnergy);
    this.player = { angle: 0, direction: 0, targetAngle: null, invulnerable: 0, phaseTimer: 0, charge: 0 };
    this.daily = null;
    this.difficulty = DIFFICULTIES.normal;
    this.random = mulberry32(1);
    this.resetRunValues();
  }

  resetRunValues() {
    this.elapsed = 0;
    this.score = 0;
    this.combo = 0;
    this.multiplier = 1;
    this.comboTimer = 0;
    this.energyCollected = 0;
    this.nearMisses = 0;
    this.wave = 1;
    this.lives = 2;
    this.spawnTimer = 1.6;
    this.energyTimer = 0.35;
    this.lastSurvivalTick = 0;
  }

  start({ difficulty = 'normal', daily = false, seed } = {}) {
    this.difficulty = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
    this.daily = daily ? createDailyChallenge() : null;
    const actualSeed = Number.isFinite(seed) ? seed >>> 0 : (this.daily?.seed ?? randomSeed());
    this.random = mulberry32(actualSeed);
    this.resetRunValues();
    this.lives = this.daily?.lives ?? this.difficulty.lives;
    this.player.angle = 0;
    this.player.direction = 0;
    this.player.targetAngle = null;
    this.player.invulnerable = 1;
    this.player.phaseTimer = 0;
    this.player.charge = 0;
    for (const obstacle of this.obstacles) obstacle.active = false;
    for (const energy of this.energies) energy.active = false;
    this.state = 'playing';
    this.spawnEnergy(true);
    this.onEvent('start', { daily: this.daily, difficulty: this.difficulty });
  }

  pause() {
    if (this.state !== 'playing') return false;
    this.state = 'paused';
    this.player.direction = 0;
    this.player.targetAngle = null;
    this.onEvent('pause', {});
    return true;
  }

  resume() {
    if (this.state !== 'paused') return false;
    this.state = 'playing';
    this.player.invulnerable = Math.max(this.player.invulnerable, 0.45);
    this.onEvent('resume', {});
    return true;
  }

  toTitle() {
    this.state = 'title';
    this.player.direction = 0;
    this.player.targetAngle = null;
  }

  setDirection(direction) {
    if (this.state !== 'playing') return;
    this.player.direction = clamp(direction, -1, 1);
    this.player.targetAngle = null;
  }

  setTargetAngle(angle) {
    if (this.state !== 'playing' || !Number.isFinite(angle)) return;
    this.player.targetAngle = wrapAngle(angle);
    this.player.direction = 0;
  }

  activatePhase() {
    if (this.state !== 'playing' || this.player.charge < 100 || this.player.phaseTimer > 0) return false;
    this.player.charge = 0;
    this.player.phaseTimer = 0.68;
    this.onEvent('phase', { angle: this.player.angle });
    return true;
  }

  get comboWindow() {
    return this.difficulty.comboWindow * (this.daily?.comboScale ?? 1);
  }

  get scoreScale() {
    return this.difficulty.scoreRate * (this.daily?.scoreScale ?? 1);
  }

  update(dt) {
    if (this.state !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    const step = Math.min(dt, 0.05);
    this.elapsed += step;
    this.score += step * 4 * this.scoreScale;
    this.player.invulnerable = Math.max(0, this.player.invulnerable - step);
    this.player.phaseTimer = Math.max(0, this.player.phaseTimer - step);

    if (this.combo > 0) {
      this.comboTimer -= step;
      if (this.comboTimer <= 0) this.resetCombo();
    }

    const nextWave = 1 + Math.floor(this.elapsed / 20);
    if (nextWave !== this.wave) {
      this.wave = nextWave;
      this.onEvent('wave', { wave: this.wave });
    }

    this.updatePlayer(step);
    this.updateSpawning(step);
    this.updateEnergy(step);
    this.updateObstacles(step);
  }

  updatePlayer(dt) {
    const speed = this.difficulty.playerSpeed;
    if (this.player.targetAngle !== null) {
      const delta = angleDelta(this.player.angle, this.player.targetAngle);
      const maxStep = speed * 1.12 * dt;
      this.player.angle = wrapAngle(this.player.angle + clamp(delta, -maxStep, maxStep));
    } else if (this.player.direction !== 0) {
      this.player.angle = wrapAngle(this.player.angle + this.player.direction * speed * dt);
    }
  }

  updateSpawning(dt) {
    this.spawnTimer -= dt;
    this.energyTimer -= dt;
    if (this.energyTimer <= 0) {
      this.spawnEnergy();
      this.energyTimer = Math.max(0.85, 1.65 - this.elapsed * 0.004);
    }
    if (this.spawnTimer <= 0) {
      this.spawnPattern();
      const interval = Math.max(0.68, this.difficulty.spawnInterval - this.elapsed * 0.012);
      this.spawnTimer = interval * (0.86 + this.random() * 0.28);
    }
  }

  isSafeSpawn(angle, clearance = 0.5) {
    if (angularDistance(angle, this.player.angle) < 0.62) return false;
    for (const obstacle of this.obstacles) {
      if (obstacle.active && angularDistance(angle, obstacle.angle) < clearance + obstacle.width * 0.5) return false;
    }
    return true;
  }

  findSafeAngle(minDistance = 0.85, maxDistance = 2.65) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const direction = this.random() < 0.5 ? -1 : 1;
      const distance = minDistance + this.random() * (maxDistance - minDistance);
      const angle = wrapAngle(this.player.angle + direction * distance);
      if (this.isSafeSpawn(angle, 0.42)) return angle;
    }
    return wrapAngle(this.player.angle + Math.PI * (0.65 + this.random() * 0.7));
  }

  spawnEnergy(initial = false) {
    const energy = this.energies.find((item) => !item.active);
    if (!energy) return false;
    energy.active = true;
    energy.angle = initial ? wrapAngle(this.player.angle + 0.72) : this.findSafeAngle(0.65, 2.4);
    energy.age = 0;
    energy.lifetime = initial ? 12 : 9;
    energy.value = 10;
    return true;
  }

  spawnObstacle(angle, type = 'shard', speedScale = 1) {
    const obstacle = this.obstacles.find((item) => !item.active);
    if (!obstacle) return false;
    const direction = this.random() < 0.5 ? -1 : 1;
    const baseSpeed = (0.32 + this.random() * 0.3 + Math.min(0.34, this.elapsed * 0.0035)) * this.difficulty.obstacleSpeed * (this.daily?.speedScale ?? 1) * speedScale;
    obstacle.active = true;
    obstacle.angle = wrapAngle(angle);
    obstacle.type = type;
    obstacle.speed = type === 'mine' ? 0 : direction * baseSpeed;
    obstacle.width = type === 'comet' ? 0.14 : type === 'mine' ? 0.31 : 0.2 + this.random() * 0.07;
    obstacle.telegraph = type === 'comet' ? 1.05 : 0.9;
    obstacle.age = 0;
    obstacle.lifetime = type === 'mine' ? 5.4 : 7.2;
    obstacle.nearAwarded = false;
    obstacle.phase = this.random() * TAU;
    this.onEvent('telegraph', { angle: obstacle.angle, type });
    return true;
  }

  spawnPattern() {
    const angle = this.findSafeAngle(1.05, 2.9);
    const roll = this.random();
    const type = this.elapsed > 35 && roll < 0.22 ? 'mine' : this.elapsed > 18 && roll < 0.48 ? 'comet' : 'shard';
    this.spawnObstacle(angle, type, type === 'comet' ? 1.45 : 1);
    if (this.elapsed > 42 && this.random() < Math.min(0.38, 0.12 + this.elapsed * 0.002)) {
      const secondAngle = wrapAngle(angle + Math.PI + (this.random() - 0.5) * 0.5);
      if (this.isSafeSpawn(secondAngle, 0.75)) this.spawnObstacle(secondAngle, 'shard', 0.9);
    }
  }

  updateEnergy(dt) {
    for (const energy of this.energies) {
      if (!energy.active) continue;
      energy.age += dt;
      if (energy.age >= energy.lifetime) {
        energy.active = false;
        continue;
      }
      if (angularDistance(this.player.angle, energy.angle) < 0.105) this.collectEnergy(energy);
    }
  }

  collectEnergy(energy) {
    if (!energy.active || this.state !== 'playing') return;
    energy.active = false;
    this.combo += 1;
    this.multiplier = Math.min(8, 1 + Math.floor(this.combo / 4));
    this.comboTimer = this.comboWindow;
    this.energyCollected += 1;
    const gained = Math.round(energy.value * this.multiplier * this.scoreScale);
    this.score += gained;
    this.player.charge = Math.min(100, this.player.charge + 9);
    this.onEvent('collect', { angle: energy.angle, gained, combo: this.combo, multiplier: this.multiplier, energy: this.energyCollected });
  }

  updateObstacles(dt) {
    for (const obstacle of this.obstacles) {
      if (!obstacle.active) continue;
      if (obstacle.telegraph > 0) {
        obstacle.telegraph -= dt;
        continue;
      }
      obstacle.age += dt;
      if (obstacle.age >= obstacle.lifetime) {
        obstacle.active = false;
        continue;
      }
      const speedPulse = obstacle.type === 'comet' ? 1 + Math.sin(obstacle.age * 4 + obstacle.phase) * 0.16 : 1;
      obstacle.angle = wrapAngle(obstacle.angle + obstacle.speed * speedPulse * dt);
      const collisionDistance = obstacle.width * 0.5 + PLAYER_ANGULAR_RADIUS;
      const distance = angularDistance(this.player.angle, obstacle.angle);
      if (distance < collisionDistance) {
        if (this.player.phaseTimer > 0) {
          obstacle.active = false;
          const gained = Math.round(25 * this.multiplier * this.scoreScale);
          this.score += gained;
          this.onEvent('shatter', { angle: obstacle.angle, gained });
          continue;
        }
        if (this.player.invulnerable <= 0) {
          obstacle.active = false;
          this.hitPlayer(obstacle.angle);
          if (this.state !== 'playing') return;
          continue;
        }
      }
      if (!obstacle.nearAwarded && obstacle.age > 0.25 && distance >= collisionDistance && distance < collisionDistance + 0.12) {
        obstacle.nearAwarded = true;
        this.nearMisses += 1;
        const gained = Math.round(15 * this.multiplier * this.scoreScale);
        this.score += gained;
        this.player.charge = Math.min(100, this.player.charge + 34);
        this.onEvent('nearMiss', { angle: this.player.angle, gained, nearMisses: this.nearMisses });
      }
    }
  }

  resetCombo() {
    if (this.combo > 0) this.onEvent('comboEnd', { combo: this.combo });
    this.combo = 0;
    this.multiplier = 1;
    this.comboTimer = 0;
  }

  hitPlayer(angle = this.player.angle) {
    if (this.state !== 'playing' || this.player.invulnerable > 0 || this.player.phaseTimer > 0) return false;
    this.lives -= 1;
    this.player.invulnerable = 1.55;
    this.resetCombo();
    this.onEvent('hit', { angle, lives: this.lives });
    if (this.lives <= 0) {
      this.state = 'gameover';
      this.onEvent('gameOver', this.getSnapshot());
    }
    return true;
  }

  getSnapshot() {
    return {
      state: this.state,
      score: Math.floor(this.score),
      elapsed: this.elapsed,
      lives: this.lives,
      combo: this.combo,
      multiplier: this.multiplier,
      charge: this.player.charge,
      phase: this.player.phaseTimer,
      energy: this.energyCollected,
      nearMisses: this.nearMisses,
      wave: this.wave,
      playerAngle: this.player.angle,
      daily: this.daily,
      activeObstacles: this.obstacles.reduce((count, item) => count + (item.active ? 1 : 0), 0),
      activeEnergy: this.energies.reduce((count, item) => count + (item.active ? 1 : 0), 0),
    };
  }
}
