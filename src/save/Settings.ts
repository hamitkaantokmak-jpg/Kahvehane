/** Ayarlar ve basit ilerleme kaydı (localStorage, hata toleranslı). */
export interface Settings {
  master: number;
  sfx: number;
  ambience: number;
  muted: boolean;
  quality: 'low' | 'medium' | 'high';
  sensitivity: number;
  invertY: boolean;
}

export interface Stats {
  wins: Record<string, number>;
  played: Record<string, number>;
  bonks: number;
  teas: number;
}

const KEY = 'kahvehane.settings.v1';
const STATS_KEY = 'kahvehane.stats.v1';

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8, sfx: 0.9, ambience: 0.5, muted: false,
  quality: matchMediaSafe('(pointer: coarse)') ? 'low' : 'high', sensitivity: 1, invertY: false,
};

function matchMediaSafe(q: string) {
  try { return window.matchMedia(q).matches; } catch { return false; }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* yok say */ }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* yok say */ }
}

export function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) return { wins: {}, played: {}, bonks: 0, teas: 0, ...JSON.parse(raw) };
  } catch { /* yok say */ }
  return { wins: {}, played: {}, bonks: 0, teas: 0 };
}

export function saveStats(s: Stats) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch { /* yok say */ }
}
