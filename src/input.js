import { wrapAngle } from './config.js';

export class GameInput {
  constructor(canvas, game, renderer, handlers) {
    this.canvas = canvas;
    this.game = game;
    this.renderer = renderer;
    this.handlers = handlers;
    this.dragging = false;
    this.abort = new AbortController();
    const options = { signal: this.abort.signal };
    window.addEventListener('keydown', (event) => this.onKey(event), options);
    canvas.addEventListener('pointerdown', (event) => this.onPointer(event, true), options);
    canvas.addEventListener('pointermove', (event) => this.onPointer(event, false), options);
    canvas.addEventListener('pointerup', (event) => this.endPointer(event), options);
    canvas.addEventListener('pointercancel', (event) => this.endPointer(event), options);
    canvas.addEventListener('contextmenu', (event) => event.preventDefault(), options);
    this.bindDirectionButton(document.querySelector('#move-left'), -1);
    this.bindDirectionButton(document.querySelector('#move-right'), 1);
    document.querySelector('#phase-button').addEventListener('click', () => this.game.activatePhase(), options);
  }

  destroy() {
    this.abort.abort();
  }

  onKey(event) {
    if (this.handlers.isModalOpen()) return;
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const key = event.key.toLowerCase();
    if (tag === 'BUTTON' && (key === ' ' || key === 'enter') && this.game.state !== 'playing') return;
    if (this.game.state === 'playing') {
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', ' ', 'w', 's'].includes(key)) event.preventDefault();
      if (key === 'arrowleft' || key === 'a') this.game.setDirection(-1);
      if (key === 'arrowright' || key === 'd') this.game.setDirection(1);
      if (key === 'w' || key === 'arrowup') this.game.setDirection(-1);
      if (key === 's' || key === 'arrowdown') this.game.setDirection(1);
      if (key === ' ') this.game.activatePhase();
      if (key === 'p' || key === 'escape') this.handlers.pause();
      return;
    }
    if (this.game.state === 'paused' && (key === 'escape' || key === 'p')) {
      event.preventDefault();
      this.handlers.resume();
      return;
    }
    if ((this.game.state === 'title' || this.game.state === 'gameover') && key === ' ') {
      event.preventDefault();
      this.handlers.primaryAction();
    }
  }

  pointerAngle(event) {
    const rect = this.canvas.getBoundingClientRect();
    const arena = this.renderer.getArena();
    const x = event.clientX - rect.left - arena.centerX;
    const y = event.clientY - rect.top - arena.centerY;
    return wrapAngle(Math.atan2(x, -y));
  }

  onPointer(event, isDown) {
    if (this.game.state !== 'playing') return;
    if (event.pointerType !== 'mouse' && !this.dragging && !isDown) return;
    if (event.pointerType === 'mouse' || this.dragging || isDown) {
      event.preventDefault();
      if (isDown) {
        this.dragging = true;
        try { this.canvas.setPointerCapture(event.pointerId); } catch { /* Capture is optional. */ }
      }
      this.game.setTargetAngle(this.pointerAngle(event));
    }
  }

  endPointer(event) {
    if (!this.dragging) return;
    this.dragging = false;
    try { this.canvas.releasePointerCapture(event.pointerId); } catch { /* Already released. */ }
  }

  bindDirectionButton(button, direction) {
    if (!button) return;
    const options = { signal: this.abort.signal };
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      this.game.setDirection(direction);
    }, options);
    const stop = () => this.game.setDirection(0);
    button.addEventListener('pointerup', stop, options);
    button.addEventListener('pointercancel', stop, options);
    button.addEventListener('lostpointercapture', stop, options);
    button.addEventListener('click', (event) => {
      if (event.detail === 0) {
        this.game.setDirection(direction);
        setTimeout(stop, 180);
      }
    }, options);
  }
}
