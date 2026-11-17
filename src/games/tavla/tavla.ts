/**
 * TAVLA kural motoru (gerçek kurallar, 24 hane).
 *
 * Temsil: points[0..23]. Pozitif sayı = oyuncu 0 (beyaz) pulları, negatif = oyuncu 1 (siyah).
 * Oyuncu 0, 23 → 0 yönünde ilerler; ev (iç saha) 0..5. Pulu toplamak "0'ın altına" çıkarmaktır.
 * Oyuncu 1, 0 → 23 yönünde ilerler; ev 18..23.
 *
 * Kurallar:
 * - 15'er pul, standart başlangıç dizilimi (24-13-8-6 haneleri: 2-5-3-5).
 * - Açılış: herkes bir zar atar, büyük atan başlar ve iki zarı yeniden atar (eşitlikte tekrar).
 * - Zarlar ayrı ayrı oynanır; çift zarda dört hamle. Mümkünse iki zarın da oynanması zorunludur;
 *   yalnızca biri oynanabiliyorsa ve ikisi de tek başına oynanabiliyorsa büyük zar oynanmalıdır.
 * - 2+ rakip pulu olan hane kapalıdır. Tek rakip pulu (açık pul) kırılır ve bara gider.
 * - Barda pulu olan oyuncu önce o pulları rakibin evinden oyuna sokmak zorundadır.
 * - Tüm pullar evdeyse toplama yapılır; zar tam değilse ve daha geride pul yoksa en gerideki pul toplanır.
 * - Sonuç: normal galibiyet 1, mars (rakip hiç pul toplayamadıysa) 2,
 *   katmerli mars (ayrıca rakibin barda ya da kazananın evinde pulu varsa) 3 puan — seçenekle açılır.
 * - Maç: hedef puana (varsayılan 5) ilk ulaşan kazanır. Katlama zarı (cube) kullanılmaz.
 */
import { Rng, createRng, randInt } from '../common/rng';

export type Player = 0 | 1;
export type From = number | 'bar';
export type To = number | 'off';

export interface Move {
  from: From;
  to: To;
  die: number;
  hit: boolean;
}

export interface TavlaOptions {
  target: number;
  katmerliMars: boolean;
}

export interface TavlaState {
  options: TavlaOptions;
  points: number[];
  bar: [number, number];
  off: [number, number];
  current: Player;
  phase: 'opening' | 'roll' | 'move' | 'gameOver' | 'matchOver';
  dice: number[];
  /** Kalan zar değerleri (çiftte 4 adet). */
  remaining: number[];
  openingRolls: [number, number] | null;
  score: [number, number];
  lastResult: { winner: Player; points: number; kind: 'normal' | 'mars' | 'katmerli' } | null;
  turnMoves: Move[];
  gameNo: number;
}

export class TavlaError extends Error {}

export function initialPoints(): number[] {
  const p = Array(24).fill(0);
  p[23] = 2; p[12] = 5; p[7] = 3; p[5] = 5;
  p[0] = -2; p[11] = -5; p[16] = -3; p[18] = -5;
  return p;
}

export function newTavla(options: TavlaOptions = { target: 5, katmerliMars: true }): TavlaState {
  return {
    options, points: initialPoints(), bar: [0, 0], off: [0, 0], current: 0, phase: 'opening',
    dice: [], remaining: [], openingRolls: null, score: [0, 0], lastResult: null, turnMoves: [], gameNo: 1,
  };
}

export function newGame(s: TavlaState) {
  if (s.phase === 'matchOver') throw new TavlaError('Maç bitti.');
  s.points = initialPoints();
  s.bar = [0, 0];
  s.off = [0, 0];
  s.phase = 'opening';
  s.dice = [];
  s.remaining = [];
  s.openingRolls = null;
  s.lastResult = null;
  s.turnMoves = [];
  s.gameNo++;
}

/** Açılış zarı: farklı gelene kadar atılır, büyük atan başlar. */
export function rollOpening(s: TavlaState, rng: Rng = createRng()): [number, number] {
  if (s.phase !== 'opening') throw new TavlaError('Açılış aşaması değil.');
  let a: number, b: number;
  do { a = randInt(rng, 1, 6); b = randInt(rng, 1, 6); } while (a === b);
  s.openingRolls = [a, b];
  s.current = a > b ? 0 : 1;
  s.phase = 'roll';
  return [a, b];
}

