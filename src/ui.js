import { ACHIEVEMENTS, DIFFICULTIES, THEMES, createDailyChallenge, formatTime } from './config.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

export class GlowUI {
  constructor(save) {
    this.save = save;
    this.handlers = {};
    this.activeModal = null;
    this.previousFocus = null;
    this.pendingStart = null;
    this.currentMode = { daily: false };
    this.toastTimer = 0;
    this.bannerTimer = 0;
    this.lastHudUpdate = 0;
    this.resetArmed = false;
    this.bindStaticControls();
  }

  bind(handlers) {
    this.handlers = handlers;
  }

  bindStaticControls() {
    $('#play-button').addEventListener('click', () => this.requestStart(false));
    $('#daily-button').addEventListener('click', () => this.requestStart(true));
    $('#tutorial-start').addEventListener('click', () => this.completeTutorial());
    $('#pause-button').addEventListener('click', () => this.handlers.pause?.());
    $('#resume-button').addEventListener('click', () => this.handlers.resume?.());
    $('#restart-button').addEventListener('click', () => this.handlers.restart?.());
    $('#pause-restart').addEventListener('click', () => this.handlers.restart?.());
    $('#pause-home').addEventListener('click', () => this.handlers.home?.());
    $('#gameover-home').addEventListener('click', () => this.handlers.home?.());
    $('#sound-button').addEventListener('click', () => this.handlers.toggleSound?.());
    $$('[data-open]').forEach((button) => button.addEventListener('click', () => this.openModal(button.dataset.open)));
    $$('[data-close]').forEach((button) => button.addEventListener('click', () => this.closeModal()));
    $$('.modal').forEach((modal) => modal.addEventListener('pointerdown', (event) => {
      if (event.target === modal) this.closeModal();
    }));
    $$('.difficulty-button').forEach((button) => button.addEventListener('click', () => {
      this.setDifficulty(button.dataset.difficulty);
      this.handlers.difficulty?.(button.dataset.difficulty);
    }));
    $('#setting-sound').addEventListener('change', (event) => this.handlers.sound?.(event.target.checked));
    $('#setting-motion').addEventListener('change', (event) => this.handlers.motion?.(event.target.checked));
    $('#reset-progress').addEventListener('click', () => {
      if (!this.resetArmed) {
        this.resetArmed = true;
        $('#reset-progress').textContent = 'Confirm reset';
        return;
      }
      this.resetArmed = false;
      $('#reset-progress').textContent = 'Reset progress';
      this.handlers.reset?.();
      this.closeModal();
      this.showTitle();
      this.toast('Progress reset', 'A fresh orbit awaits.');
    });
    document.addEventListener('keydown', (event) => this.onModalKey(event));
  }

  requestStart(daily) {
    this.pendingStart = { daily };
    if (!this.save.data.tutorialSeen) {
      this.openModal('tutorial-modal');
      return;
    }
    this.handlers.start?.(this.pendingStart);
  }

  completeTutorial() {
    this.save.update({ tutorialSeen: true });
    this.closeModal();
    this.handlers.start?.(this.pendingStart || { daily: false });
  }

  primaryAction() {
    if (this.activeModal) return;
    if ($('#gameover-screen').classList.contains('is-hidden')) this.requestStart(false);
    else this.handlers.restart?.();
  }

