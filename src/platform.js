export class PlayablesPlatform {
  constructor(globalObject = window) {
    this.sdk = globalObject.ytgame || null;
    this.inPlayables = Boolean(this.sdk?.IN_PLAYABLES_ENV);
  }

  firstFrameReady() {
    if (!this.inPlayables) return;
    try { this.sdk.game.firstFrameReady(); } catch { /* Local rendering remains available. */ }
  }

  gameReady() {
    if (!this.inPlayables) return;
    try { this.sdk.game.gameReady(); } catch { /* The host test suite reports integration failures. */ }
  }

  onPause(callback) {
    if (!this.inPlayables) return;
    try { this.sdk.system.onPause(callback); } catch { /* Optional outside the host. */ }
  }

  onResume(callback) {
    if (!this.inPlayables) return;
    try { this.sdk.system.onResume(callback); } catch { /* Optional outside the host. */ }
  }

  isAudioEnabled() {
    if (!this.inPlayables) return true;
    try { return Boolean(this.sdk.system.isAudioEnabled()); } catch { return false; }
  }

  onAudioEnabledChange(callback) {
    if (!this.inPlayables) return;
    try { this.sdk.system.onAudioEnabledChange(callback); } catch { /* Optional outside the host. */ }
  }

  async loadData() {
    if (!this.inPlayables) return '';
    return this.sdk.game.loadData();
  }

  async saveData(serialized) {
    if (!this.inPlayables) return;
    return this.sdk.game.saveData(serialized);
  }

  sendScore(value) {
    if (!this.inPlayables || !Number.isSafeInteger(value) || value < 0) return;
    try { this.sdk.engagement.sendScore({ value }); } catch { /* Score submission is best effort. */ }
  }

  logWarning() {
    if (!this.inPlayables) return;
    try { this.sdk.health.logWarning(); } catch { /* Health reporting is best effort. */ }
  }
}