const owner = (v: number): Player | null => (v > 0 ? 0 : v < 0 ? 1 : null);
const dir = (p: Player) => (p === 0 ? -1 : 1);
const count = (pts: number[], i: number, p: Player) => (p === 0 ? Math.max(0, pts[i]) : Math.max(0, -pts[i]));

export interface Position {
  points: number[];
  bar: [number, number];
  off: [number, number];
}

function clonePos(s: Position): Position {
  return { points: [...s.points], bar: [s.bar[0], s.bar[1]], off: [s.off[0], s.off[1]] };
}

export function allHome(pos: Position, p: Player): boolean {
  if (pos.bar[p] > 0) return false;
  for (let i = 0; i < 24; i++) {
    const inHome = p === 0 ? i <= 5 : i >= 18;
    if (!inHome && count(pos.points, i, p) > 0) return false;
  }
  return true;
}

/** Tek bir zar için geçerli tekil hamleler. */
export function singleMoves(pos: Position, p: Player, die: number): Move[] {
  const moves: Move[] = [];
  const blocked = (i: number) => (p === 0 ? pos.points[i] <= -2 : pos.points[i] >= 2);
  const isBlot = (i: number) => (p === 0 ? pos.points[i] === -1 : pos.points[i] === 1);
  if (pos.bar[p] > 0) {
    const entry = p === 0 ? 24 - die : die - 1;
    if (!blocked(entry)) moves.push({ from: 'bar', to: entry, die, hit: isBlot(entry) });
    return moves;
  }
  const home = allHome(pos, p);
  for (let i = 0; i < 24; i++) {
    if (count(pos.points, i, p) === 0) continue;
    const t = i + dir(p) * die;
    if (t >= 0 && t <= 23) {
      if (!blocked(t)) moves.push({ from: i, to: t, die, hit: isBlot(t) });
    } else if (home) {
      const dist = p === 0 ? i + 1 : 24 - i; // toplama mesafesi
      if (dist === die) moves.push({ from: i, to: 'off', die, hit: false });
      else if (die > dist) {
        // daha geride pul yoksa toplanabilir
        let farther = false;
        if (p === 0) { for (let j = i + 1; j <= 5; j++) if (count(pos.points, j, 0) > 0) farther = true; }
        else { for (let j = 18; j < i; j++) if (count(pos.points, j, 1) > 0) farther = true; }
        if (!farther) moves.push({ from: i, to: 'off', die, hit: false });
      }
    }
  }
  return moves;
}

export function applyMove(pos: Position, p: Player, m: Move): void {
  const sign = p === 0 ? 1 : -1;
  if (m.from === 'bar') pos.bar[p]--;
  else pos.points[m.from] -= sign;
  if (m.to === 'off') { pos.off[p]++; return; }
  if (m.hit) {
    pos.points[m.to] = 0;
    pos.bar[(1 - p) as Player]++;
  }
  pos.points[m.to] += sign;
}

export interface Sequence {
  moves: Move[];
  result: Position;
}

/** Tüm geçerli tam-tur hamle dizileri (azami zar kullanımı kuralı uygulanmış). */
export function legalSequences(pos: Position, p: Player, dice: number[]): Sequence[] {
  const out: Sequence[] = [];
  const seen = new Set<string>();
  const rec = (cur: Position, remaining: number[], moves: Move[]) => {
    let any = false;
    const tried = new Set<number>();
    for (let di = 0; di < remaining.length; di++) {
      const d = remaining[di];
      if (tried.has(d)) continue;
      tried.add(d);
      for (const m of singleMoves(cur, p, d)) {
        any = true;
        const next = clonePos(cur);
        applyMove(next, p, m);
        const rest = [...remaining];
        rest.splice(di, 1);
        rec(next, rest, [...moves, m]);
      }
    }
    if (!any) {
      const key = moves.map((m) => `${m.from}>${m.to}:${m.die}`).join('|');
      if (!seen.has(key)) { seen.add(key); out.push({ moves, result: cur }); }
    }
  };
  rec(clonePos(pos), dice, []);
  const maxLen = Math.max(0, ...out.map((s) => s.moves.length));
  let legal = out.filter((s) => s.moves.length === maxLen);
  if (maxLen === 1 && dice.length === 2 && dice[0] !== dice[1]) {
    const hi = Math.max(...dice);
    if (legal.some((s) => s.moves[0].die === hi)) legal = legal.filter((s) => s.moves[0].die === hi);
  }
  return legal;
}