  setDifficulty(id) {
    $$('.difficulty-button').forEach((button) => {
      const selected = button.dataset.difficulty === id;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  applySave() {
    const data = this.save.data;
    this.setDifficulty(data.difficulty);
    $('#setting-sound').checked = data.sound;
    $('#setting-motion').checked = data.reducedMotion;
    this.setAudioState(data.sound, true);
    this.updateDaily();
    this.renderThemes();
    this.renderStats();
    $('#title-best').textContent = data.bestScore.toLocaleString();
  }

  updateDaily() {
    const daily = createDailyChallenge();
    $('#daily-name').textContent = daily.name;
    $('#daily-description').textContent = daily.description;
    $('#daily-best').textContent = `Daily best ${(this.save.data.dailyBest[daily.dateKey] || 0).toLocaleString()}`;
  }

  showOnly(id) {
    for (const screen of $$('.screen')) screen.classList.toggle('is-hidden', screen.id !== id);
  }

  showTitle() {
    this.showOnly('title-screen');
    $('#hud').classList.add('is-hidden');
    $('#touch-controls').classList.add('is-hidden');
    this.applySave();
    document.body.classList.remove('is-playing');
    $('#play-button').focus({ preventScroll: true });
  }

  showPlaying() {
    this.showOnly('');
    $('#hud').classList.remove('is-hidden');
    $('#touch-controls').classList.remove('is-hidden');
    document.body.classList.add('is-playing');
    $('#game-canvas').focus({ preventScroll: true });
  }

  showPause() {
    this.showOnly('pause-screen');
    $('#touch-controls').classList.add('is-hidden');
    $('#resume-button').focus({ preventScroll: true });
  }

  showGameOver(snapshot, record, saveData) {
    this.showOnly('gameover-screen');
    $('#hud').classList.add('is-hidden');
    $('#touch-controls').classList.add('is-hidden');
    document.body.classList.remove('is-playing');
    $('#final-score').textContent = snapshot.score.toLocaleString();
    $('#final-time').textContent = formatTime(snapshot.elapsed);
    $('#final-best').textContent = saveData.bestScore.toLocaleString();
    $('#final-longest').textContent = formatTime(saveData.bestTime);
    $('#final-energy').textContent = snapshot.energy.toLocaleString();
    $('#new-best').classList.toggle('is-hidden', !record.newBest);
    $('#gameover-title').textContent = snapshot.daily ? 'Daily run complete' : 'Drift complete';
    $('#restart-button').focus({ preventScroll: true });
  }

  updateHUD(game, force = false) {
    const now = performance.now();
    if (!force && now - this.lastHudUpdate < 80) return;
    this.lastHudUpdate = now;
    $('#score-value').textContent = Math.floor(game.score).toLocaleString();
    $('#time-value').textContent = formatTime(game.elapsed);
    $('#wave-value').textContent = String(game.wave);
    $('#combo-value').textContent = `×${game.multiplier}`;
    $('#combo-count').textContent = game.combo > 0 ? `${game.combo} chain` : 'Build a chain';
    $('#combo-meter').style.transform = `scaleX(${game.combo > 0 ? Math.max(0, game.comboTimer / game.comboWindow) : 0})`;
    $('#charge-value').textContent = `${Math.floor(game.player.charge)}%`;
    $('#phase-button').classList.toggle('ready', game.player.charge >= 100);
    $('#phase-button').setAttribute('aria-label', game.player.charge >= 100 ? 'Activate phase, ready' : `Phase charge ${Math.floor(game.player.charge)} percent`);
    const lives = $('#lives');
    if (lives.children.length !== game.lives || lives.dataset.max !== String(game.lives)) {
      lives.replaceChildren();
      lives.dataset.max = String(game.lives);
      for (let i = 0; i < game.lives; i += 1) {
        const life = document.createElement('span');
        life.className = 'life';
        lives.append(life);
      }
    }
    lives.setAttribute('aria-label', `${game.lives} ${game.lives === 1 ? 'life' : 'lives'} remaining`);
  }

  renderStats() {
    const data = this.save.data;
    $('#stats-runs').textContent = data.totalRuns.toLocaleString();
    $('#stats-best').textContent = data.bestScore.toLocaleString();
    $('#stats-time').textContent = formatTime(data.bestTime);
    $('#stats-energy').textContent = data.totalEnergy.toLocaleString();
    $('#stats-achievements').textContent = `${data.achievements.length} / ${Object.keys(ACHIEVEMENTS).length}`;
    const list = $('#achievement-list');
    list.replaceChildren();
    for (const [id, achievement] of Object.entries(ACHIEVEMENTS)) {
      const item = document.createElement('li');
      const unlocked = data.achievements.includes(id);
      item.className = unlocked ? 'unlocked' : '';
      const name = document.createElement('strong');
      name.textContent = unlocked ? achievement.name : 'Locked milestone';
      const description = document.createElement('span');
      description.textContent = achievement.description;
      item.append(name, description);
      list.append(item);
    }
  }

  renderThemes() {
    const data = this.save.data;
    const list = $('#theme-list');
    list.replaceChildren();
    for (const theme of THEMES) {
      const unlocked = data.unlockedThemes.includes(theme.id);
      const selected = data.selectedTheme === theme.id;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `theme-option${selected ? ' selected' : ''}`;
      button.disabled = !unlocked;
      button.setAttribute('aria-pressed', String(selected));
      const swatch = document.createElement('span');
      swatch.className = 'theme-swatch';
      swatch.style.setProperty('--swatch-a', theme.primary);
      swatch.style.setProperty('--swatch-b', theme.secondary);
      swatch.style.setProperty('--swatch-bg', theme.background);
      const copy = document.createElement('span');
      const name = document.createElement('strong');
      name.textContent = theme.name;
      const requirement = document.createElement('small');
      requirement.textContent = unlocked ? (selected ? 'Equipped' : 'Select theme') : `${data.totalScore.toLocaleString()} / ${theme.unlockAt.toLocaleString()} lifetime points`;
      copy.append(name, requirement);
      button.append(swatch, copy);
      if (unlocked) button.addEventListener('click', () => {
        this.handlers.theme?.(theme.id);
        this.renderThemes();
      });
      list.append(button);
    }
  }

  setAudioState(userEnabled, hostEnabled) {
    const effective = userEnabled && hostEnabled;
    $('#sound-button').setAttribute('aria-pressed', String(userEnabled));
    $('#sound-button').setAttribute('aria-label', !hostEnabled ? 'Sound muted by host platform' : userEnabled ? 'Mute sound effects and music' : 'Enable sound effects and music');
    $('#sound-button').classList.toggle('muted', !effective);
    $('#sound-icon-on').classList.toggle('is-hidden', !effective);
    $('#sound-icon-off').classList.toggle('is-hidden', effective);
    $('#setting-sound').checked = userEnabled;
  }

  showWave(wave) {
    const banner = $('#wave-banner');
    banner.textContent = `Wave ${wave}`;
    banner.classList.remove('show');
    requestAnimationFrame(() => banner.classList.add('show'));
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => banner.classList.remove('show'), 1500);
  }

  toast(title, description = '') {
    const toast = $('#toast');
    $('#toast-title').textContent = title;
    $('#toast-description').textContent = description;
    toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
  }

  openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    if (this.activeModal) this.closeModal(false);
    this.previousFocus = document.activeElement;
    this.activeModal = modal;
    if (id === 'stats-modal') this.renderStats();
    if (id === 'themes-modal') this.renderThemes();
    modal.classList.remove('is-hidden');
    const focusTarget = modal.querySelector('button:not(:disabled), input:not(:disabled)');
    focusTarget?.focus({ preventScroll: true });
  }

  closeModal(restoreFocus = true) {
    if (!this.activeModal) return;
    this.activeModal.classList.add('is-hidden');
    this.activeModal = null;
    this.resetArmed = false;
    $('#reset-progress').textContent = 'Reset progress';
    if (restoreFocus && this.previousFocus instanceof HTMLElement) this.previousFocus.focus({ preventScroll: true });
  }

  onModalKey(event) {
    if (!this.activeModal) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (this.activeModal.id === 'tutorial-modal') return;
      this.closeModal();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...this.activeModal.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  isModalOpen() {
    return Boolean(this.activeModal);
  }
}
