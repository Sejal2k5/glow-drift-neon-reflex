export class GlowAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.userEnabled = true;
    this.hostEnabled = true;
    this.paused = false;
    this.nextBeat = 0;
    this.beat = 0;
    this.noiseBuffer = null;
  }

  get enabled() {
    return this.userEnabled && this.hostEnabled && !this.paused;
  }

  async unlock() {
    if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return false;
    try {
      if (!this.context) {
        const Context = window.AudioContext || window.webkitAudioContext;
        this.context = new Context();
        this.master = this.context.createGain();
        this.master.gain.value = 0;
        this.master.connect(this.context.destination);
        this.createNoiseBuffer();
      }
      if (this.context.state === 'suspended' && !this.paused) await this.context.resume();
      this.applyGain();
      return true;
    } catch {
      return false;
    }
  }

  createNoiseBuffer() {
    if (!this.context) return;
    const length = Math.floor(this.context.sampleRate * 0.22);
    this.noiseBuffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    let seed = 9137;
    for (let i = 0; i < length; i += 1) {
      seed = (seed * 16807) % 2147483647;
      data[i] = ((seed / 2147483647) * 2 - 1) * (1 - i / length);
    }
  }

  setUserEnabled(enabled) {
    this.userEnabled = Boolean(enabled);
    this.applyGain();
  }

  setHostEnabled(enabled) {
    this.hostEnabled = Boolean(enabled);
    this.applyGain();
  }

  async setPaused(paused) {
    this.paused = Boolean(paused);
    this.applyGain();
    if (!this.context) return;
    try {
      if (paused && this.context.state === 'running') await this.context.suspend();
      if (!paused && this.context.state === 'suspended') {
        await this.context.resume();
        this.nextBeat = this.context.currentTime + 0.1;
      }
    } catch { /* A new user gesture will retry audio unlock. */ }
  }

  applyGain() {
    if (!this.context || !this.master) return;
    const target = this.enabled ? 0.48 : 0;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(target, this.context.currentTime, 0.015);
  }

  tone(frequency, duration = 0.1, type = 'sine', volume = 0.16, endFrequency = frequency) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  noise(volume = 0.15) {
    if (!this.enabled || !this.context || !this.noiseBuffer || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = 'bandpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.7;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(now);
  }

  play(name, detail = {}) {
    switch (name) {
      case 'click': this.tone(280, 0.045, 'sine', 0.06, 340); break;
      case 'collect': this.tone(520 + Math.min(7, detail.multiplier || 1) * 55, 0.11, 'sine', 0.14, 820 + (detail.multiplier || 1) * 60); break;
      case 'near': this.tone(340, 0.16, 'triangle', 0.1, 720); break;
      case 'hit': this.noise(0.22); this.tone(130, 0.28, 'sawtooth', 0.13, 48); break;
      case 'phase': this.tone(180, 0.34, 'sine', 0.18, 960); break;
      case 'shatter': this.noise(0.11); this.tone(680, 0.12, 'triangle', 0.1, 280); break;
      case 'achievement': this.tone(440, 0.16, 'sine', 0.1, 660); setTimeout(() => this.tone(660, 0.2, 'sine', 0.09, 880), 90); break;
      case 'gameover': this.tone(260, 0.48, 'triangle', 0.13, 90); break;
      case 'wave': this.tone(220, 0.18, 'sine', 0.07, 440); break;
      default: break;
    }
  }

  update(game) {
    if (!this.enabled || !this.context || this.context.state !== 'running' || game.state !== 'playing') return;
    const now = this.context.currentTime;
    if (this.nextBeat < now) this.nextBeat = now + 0.05;
    const interval = Math.max(0.29, 0.48 - game.elapsed * 0.0008);
    while (this.nextBeat < now + 0.08) {
      const roots = [55, 65.41, 73.42, 82.41];
      const root = roots[Math.floor(this.beat / 8) % roots.length];
      if (this.beat % 2 === 0) this.tone(root, interval * 0.75, 'sine', 0.038, root * 0.99);
      if (this.beat % 4 === 2) this.tone(root * 4, 0.1, 'triangle', 0.018, root * 3);
      this.beat += 1;
      this.nextBeat += interval;
    }
  }
}
