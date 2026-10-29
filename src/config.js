export const TAU = Math.PI * 2;
export const SAVE_VERSION = 1;

export const DIFFICULTIES = Object.freeze({
  chill: { id: 'chill', label: 'Chill', lives: 3, playerSpeed: 2.65, spawnInterval: 2.75, obstacleSpeed: 0.78, scoreRate: 0.85, comboWindow: 4.4 },
  normal: { id: 'normal', label: 'Normal', lives: 2, playerSpeed: 2.9, spawnInterval: 2.35, obstacleSpeed: 1, scoreRate: 1, comboWindow: 3.8 },
  expert: { id: 'expert', label: 'Expert', lives: 1, playerSpeed: 3.15, spawnInterval: 1.95, obstacleSpeed: 1.22, scoreRate: 1.3, comboWindow: 3.35 },
});

export const THEMES = Object.freeze([
  { id: 'neon', name: 'Neon Reflex', unlockAt: 0, background: '#09071a', background2: '#171035', ring: '#35275f', primary: '#55f6ff', secondary: '#a982ff', danger: '#ff658c', energy: '#b9fbff', text: '#f5f2ff' },
  { id: 'lagoon', name: 'Ion Lagoon', unlockAt: 1200, background: '#041719', background2: '#0b3036', ring: '#174c52', primary: '#72ffd6', secondary: '#56b9ff', danger: '#ff7b72', energy: '#d0fff1', text: '#edfffb' },
  { id: 'ember', name: 'Ember Rush', unlockAt: 4000, background: '#190b16', background2: '#351425', ring: '#63243f', primary: '#ffca6a', secondary: '#ff7ea8', danger: '#ff526d', energy: '#fff0ba', text: '#fff6ee' },
]);

export const ACHIEVEMENTS = Object.freeze({
  'first-light': { name: 'First Light', description: 'Collect your first energy spark.' },
  'chain-reaction': { name: 'Chain Reaction', description: 'Reach a ×4 multiplier.' },
  'close-call': { name: 'Close Call', description: 'Earn five near misses in one run.' },
  survivor: { name: 'Still Glowing', description: 'Survive for 60 seconds.' },
  'high-voltage': { name: 'High Voltage', description: 'Score 2,500 points in one run.' },
});

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const wrapAngle = (angle) => ((angle % TAU) + TAU) % TAU;
export const angleDelta = (from, to) => {
  let delta = wrapAngle(to) - wrapAngle(from);
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return delta;
};
export const angularDistance = (a, b) => Math.abs(angleDelta(a, b));

export function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed) {
  let state = seed >>> 0;
  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function createDailyChallenge(date = new Date()) {
  const key = utcDateKey(date);
  const random = mulberry32(hashString(`glow-drift:${key}`));
  const challenges = [
    { id: 'one-life', name: 'Single Spark', description: 'One life. Score gains are boosted ×1.5.', lives: 1, speedScale: 1, comboScale: 1, scoreScale: 1.5 },
    { id: 'swift-current', name: 'Swift Current', description: 'Faster obstacles. Score gains are boosted ×1.25.', lives: 2, speedScale: 1.18, comboScale: 1, scoreScale: 1.25 },
    { id: 'long-echo', name: 'Long Echo', description: 'Combos last longer. Score gains are boosted ×1.25.', lives: 2, speedScale: 1.05, comboScale: 1.55, scoreScale: 1.25 },
  ];
  const challenge = challenges[Math.floor(random() * challenges.length)];
  return { ...challenge, dateKey: key, seed: hashString(`${key}:${challenge.id}`) };
}

export function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
}
