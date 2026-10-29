import { GlowAudio } from './audio.js';
import { ACHIEVEMENTS, THEMES } from './config.js';
import { GlowDriftGame } from './game.js';
import { GameInput } from './input.js';
import { PlayablesPlatform } from './platform.js';
import { GlowRenderer } from './renderer.js';
import { SaveManager } from './save.js';
import { GlowUI } from './ui.js';

const platform = new PlayablesPlatform();
const save = new SaveManager(platform);
const audio = new GlowAudio();
const canvas = document.querySelector('#game-canvas');
const renderer = new GlowRenderer(canvas);
const game = new GlowDriftGame(handleGameEvent);
const ui = new GlowUI(save);

let input;
let currentMode = { daily: false };
let runRecorded = true;
let rafId = 0;
let lastTime = performance.now();
let accumulator = 0;
let suspended = false;
let hostPaused = false;
let resumeAfterHost = false;

function unlockAchievement(id) {
  if (!save.unlockAchievement(id)) return;

  const achievement = ACHIEVEMENTS[id];
  ui.toast(achievement.name, achievement.description);
  audio.play('achievement');
}

function checkAchievements() {
  if (game.energyCollected >= 1) unlockAchievement('first-light');
  if (game.multiplier >= 4) unlockAchievement('chain-reaction');
  if (game.nearMisses >= 5) unlockAchievement('close-call');
  if (game.elapsed >= 60) unlockAchievement('survivor');
  if (game.score >= 2500) unlockAchievement('high-voltage');
}

function finalizeRun() {
  if (runRecorded) return null;

  runRecorded = true;
  checkAchievements();

  const snapshot = game.getSnapshot();
  const record = save.recordRun(
    snapshot.score,
    snapshot.elapsed,
    snapshot.energy,
    snapshot.daily?.dateKey || ''
  );

  platform.sendScore(snapshot.score);

  return { snapshot, record };
}

function handleGameEvent(type, detail) {
  switch (type) {
    case 'collect':
      renderer.burst(detail.angle, renderer.theme.primary, 13, 0.8);
      audio.play('collect', detail);
      checkAchievements();
      break;

    case 'nearMiss':
      renderer.burst(detail.angle, renderer.theme.secondary, 8, 0.55);
      audio.play('near');
      checkAchievements();
      break;

    case 'hit':
      renderer.burst(detail.angle, renderer.theme.danger, 28, 1.4);
      renderer.impact(1);
      audio.play('hit');
      break;

    case 'phase':
      renderer.burst(detail.angle, renderer.theme.secondary, 24, 1.1);
      audio.play('phase');
      break;

    case 'shatter':
      renderer.burst(detail.angle, renderer.theme.energy, 20, 1.15);
      audio.play('shatter');
      break;

    case 'wave':
      ui.showWave(detail.wave);
      audio.play('wave');
      break;

    case 'gameOver': {
      const result = finalizeRun();

      audio.play('gameover');
      audio.setPaused(false);
      ui.showGameOver(detail, result.record, save.data);

      if (result.record.newThemes.length > 0) {
        ui.toast(
          'New theme unlocked',
          result.record.newThemes.map((theme) => theme.name).join(', ')
        );
      }
      break;
    }

    default:
      break;
  }
}

async function startRun(mode = { daily: false }) {
  currentMode = { daily: Boolean(mode.daily) };
  runRecorded = false;

  await audio.unlock();
  await audio.setPaused(false);

  const difficulty = currentMode.daily ? 'normal' : save.data.difficulty;

  game.start({
    difficulty,
    daily: currentMode.daily,
  });

  renderer.resetTrail();
  ui.showPlaying();
  ui.updateHUD(game, true);
}

function pauseRun() {
  if (!game.pause()) return;

  ui.showPause();
  audio.setPaused(true);
}

async function resumeRun() {
  await audio.unlock();
  await audio.setPaused(false);

  if (game.resume()) {
    ui.showPlaying();
  }
}

function restartRun() {
  audio.play('click');
  startRun(currentMode);
}

function goHome() {
  if (!runRecorded && game.state !== 'title') {
    finalizeRun();
  }

  game.toTitle();
  audio.setPaused(false);
  ui.showTitle();
}

function setSound(enabled) {
  if (platform.inPlayables) return;

  save.update({ sound: enabled });
  audio.setUserEnabled(enabled);
  ui.setAudioState(enabled, audio.hostEnabled);

  if (enabled) {
    audio.unlock();
  }
}

function setMotion(enabled) {
  save.update({ reducedMotion: enabled });
  renderer.reducedMotion = enabled;
  document.body.classList.toggle('reduce-motion', enabled);
}

ui.bind({
  start: startRun,
  pause: pauseRun,
  resume: resumeRun,
  restart: restartRun,
  home: goHome,
  primaryAction: () => ui.primaryAction(),
  isModalOpen: () => ui.isModalOpen(),
  toggleSound: () => setSound(!save.data.sound),
  sound: setSound,
  motion: setMotion,
  difficulty: (difficulty) => save.update({ difficulty }),

  theme: (theme) => {
    if (!save.data.unlockedThemes.includes(theme)) return;

    save.update({ selectedTheme: theme });
    renderer.setTheme(theme);
    audio.play('click');
  },

  reset: () => {
    save.resetProgress();
    renderer.setTheme(save.data.selectedTheme);
    setMotion(save.data.reducedMotion);
    setSound(save.data.sound);
  },
});