export function roll(s: TavlaState, rng: Rng = createRng(), forced?: [number, number]): number[] {
  if (s.phase !== 'roll') throw new TavlaError('Şu an zar atılamaz.');
  const a = forced ? forced[0] : randInt(rng, 1, 6);
  const b = forced ? forced[1] : randInt(rng, 1, 6);
  s.dice = [a, b];
  s.remaining = a === b ? [a, a, a, a] : [a, b];
  s.phase = 'move';
  s.turnMoves = [];
  if (legalSequences(s, s.current, s.remaining)[0].moves.length === 0) {
    // oynanacak hamle yok → sıra geçer
    s.remaining = [];
  }
  return s.dice;
}

/** Şu anda yapılabilecek tekil hamleler (bir sonraki adım). */
export function legalMoves(s: TavlaState): Move[] {
  if (s.phase !== 'move' || s.remaining.length === 0) return [];
  const seqs = legalSequences(s, s.current, s.remaining);
  const res: Move[] = [];
  const keys = new Set<string>();
  for (const q of seqs) {
    const m = q.moves[0];
    if (!m) continue;
    const k = `${m.from}>${m.to}:${m.die}`;
    if (!keys.has(k)) { keys.add(k); res.push(m); }
  }
  return res;
}

export function move(s: TavlaState, from: From, to: To, die?: number): Move {
  const legal = legalMoves(s).filter((m) => m.from === from && m.to === to && (die === undefined || m.die === die));
  if (!legal.length) throw new TavlaError('Geçersiz hamle.');
  // aynı kaynak/hedef için birden fazla zar mümkünse küçük olanı kullan (toplamada)
  const m = legal.sort((a, b) => a.die - b.die)[0];
  applyMove(s, s.current, m);
  s.remaining.splice(s.remaining.indexOf(m.die), 1);
  s.turnMoves.push(m);
  if (s.off[s.current] === 15) {
    endGame(s, s.current);
    return m;
  }
  if (legalMoves(s).length === 0) s.remaining = [];
  return m;
}

/** Hamleler bittiğinde (ya da hamle yoksa) sırayı devret. */
export function endTurn(s: TavlaState): void {
  if (s.phase !== 'move') throw new TavlaError('Tur bitirilemez.');
  if (s.remaining.length > 0 && legalMoves(s).length > 0) throw new TavlaError('Oynanması gereken zar var.');
  s.current = (1 - s.current) as Player;
  s.phase = 'roll';
  s.dice = [];
  s.remaining = [];
}

function endGame(s: TavlaState, winner: Player) {
  const loser = (1 - winner) as Player;
  let pts = 1;
  let kind: 'normal' | 'mars' | 'katmerli' = 'normal';
  if (s.off[loser] === 0) {
    pts = 2;
    kind = 'mars';
    if (s.options.katmerliMars) {
      let inWinnerHome = s.bar[loser] > 0;
      for (let i = 0; i < 24; i++) {
        const home = winner === 0 ? i <= 5 : i >= 18;
        if (home && count(s.points, i, loser) > 0) inWinnerHome = true;
      }
      if (inWinnerHome) { pts = 3; kind = 'katmerli'; }
    }
  }
  s.score[winner] += pts;
  s.lastResult = { winner, points: pts, kind };
  s.remaining = [];
  s.phase = s.score[winner] >= s.options.target ? 'matchOver' : 'gameOver';
}

export function pipCount(pos: Position, p: Player): number {
  let pip = pos.bar[p] * 25;
  for (let i = 0; i < 24; i++) pip += count(pos.points, i, p) * (p === 0 ? i + 1 : 24 - i);
  return pip;
}

export function totalCheckers(pos: Position, p: Player): number {
  let n = pos.bar[p] + pos.off[p];
  for (let i = 0; i < 24; i++) n += count(pos.points, i, p);
  return n;
}

export { owner };
