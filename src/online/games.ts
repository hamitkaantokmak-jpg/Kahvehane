/**
 * Çevrimiçi oyun bağdaştırıcıları (saf). Her oyun için: kurulum, sırası gelen koltuk, hamle doğrulama + uygulama,
 * bot hamlesi ve koltuğa özel GİZLİ BİLGİSİ ÇIKARILMIŞ görünüm. Kural motorlarına dokunmaz, onları kullanır.
 */
import type { Rng } from '../games/common/rng';
import type { Difficulty } from '../games/common/types';
import type { Card } from '../games/pisti/pisti';
import * as B from '../games/batak/batak';
import * as K from '../games/king/king';
import * as P from '../games/pisti/pisti';
import { decideBid, decideTrump, chooseBatakCard } from '../games/batak/batakBot';
import { decideContract, decideKingTrump, chooseKingCard } from '../games/king/kingBot';
import { choosePistiCard } from '../games/pisti/pistiBot';
import type { GameAction, GameEvent, OnlineGameId, OnlineOptions } from './protocol';

export interface OnlineGame<S> {
  create(o: OnlineOptions, rng: Rng): S;
  /** Şu an kimin hamle yapması gerekiyor (el/maç bittiyse null) */
  actor(s: S): number | null;
  /** Hamleyi doğrula ve uygula (geçersizse hata fırlatır); olay özetini döndürür */
  apply(s: S, seat: number, a: GameAction): Omit<GameEvent, 'seat' | 'action'>;
  bot(s: S, seat: number, rng: Rng, d: Difficulty): GameAction;
  /** Koltuğa özel görünüm: başkalarının eli, deste ve kapalı kartlar gizli */
  view(s: S, seat: number): S;
  handOver(s: S): boolean;
  matchOver(s: S): boolean;
  nextHand(s: S, rng: Rng): void;
  /** Maç sonu: kazanan koltuklar ve toplamlar */
  result(s: S): { winners: number[]; totals: number[] };
}

/** Gizli kart: yalnızca var olduğu bilinir */
const hidden = (n: number, salt: number): Card[] => Array.from({ length: n }, (_, k) => ({ id: -1 - salt * 100 - k, suit: 0, rank: 0 }) as Card);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const hideHands = (hands: Card[][], seat: number) => hands.map((h, p) => (p === seat ? h : hidden(h.length, p + 1)));

function need<T>(cond: T, msg: string): asserts cond { if (!cond) throw new Error(msg); }

export const batakGame: OnlineGame<B.BatakState> = {
  create: (o, rng) => B.newBatak({ partners: o.batakPartners, hands: o.batakHands, zeroPenalty: o.batakZeroPenalty }, rng),
  actor: (s) => (s.phase === 'bid' || s.phase === 'play' ? s.current : s.phase === 'trump' ? s.bidder : null),
  apply(s, seat, a) {
    if (a.k === 'bid') { B.bid(s, seat, a.b); return {}; }
    if (a.k === 'trump') { B.chooseTrump(s, seat, a.suit); return {}; }
    need(a.k === 'play', 'Geçersiz hamle.');
    const r = B.playCard(s, seat, a.id);
    return { trickDone: r.trickDone, winner: r.winner, handOver: r.handOver };
  },
  bot(s, seat, rng, d) {
    const v = B.viewBatak(s, seat);
    if (s.phase === 'bid') return { k: 'bid', b: decideBid(v, rng, d) as number | 'pass' };
    if (s.phase === 'trump') return { k: 'trump', suit: decideTrump(v) };
    return { k: 'play', id: chooseBatakCard(v, rng, d) };
  },
  view(s, seat) { const c = clone(s); c.hands = hideHands(s.hands, seat); return c; },
  handOver: (s) => s.phase === 'handOver' || s.phase === 'matchOver',
  matchOver: (s) => s.phase === 'matchOver',
  nextHand: (s, rng) => B.nextHand(s, rng),
  result: (s) => ({ winners: B.matchWinners(s), totals: [...s.totals] }),
};

export const kingGame: OnlineGame<K.KingState> = {
  create: (o, rng) => K.newKing({ short: o.kingShort }, rng, 0),
  actor: (s) => (s.phase === 'choose' || s.phase === 'trump' ? s.chooser : s.phase === 'play' ? s.current : null),
  apply(s, seat, a) {
    if (a.k === 'contract') { K.chooseContract(s, seat, a.c as K.Contract); return {}; }
    if (a.k === 'trump') { K.chooseTrump(s, seat, a.suit); return {}; }
    need(a.k === 'play', 'Geçersiz hamle.');
    const r = K.playCard(s, seat, a.id);
    return { trickDone: r.trickDone, winner: r.winner, handOver: r.handOver };
  },
  bot(s, seat, rng, d) {
    const v = K.viewKing(s, seat);
    if (s.phase === 'choose') return { k: 'contract', c: decideContract(v, rng, d) };
    if (s.phase === 'trump') return { k: 'trump', suit: decideKingTrump(v) };
    return { k: 'play', id: chooseKingCard(v, rng, d) };
  },
  // alınan kartlar ve oynanmış kartlar herkese açıktır (masada açık oynandı)
  view(s, seat) { const c = clone(s); c.hands = hideHands(s.hands, seat); return c; },
  handOver: (s) => s.phase === 'handOver' || s.phase === 'matchOver',
  matchOver: (s) => s.phase === 'matchOver',
  nextHand: (s, rng) => K.nextHand(s, rng),
  result: (s) => ({ winners: K.matchWinners(s), totals: [...s.totals] }),
};

function pistiGame(players: 2 | 4): OnlineGame<P.PistiState> {
  return {
    create: (o, rng) => P.newPisti({ players, target: o.pistiTarget }, rng),
    actor: (s) => (s.phase === 'play' ? s.current : null),
    apply(s, seat, a) {
      need(a.k === 'play', 'Geçersiz hamle.');
      const before = s.handNo;
      const ev = P.playCard(s, seat, a.id);
      return { winner: ev ? ev.player : null, trickDone: !!ev, pisti: ev?.pisti ?? 0, handOver: s.phase !== 'play' || s.handNo !== before };
    },
    bot: (s, seat, rng, d) => ({ k: 'play', id: choosePistiCard(P.viewPisti(s, seat), rng, d) }),
    view(s, seat) {
      const c = clone(s);
      c.hands = hideHands(s.hands, seat);
      c.deck = hidden(s.deck.length, 9);
      // yerdeki kapalı kartlar
      c.pile = s.pile.map((card, i) => (i < s.hiddenCount ? hidden(1, 8 + i)[0] : card));
      return c;
    },
    handOver: (s) => s.phase !== 'play',
    matchOver: (s) => s.phase === 'matchOver',
    nextHand: (s, rng) => P.nextHand(s, rng),
    result(s) {
      const w = P.matchWinnerSide(s);
      const seats = Array.from({ length: players }, (_, i) => i);
      return { winners: seats.filter((p) => P.sideOf(s, p) === w), totals: seats.map((p) => s.totals[P.sideOf(s, p)]) };
    },
  };
}

export const ONLINE_ENGINES: Record<OnlineGameId, OnlineGame<unknown>> = {
  batak: batakGame as OnlineGame<unknown>,
  king: kingGame as OnlineGame<unknown>,
  pisti4: pistiGame(4) as OnlineGame<unknown>,
  pisti2: pistiGame(2) as OnlineGame<unknown>,
};
