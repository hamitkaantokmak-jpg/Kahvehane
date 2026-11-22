/**
 * Görünümü döndürme (saf): sunucudaki koltuk numaralarını, her oyuncunun kendini 0. koltukta (masanın altında) gördüğü
 * düzene çevirir. Böylece mevcut oyun arayüzleri ("sen = 0") çevrimiçinde aynen kullanılır.
 * Eşli oyunlarda ortaklık korunur: p ve p+2 döndürmeden sonra da ortaktır.
 */
import type { BatakState } from '../games/batak/batak';
import type { KingState } from '../games/king/king';
import type { PistiState } from '../games/pisti/pisti';
import type { OkeyState } from '../games/okey/okey';
import type { Okey101State } from '../games/okey101/okey101';
import type { TavlaState, Move } from '../games/tavla/tavla';
import type { GameAction, GameEvent, OnlineGameId } from './protocol';

/** Mutlak koltuk → göreli (ben = 0) */
export const toRel = (p: number, me: number, n: number) => (((p - me) % n) + n) % n;
/** Göreli → mutlak */
export const toAbs = (r: number, me: number, n: number) => (r + me) % n;

/** Koltuk sırasıyla dizilmiş diziyi döndür: yeni[toRel(p)] = eski[p] */
export function rotArr<T>(a: T[], me: number): T[] {
  const n = a.length;
  return a.map((_, r) => a[toAbs(r, me, n)]);
}

const rp = (p: number | null, me: number, n: number) => (p === null || p === undefined ? p : toRel(p, me, n));
const rotPlays = <T extends { player: number }>(t: T[] | null, me: number, n: number) => (t ? t.map((x) => ({ ...x, player: toRel(x.player, me, n) })) : t);

export function rotateBatak(s: BatakState, me: number): BatakState {
  const n = 4;
  return {
    ...s,
    hands: rotArr(s.hands, me), dealer: toRel(s.dealer, me, n), current: toRel(s.current, me, n), bids: rotArr(s.bids, me),
    bidder: rp(s.bidder, me, n), trick: rotPlays(s.trick, me, n)!, lastTrick: rotPlays(s.lastTrick, me, n), lastWinner: rp(s.lastWinner, me, n),
    tricksWon: rotArr(s.tricksWon, me), handScores: s.handScores ? rotArr(s.handScores, me) : null, totals: rotArr(s.totals, me),
  };
}

export function rotateKing(s: KingState, me: number): KingState {
  const n = 4;
  return {
    ...s,
    hands: rotArr(s.hands, me), chooser: toRel(s.chooser, me, n), current: toRel(s.current, me, n), trick: rotPlays(s.trick, me, n)!,
    lastTrick: rotPlays(s.lastTrick, me, n), lastWinner: rp(s.lastWinner, me, n), taken: rotArr(s.taken, me), tricksWon: rotArr(s.tricksWon, me),
    handScores: s.handScores ? rotArr(s.handScores, me) : null, totals: rotArr(s.totals, me), kozChosen: rotArr(s.kozChosen, me), cezaChosen: rotArr(s.cezaChosen, me),
    history: s.history.map((h) => ({ ...h, chooser: toRel(h.chooser, me, n), scores: rotArr(h.scores, me) })),
    sonIkiWinners: s.sonIkiWinners.map((w) => toRel(w, me, n)),
  };
}

export function rotatePisti(s: PistiState, me: number): PistiState {
  const n = s.options.players;
  // taraf dizileri (0: 0-2, 1: 1-3) tek sayıda döndürmede yer değiştirir
  const sideSwap = me % 2 === 1;
  const side = <T>(a: T[]): T[] => (sideSwap ? [a[1], a[0]] : a);
  return {
    ...s,
    hands: rotArr(s.hands, me), current: toRel(s.current, me, n), dealer: toRel(s.dealer, me, n),
    captured: side(s.captured), pistis: side(s.pistis), totals: side(s.totals), handScores: s.handScores ? side(s.handScores) : null,
    lastCapturer: rp(s.lastCapturer, me, n), lastEvent: s.lastEvent ? { ...s.lastEvent, player: toRel(s.lastEvent.player, me, n) } : null,
  };
}

