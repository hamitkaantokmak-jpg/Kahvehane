/**
 * Görünümü döndürme (saf): sunucudaki koltuk numaralarını, her oyuncunun kendini 0. koltukta (masanın altında) gördüğü
 * düzene çevirir. Böylece mevcut oyun arayüzleri ("sen = 0") çevrimiçinde aynen kullanılır.
 * Eşli oyunlarda ortaklık korunur: p ve p+2 döndürmeden sonra da ortaktır.
 */
import type { BatakState } from '../games/batak/batak';
import type { KingState } from '../games/king/king';
import type { PistiState } from '../games/pisti/pisti';
import type { GameEvent, OnlineGameId } from './protocol';

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

export function rotateView(game: OnlineGameId, view: unknown, me: number): unknown {
  if (game === 'batak') return rotateBatak(view as BatakState, me);
  if (game === 'king') return rotateKing(view as KingState, me);
  return rotatePisti(view as PistiState, me);
}

export function rotateEvent(e: GameEvent | null, me: number, n: number): GameEvent | null {
  if (!e) return e;
  return { ...e, seat: toRel(e.seat, me, n), winner: e.winner === undefined || e.winner === null ? e.winner : toRel(e.winner, me, n) };
}
