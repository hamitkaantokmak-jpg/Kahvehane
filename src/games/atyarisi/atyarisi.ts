/**
 * TV'de AT YARIŞI — saf mantık. Sonuç tohumdan (seed) tek seferde belirlenir; görsel katman yalnızca oynatır.
 * Para tamamen oyun içi sanal kahve parasıdır.
 */
import { createRng, Rng } from '../common/rng';

export const HORSE_NAMES = ['Çaykuşu', 'Simit Fırtınası', 'Veresiye Yıldızı', 'Kaçak Demlik', 'Gazoz Prensi', 'Muhtarın Gözdesi', 'Uykucu Bulut', 'Tavla Zarı', 'Pişti Paşa', 'Şekerli Rüzgar'] as const;
export const HORSE_COLORS = ['#e03131', '#f08c00', '#2f9e44', '#1971c2', '#9c36b5', '#f2b134', '#495057', '#d6336c', '#0ca678', '#5c7cfa'];

export const RACE_HORSES = 6;
export const RACE_LENGTH = 1; // normalize pist
export const PHOTO_FINISH_GAP = 0.12; // sn
export const HOUSE_MARGIN = 0.88; // oranlarda kahvehane payı

export interface Horse {
  id: number;
  name: string;
  color: string;
  /** form gücü (0.7..1.3) */
  strength: number;
  /** ödeme oranı (ör. 3.4 → yatırılanın 3.4 katı) */
  odds: number;
}

export interface RaceResult {
  seed: number;
  /** varış sırası (at id'leri) */
  order: number[];
  /** her atın bitiş süresi (sn) */
  times: number[];
  /** foto finiş: ilk iki at arasındaki fark < PHOTO_FINISH_GAP */
  photoFinish: boolean;
  /** görsel: her at için kontrol noktalarında konum (0..1), eşit zaman aralıklı */
  checkpoints: number[][];
  duration: number;
}

/** Yarışın atlarını ve oranlarını oluştur */
export function makeField(seed: number): Horse[] {
  const rng = createRng(seed);
  const names = [...HORSE_NAMES.keys()];
  // isimleri karıştır
  for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
  const horses: Horse[] = names.slice(0, RACE_HORSES).map((n, id) => ({ id, name: HORSE_NAMES[n], color: HORSE_COLORS[n], strength: 0.7 + rng() * 0.6, odds: 0 }));
  const probs = winProbabilities(horses);
  horses.forEach((h, i) => { h.odds = Math.max(1.3, Math.round((HOUSE_MARGIN / probs[i]) * 10) / 10); });
  return horses;
}

/** Kazanma olasılıkları (güç^4 ile orantılı — oran hesabı için) */
export function winProbabilities(horses: Horse[]): number[] {
  const w = horses.map((h) => h.strength ** 4);
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / s);
}

/** Yarışı simüle et: aynı seed ve aynı atlar → aynı sonuç */
export function runRace(seed: number, horses: Horse[], steps = 40): RaceResult {
  const rng = createRng(seed ^ 0x9e3779b9);
  const base = 18; // ortalama süre (sn)
  const times = horses.map((h) => base / h.strength ** 0.5 * (0.92 + rng() * 0.16));
  const order = horses.map((h) => h.id).sort((a, b) => times[a] - times[b]);
  const duration = Math.max(...times);
  // görsel ilerleme: her at kendi süresinde 1'e ulaşır; arada dalgalanma (ama monoton)
  const checkpoints = horses.map((h) => {
    const t = times[h.id];
    const pts: number[] = [];
    let wob = 0;
    for (let k = 0; k <= steps; k++) {
      const time = (k / steps) * duration;
      wob = Math.max(-0.03, Math.min(0.03, wob + (rng() - 0.5) * 0.02));
      const p = Math.min(1, time / t);
      pts.push(p >= 1 ? 1 : Math.max(0, Math.min(0.995, p + wob * Math.sin(p * Math.PI))));
    }
    for (let k = 1; k < pts.length; k++) pts[k] = Math.max(pts[k], pts[k - 1]);
    return pts;
  });
  const photoFinish = times[order[1]] - times[order[0]] < PHOTO_FINISH_GAP;
  return { seed, order, times, photoFinish, checkpoints, duration };
}

export interface RaceBet { who: string; horse: number; amount: number }

/** Kazanan bahisler: yatırılan × oran (aşağı yuvarlanır). Kaybedenler 0. */
export function payouts(bets: RaceBet[], horses: Horse[], result: RaceResult): { who: string; amount: number; win: boolean }[] {
  const winner = result.order[0];
  return bets.map((b) => {
    const win = b.horse === winner;
    return { who: b.who, win, amount: win ? Math.floor(b.amount * horses[b.horse].odds) : 0 };
  });
}

export type RacePhase = 'idle' | 'betting' | 'running' | 'results';

export interface RaceSchedule {
  phase: RacePhase;
  /** bu aşamada kalan süre (sn) */
  timer: number;
  seed: number;
  raceNo: number;
}

export const SCHEDULE = { idle: 150, betting: 40, results: 15 };

/** Yarış zamanlayıcısı (saf): idle → betting → running → results → idle */
export function newSchedule(seed: number, firstIn = 60): RaceSchedule {
  return { phase: 'idle', timer: firstIn, seed, raceNo: 0 };
}

/** dt kadar ilerlet; aşama değiştiyse yeni aşamayı döndürür */
export function tickSchedule(s: RaceSchedule, dt: number, raceDuration: number, rng: Rng): RacePhase | null {
  s.timer -= dt;
  if (s.timer > 0) return null;
  switch (s.phase) {
    case 'idle': s.phase = 'betting'; s.timer = SCHEDULE.betting; s.raceNo++; s.seed = Math.floor(rng() * 2 ** 31); break;
    case 'betting': s.phase = 'running'; s.timer = raceDuration + 1; break;
    case 'running': s.phase = 'results'; s.timer = SCHEDULE.results; break;
    case 'results': s.phase = 'idle'; s.timer = SCHEDULE.idle; break;
  }
  return s.phase;
}

/** Görsel için: t anındaki konum (kontrol noktaları arasında doğrusal) */
export function positionAt(result: RaceResult, horse: number, t: number): number {
  const pts = result.checkpoints[horse];
  const f = Math.max(0, Math.min(1, t / result.duration)) * (pts.length - 1);
  const i = Math.floor(f);
  return i >= pts.length - 1 ? pts[pts.length - 1] : pts[i] + (pts[i + 1] - pts[i]) * (f - i);
}