export function rotateOkey(s: OkeyState, me: number): OkeyState {
  const n = 4;
  return {
    ...s,
    hands: rotArr(s.hands, me), discards: rotArr(s.discards, me), current: toRel(s.current, me, n), starter: toRel(s.starter, me, n),
    hasDiscarded: rotArr(s.hasDiscarded, me), indicatorShownBy: rp(s.indicatorShownBy, me, n), scores: rotArr(s.scores, me),
    result: s.result ? { ...s.result, winner: rp(s.result.winner, me, n), deductions: rotArr(s.result.deductions, me) } : null,
    takes: s.takes.map((t) => ({ ...t, player: toRel(t.player, me, n) })),
  };
}

export function rotateOkey101(s: Okey101State, me: number): Okey101State {
  const n = 4;
  return {
    ...s,
    hands: rotArr(s.hands, me), discards: rotArr(s.discards, me), current: toRel(s.current, me, n), starter: toRel(s.starter, me, n),
    table: s.table.map((m) => ({ ...m, owner: toRel(m.owner, me, n) })), opened: rotArr(s.opened, me), penalties: rotArr(s.penalties, me),
    totals: rotArr(s.totals, me), result: s.result ? { ...s.result, winner: rp(s.result.winner, me, n), points: rotArr(s.result.points, me) } : null,
  };
}

/**
 * Tavla: 2. oyuncu (koltuk 1) tahtayı ters tarafından görür. Hane i ↔ 23-i aynalanır, pul renkleri/işaretleri yer değiştirir;
 * böylece herkes kendini beyaz (0) olarak, 23 → 0 yönünde oynar görür.
 */
const mirPt = <T extends number | 'bar' | 'off'>(x: T): T => (typeof x === 'number' ? ((23 - x) as T) : x);
export function rotateTavla(s: TavlaState, me: number): TavlaState {
  if (me % 2 === 0) return s;
  const sw = <T>(a: [T, T]): [T, T] => [a[1], a[0]];
  return {
    ...s,
    points: s.points.map((_, i) => -s.points[23 - i] || 0),
    bar: sw(s.bar), off: sw(s.off), score: sw(s.score), current: (1 - s.current) as 0 | 1,
    openingRolls: s.openingRolls ? sw(s.openingRolls) : null,
    lastResult: s.lastResult ? { ...s.lastResult, winner: (1 - s.lastResult.winner) as 0 | 1 } : null,
    turnMoves: s.turnMoves.map((m: Move) => ({ ...m, from: mirPt(m.from), to: mirPt(m.to) })),
  };
}

export function rotateView(game: OnlineGameId, view: unknown, me: number): unknown {
  if (game === 'batak') return rotateBatak(view as BatakState, me);
  if (game === 'king') return rotateKing(view as KingState, me);
  if (game === 'okey') return rotateOkey(view as OkeyState, me);
  if (game === 'okey101') return rotateOkey101(view as Okey101State, me);
  if (game === 'tavla') return rotateTavla(view as TavlaState, me);
  return rotatePisti(view as PistiState, me);
}

/** İstemcinin (göreli görünümde) yaptığı hamleyi sunucunun mutlak düzenine çevir. Yalnızca tavla hane numaraları değişir. */
export function actionToAbs(game: OnlineGameId, a: GameAction, me: number): GameAction {
  if (game === 'tavla' && a.k === 'move' && me % 2 === 1) return { ...a, from: mirPt(a.from), to: mirPt(a.to) };
  return a;
}

export function rotateEvent(e: GameEvent | null, me: number, n: number): GameEvent | null {
  if (!e) return e;
  return { ...e, seat: toRel(e.seat, me, n), winner: e.winner === undefined || e.winner === null ? e.winner : toRel(e.winner, me, n) };
}
