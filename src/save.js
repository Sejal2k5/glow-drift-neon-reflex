import { ACHIEVEMENTS, DIFFICULTIES, SAVE_VERSION, THEMES, clamp } from './config.js';

const STORAGE_KEY = 'glow-drift-save-v1';
const MAX_NUMBER = 999999999;

export function defaultSave(preferences = {}) {
  return {
    version: SAVE_VERSION,
    bestScore: 0,
    totalRuns: 0,
    bestTime: 0,
    totalScore: 0,
    totalEnergy: 0,
    unlockedThemes: ['neon'],
    selectedTheme: 'neon',
    difficulty: 'normal',
    sound: true,
    reducedMotion: false,
    tutorialSeen: false,
    achievements: [],
    dailyBest: {},
    ...preferences,
  };
}

const finiteNumber = (value, fallback = 0, max = MAX_NUMBER) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? clamp(numeric, 0, max) : fallback;
};

export function sanitizeSave(candidate, preferences = {}) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return defaultSave(preferences);
  const clean = defaultSave(preferences);
  clean.bestScore = Math.floor(finiteNumber(candidate.bestScore));
  clean.totalRuns = Math.floor(finiteNumber(candidate.totalRuns, 0, 10000000));
  clean.bestTime = finiteNumber(candidate.bestTime, 0, 8640000);
  clean.totalScore = Math.floor(finiteNumber(candidate.totalScore));
  clean.totalEnergy = Math.floor(finiteNumber(candidate.totalEnergy));
  clean.difficulty = DIFFICULTIES[candidate.difficulty] ? candidate.difficulty : 'normal';
  clean.sound = typeof candidate.sound === 'boolean' ? candidate.sound : true;
  clean.reducedMotion = typeof candidate.reducedMotion === 'boolean' ? candidate.reducedMotion : false;
  clean.tutorialSeen = candidate.tutorialSeen === true;
  const unlocked = Array.isArray(candidate.unlockedThemes) ? candidate.unlockedThemes : [];
  clean.unlockedThemes = THEMES.filter((theme) => theme.unlockAt === 0 || unlocked.includes(theme.id) || clean.totalScore >= theme.unlockAt).map((theme) => theme.id);
  clean.selectedTheme = clean.unlockedThemes.includes(candidate.selectedTheme) ? candidate.selectedTheme : 'neon';
  const achievements = Array.isArray(candidate.achievements) ? candidate.achievements : [];
  clean.achievements = Object.keys(ACHIEVEMENTS).filter((id) => achievements.includes(id));
  clean.dailyBest = {};
  if (candidate.dailyBest && typeof candidate.dailyBest === 'object' && !Array.isArray(candidate.dailyBest)) {
    for (const [key, value] of Object.entries(candidate.dailyBest).slice(-14)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(key)) clean.dailyBest[key] = Math.floor(finiteNumber(value));
    }
  }
  return clean;
}

function parseSerialized(serialized, preferences) {
  if (typeof serialized !== 'string' || serialized.length === 0 || serialized.length > 3 * 1024 * 1024) return null;
  try {
    const parsed = JSON.parse(serialized);
    if (!parsed || typeof parsed !== 'object') return null;
    return sanitizeSave(parsed, preferences);
  } catch {
    return null;
  }
}

export class SaveManager {
  constructor(platform, storage) {
    this.platform = platform;
    this.inPlayables = Boolean(platform.inPlayables);
    this.storage = this.inPlayables ? null : (storage ?? (typeof localStorage !== 'undefined' ? localStorage : null));
    this.data = defaultSave({ reducedMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches });
    this.loaded = false;
    // In Playables, writes are forbidden until cloud load has completed successfully.
    this.cloudReady = false;
    this.cloudWrite = Promise.resolve();
  }

  readLocal() {
    if (this.inPlayables || !this.storage) return null;
    try { return parseSerialized(this.storage.getItem(STORAGE_KEY), { reducedMotion: this.data.reducedMotion }); } catch { return null; }
  }

  async init() {
    if (!this.inPlayables) {
      const local = this.readLocal();
      if (local) this.data = local;
      this.loaded = true;
      return this.data;
    }

    try {
      const serialized = await Promise.race([
        this.platform.loadData(),
        new Promise((_, reject) => { setTimeout(() => reject(new Error('Save load timed out')), 1800); }),
      ]);
      const cloud = parseSerialized(serialized, { reducedMotion: this.data.reducedMotion });
      if (cloud) this.data = cloud;
      // An empty string is a successful first-time cloud load and permits initial saves.
      this.cloudReady = true;
    } catch {
      this.cloudReady = false;
      this.platform.logWarning();
    }
    this.loaded = true;
    // Never fall back to localStorage or overwrite cloud data when cloud load failed.
    return this.data;
  }

  update(patch) {
    this.data = sanitizeSave({ ...this.data, ...patch }, { reducedMotion: this.data.reducedMotion });
    this.save();
    return this.data;
  }

  save() {
    const serialized = JSON.stringify(this.data);
    if (!this.inPlayables && this.storage) {
      try { this.storage.setItem(STORAGE_KEY, serialized); } catch { /* Storage can be unavailable in private contexts. */ }
    }
    if (this.loaded && this.cloudReady && this.inPlayables) {
      this.cloudWrite = this.cloudWrite.then(async () => {
        try { await this.platform.saveData(serialized); } catch { this.platform.logWarning(); }
      });
    }
    return this.cloudWrite;
  }

  unlockAchievement(id) {
    if (!ACHIEVEMENTS[id] || this.data.achievements.includes(id)) return false;
    this.update({ achievements: [...this.data.achievements, id] });
    return true;
  }

  recordRun(score, survivalTime, energy, dailyKey = '') {
    const previousBest = this.data.bestScore;
    const previousThemes = [...this.data.unlockedThemes];
    const roundedScore = Math.max(0, Math.floor(score));
    const totalScore = this.data.totalScore + roundedScore;
    const unlockedThemes = THEMES.filter((theme) => totalScore >= theme.unlockAt).map((theme) => theme.id);
    const dailyBest = { ...this.data.dailyBest };
    if (/^\d{4}-\d{2}-\d{2}$/.test(dailyKey)) {
      dailyBest[dailyKey] = Math.max(dailyBest[dailyKey] || 0, roundedScore);
      const keys = Object.keys(dailyBest).sort();
      while (keys.length > 14) delete dailyBest[keys.shift()];
    }
    this.update({
      bestScore: Math.max(previousBest, roundedScore),
      bestTime: Math.max(this.data.bestTime, survivalTime),
      totalRuns: this.data.totalRuns + 1,
      totalScore,
      totalEnergy: this.data.totalEnergy + Math.max(0, Math.floor(energy)),
      unlockedThemes,
      dailyBest,
    });
    return {
      newBest: roundedScore > previousBest,
      newThemes: THEMES.filter((theme) => unlockedThemes.includes(theme.id) && !previousThemes.includes(theme.id) && theme.unlockAt > 0),
    };
  }

  resetProgress() {
    const preferences = { sound: this.data.sound, reducedMotion: this.data.reducedMotion, difficulty: this.data.difficulty };
    this.data = defaultSave(preferences);
    this.save();
    return this.data;
  }
}
