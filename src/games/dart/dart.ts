/**
 * DART kural motoru (X01: 301 / 501) — saf mantık, grafikten bağımsız.
 *
 * - Tahta: standart 20 dilim (üstten saat yönünde 20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5),
 *   iç boğa 50, dış boğa 25, üçlü halka ×3, çiftli halka ×2. Koordinatlar tahta yarıçapına (çift halkanın dış kenarı = 1) göre.
 * - Her turda 3 ok. Kalan puandan atılan düşülür.
 * - BUST: kalan negatife düşerse ya da (çiftle bitirme açıkken) 1'e inerse ya da 0'a çift dışı bir okla inerse;
 *   o turun puanları geri alınır ve tur biter.
 * - Çiftle bitirme (double out) seçeneği: 0'a son ok çiftli halka ya da iç boğa (50) ile inmelidir.
 * - 2 kişi ya da 2'şer kişilik takımlar (4 oyuncu, takım = oyuncu % 2, kalan puan takımca ortaktır).
 */
import type { Rng } from '../common/rng';

export const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5] as const;
export const RING = { bull: 0.037, outerBull: 0.094, trebleIn: 0.582, trebleOut: 0.629, doubleIn: 0.953, doubleOut: 1 } as const;

export interface Hit {
  /** dilim değeri (boğada 25, ıska 0) */
  base: number;
  /** çarpan: 0 ıska, 1 tekli, 2 çift, 3 üçlü (iç boğa base 25 × 2) */
  mult: 0 | 1 | 2 | 3;
  score: number;
  label: string;
  /** tahtanın dışına mı gitti (duvara saplanma şakası için) */
  offBoard: boolean;
}

/** Tahta üzerindeki (x sağ, y yukarı) noktanın puanı */
export function scoreAt(x: number, y: number): Hit {
  const r = Math.hypot(x, y);
  if (r > RING.doubleOut) return { base: 0, mult: 0, score: 0, label: 'Iska', offBoard: true };
  if (r <= RING.bull) return { base: 25, mult: 2, score: 50, label: 'Boğa (50)', offBoard: false };
  if (r <= RING.outerBull) return { base: 25, mult: 1, score: 25, label: 'Dış boğa (25)', offBoard: false };
  // açı: üstten saat yönünde
  let a = Math.atan2(x, y);
  if (a < 0) a += Math.PI * 2;
  const idx = Math.floor((a + Math.PI / 20) / (Math.PI / 10)) % 20;
  const base = SECTORS[idx];
  if (r >= RING.trebleIn && r <= RING.trebleOut) return { base, mult: 3, score: base * 3, label: `Üçlü ${base}`, offBoard: false };
  if (r >= RING.doubleIn) return { base, mult: 2, score: base * 2, label: `Çift ${base}`, offBoard: false };
  return { base, mult: 1, score: base, label: String(base), offBoard: false };
}

/** Bir hedefin (dilim + halka) tahta üzerindeki merkez noktası */
export type Ring = 'single' | 'singleInner' | 'treble' | 'double' | 'bull' | 'outerBull';
export function aimPoint(sector: number, ring: Ring): { x: number; y: number } {
  if (ring === 'bull') return { x: 0, y: 0 };
  if (ring === 'outerBull') return { x: 0, y: (RING.bull + RING.outerBull) / 2 };
  const idx = SECTORS.indexOf(sector as (typeof SECTORS)[number]);
  const a = idx * (Math.PI / 10);
  const r = ring === 'treble' ? (RING.trebleIn + RING.trebleOut) / 2 : ring === 'double' ? (RING.doubleIn + RING.doubleOut) / 2
    : ring === 'singleInner' ? 0.33 : 0.8;
  return { x: Math.sin(a) * r, y: Math.cos(a) * r };
}

/** Normal dağılımlı sapma (Box-Muller, enjekte edilen rng) */
export function gauss(rng: Rng): number {
  const u = Math.max(1e-9, rng()), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Atış sonucu: nişan noktası + güç çubuğu (0..1; ideal ~0.6) + titreme (ör. çay içmiş oyuncu).
 * Güç azsa ok aşağı, fazlaysa yukarı sapar.
 */
export function throwOutcome(aim: { x: number; y: number }, power: number, wobble: number, rng: Rng, skill = 0.05): { x: number; y: number } {
  const powerErr = (power - 0.6) * 0.9;
  const s = skill + wobble;
  return { x: aim.x + gauss(rng) * s, y: aim.y + powerErr + gauss(rng) * s };
}

export interface DartOptions {
  start: 301 | 501;
  doubleOut: boolean;
  /** 4 oyuncu, 2'şerli takım */
  teams: boolean;
}

export interface DartThrow { player: number; hit: Hit; bust: boolean }

export interface DartState {
  options: DartOptions;
  players: number;
  /** taraf (takım) başına kalan puan */
  remaining: number[];
  current: number;
  dartsThisTurn: number;
  /** turun başındaki kalan (bust olunca geri dönülür) */
  turnStart: number;
  throws: DartThrow[];
  winner: number | null; // kazanan taraf
  turnNo: number;
}

export class DartError extends Error {}

export const sideOf = (s: Pick<DartState, 'options'>, p: number) => (s.options.teams ? p % 2 : p);

export function newDart(options: DartOptions = { start: 501, doubleOut: true, teams: false }): DartState {
  const players = options.teams ? 4 : 2;
  return { options, players, remaining: [options.start, options.start], current: 0, dartsThisTurn: 0, turnStart: options.start, throws: [], winner: null, turnNo: 1 };
}

export interface ThrowResult { hit: Hit; bust: boolean; checkout: boolean; turnEnded: boolean }

export function throwDart(s: DartState, hit: Hit): ThrowResult {
  if (s.winner !== null) throw new DartError('Oyun bitti.');
  const side = sideOf(s, s.current);
  const after = s.remaining[side] - hit.score;
  const isDouble = hit.mult === 2; // iç boğa da çift sayılır
  let bust = after < 0 || (s.options.doubleOut && after === 1) || (after === 0 && s.options.doubleOut && !isDouble);
  let checkout = false;
  s.throws.push({ player: s.current, hit, bust });
  if (bust) {
    s.remaining[side] = s.turnStart;
    endTurn(s);
    return { hit, bust: true, checkout: false, turnEnded: true };
  }
  s.remaining[side] = after;
  s.dartsThisTurn++;
  if (after === 0) {
    checkout = true;
    s.winner = side;
    return { hit, bust, checkout, turnEnded: true };
  }
  if (s.dartsThisTurn >= 3) { endTurn(s); return { hit, bust, checkout, turnEnded: true }; }
  bust = false;
  return { hit, bust, checkout, turnEnded: false };
}

function endTurn(s: DartState) {
  s.current = (s.current + 1) % s.players;
  s.dartsThisTurn = 0;
  s.turnStart = s.remaining[sideOf(s, s.current)];
  if (s.current === 0) s.turnNo++;
}

/** Bot görünümü: yalnızca açık bilgi (dart'ta her şey açıktır) */
export interface DartView { me: number; myRemaining: number; dartsLeft: number; doubleOut: boolean }
export function viewDart(s: DartState, p: number): DartView {
  return { me: p, myRemaining: s.remaining[sideOf(s, p)], dartsLeft: 3 - s.dartsThisTurn, doubleOut: s.options.doubleOut };
}