function suspendForHost() {
  if (hostPaused) return;

  hostPaused = true;
  resumeAfterHost = game.state === 'playing';

  if (resumeAfterHost) {
    game.pause();
    ui.showPause();
  }

  suspended = true;
  document.body.classList.add('platform-paused');
  audio.setPaused(true);
  cancelAnimationFrame(rafId);
}

function resumeFromHost() {
  if (!hostPaused) return;

  hostPaused = false;
  suspended = false;

  document.body.classList.remove('platform-paused');

  lastTime = performance.now();

  if (resumeAfterHost) {
    game.resume();
    ui.showPlaying();
  }

  resumeAfterHost = false;
  audio.setPaused(false);
  rafId = requestAnimationFrame(frame);
}

function frame(now) {
  if (suspended) return;

  const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;

  if (game.state === 'playing') {
    accumulator += dt;

    let steps = 0;

    while (
      accumulator >= 1 / 60 &&
      steps < 4 &&
      game.state === 'playing'
    ) {
      game.update(1 / 60);
      accumulator -= 1 / 60;
      steps += 1;
    }

    if (steps === 4) {
      accumulator = 0;
    }

    audio.update(game);
    ui.updateHUD(game);
  } else {
    accumulator = 0;
  }

  renderer.render(
    game,
    game.state === 'paused' ? 0 : dt,
    now
  );

  rafId = requestAnimationFrame(frame);
}

async function init() {
  // Draw an initial frame before notifying the host.
  renderer.render(game, 0, performance.now());

  requestAnimationFrame(() => {
    platform.firstFrameReady();
  });

  await save.init();

  renderer.setTheme(save.data.selectedTheme);
  renderer.reducedMotion = save.data.reducedMotion;

  document.body.classList.toggle(
    'reduce-motion',
    save.data.reducedMotion
  );

  audio.setUserEnabled(
    platform.inPlayables ? true : save.data.sound
  );

  audio.setHostEnabled(platform.isAudioEnabled());

  ui.setAudioState(
    platform.inPlayables ? true : save.data.sound,
    audio.hostEnabled
  );

  ui.applySave();
  ui.showTitle();

  input = new GameInput(canvas, game, renderer, {
    pause: pauseRun,
    resume: resumeRun,
    primaryAction: () => ui.primaryAction(),
    isModalOpen: () => ui.isModalOpen(),
  });

  platform.onPause(suspendForHost);
  platform.onResume(resumeFromHost);

  platform.onAudioEnabledChange((enabled) => {
    audio.setHostEnabled(enabled);
    ui.setAudioState(save.data.sound, enabled);
  });

  // YouTube Playables controls pause/resume and the overall mute state.
  if (platform.inPlayables) {
    document.body.classList.add('in-playables');

    document.querySelector('#sound-button').hidden = true;

const soundSetting = document.querySelector('#setting-sound');
soundSetting.closest('.setting-row')?.setAttribute('hidden', '');
  }

  lastTime = performance.now();
  rafId = requestAnimationFrame(frame);

  // Notify the host after the game reaches its interactive title screen.
  requestAnimationFrame(() => {
    try {
      platform.gameReady();
      window.__GAME_READY__ = true;
    } catch (error) {
      console.error('Unable to notify Playables that the game is ready:', error);
    }
  });

  // TEMPORARY DEBUG INTERFACE:
  // Available regardless of URL query parameters, for Test Suite debugging.
  // Remove this block or restore the original test condition before release.
  window.__glowDrift = {
    game,
    save,
    renderer,
    platform,

    snapshot: () => game.getSnapshot(),

    renderStats: () => renderer.getStats(),

    start: (options = {}) => startRun(options),

    collectNext: () => {
      const energy = game.energies.find((item) => item.active);

      if (energy) {
        game.player.angle = energy.angle;
      }
    },

    chargePhase: () => {
      game.player.charge = 100;
    },

    collide: () => {
      game.player.invulnerable = 0;
      game.player.phaseTimer = 0;
      game.hitPlayer(game.player.angle);
    },

    setElapsed: (seconds) => {
      game.elapsed = Math.max(0, seconds);
    },

    corruptSave: () => {
      localStorage.setItem('glow-drift-save-v1', '{not-json');
    },
  };

  window.__GAME_READY__ = true;

  console.info('Glow Drift initialization completed.', {
    inPlayables: platform.inPlayables,
    gameState: game.state,
    renderer: renderer.getStats(),
  });
}

init().catch((error) => {
  console.error('Glow Drift initialization failed:', error);

  const bootStatus = document.querySelector('#boot-status');

  if (bootStatus) {
    bootStatus.textContent = 'Unable to start. Reload to try again.';
  }
});
