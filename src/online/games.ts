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
import * as O from '../games/okey/okey';
import * as H from '../games/okey101/okey101';
import * as V from '../games/tavla/tavla';
import { decideOkey } from '../games/okey/okeyBot';
import { decideDraw101, stepTurn101 } from '../games/okey101/okey101Bot';
import { chooseSequence } from '../games/tavla/tavlaBot';
import type { Tile } from '../games/common/tiles';
import type { GameAction, GameEvent, OnlineGameId, OnlineOptions } from './protocol';

export interface OnlineGame<S> {
  create(o: OnlineOptions, rng: Rng): S;
  /** Şu an kimin hamle yapması gerekiyor (el/maç bittiyse null) */
  actor(s: S): number | null;
  /** Hamleyi doğrula ve uygula (geçersizse hata fırlatır); olay özetini döndürür */
  apply(s: S, seat: number, a: GameAction, rng: Rng): Omit<GameEvent, 'seat' | 'action'>;
  bot(s: S, seat: number, rng: Rng, d: Difficulty): GameAction;
  /** Bot hamlesi bir sebeple geçersiz çıkarsa: oyunu kilitlemeyen en basit hamle */
  safe?(s: S, seat: number): GameAction;
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

// ---------------------------------------------------------------- okey ailesi
/** Gizli taş: kimliği belli olmayan, yalnızca var olduğu bilinen taş (kimliği sızdırmasın diye yeni numara) */
const hiddenTiles = (n: number, salt: number): Tile[] => Array.from({ length: n }, (_, k) => ({ id: -1 - salt * 1000 - k, color: 0, num: 0, fake: false }) as Tile);
const hideTileHands = (hands: Tile[][], seat: number) => hands.map((h, p) => (p === seat ? h : hiddenTiles(h.length, p + 1)));
const isIdList = (x: unknown): x is number[] => Array.isArray(x) && x.length <= 30 && x.every((v) => Number.isInteger(v));

export const okeyGame: OnlineGame<O.OkeyState> = {
  create: (_o, rng) => O.newMatch(rng, 0),
  actor: (s) => (s.phase === 'ended' ? null : s.current),
  apply(s, seat, a) {
    if (a.k === 'indicator') { O.showIndicator(s, seat); return { handOver: s.phase === 'ended' }; }
    if (a.k === 'draw') { if (a.from === 'left') O.drawFromDiscard(s, seat); else O.drawFromDeck(s, seat); return {}; }
    if (a.k === 'discard') { need(Number.isInteger(a.id), 'Geçersiz taş.'); O.discard(s, seat, a.id); return { handOver: s.phase === 'ended' }; }
    need(a.k === 'finish' && Number.isInteger(a.id), 'Geçersiz hamle.');
    O.finish(s, seat, a.id);
    return { handOver: true, winner: seat };
  },
  bot(s, seat, rng, d) {
    if (O.canShowIndicator(s, seat)) return { k: 'indicator' };
    const a = decideOkey(O.viewFor(s, seat), rng, d);
    if (a.type === 'drawDeck') return { k: 'draw', from: 'deck' };
    if (a.type === 'drawDiscard') return { k: 'draw', from: 'left' };
    if (a.type === 'discard') return { k: 'discard', id: a.tileId };
    return { k: 'finish', id: a.tileId };
  },
  safe: (s, seat) => (s.phase === 'draw' ? { k: 'draw', from: 'deck' } : { k: 'discard', id: s.hands[seat][0].id }),
  view(s, seat) {
    const c = clone(s);
    c.hands = hideTileHands(s.hands, seat);
    c.deck = hiddenTiles(s.deck.length, 9);
    if (s.current !== seat) c.lastDrawn = null;
    c.log = [];
    return c;
  },
  handOver: (s) => s.phase === 'ended',
  matchOver: (s) => s.matchOver,
  nextHand: (s, rng) => O.nextHand(s, rng),
  result: (s) => ({ winners: [O.matchWinner(s)], totals: [...s.scores] }),
};

export const okey101Game: OnlineGame<H.Okey101State> = {
  create: (o, rng) => H.newMatch101(rng, { hands: o.okey101Hands, doubling: o.okey101Doubling }, 0),
  actor: (s) => (s.phase === 'ended' ? null : s.current),
  apply(s, seat, a) {
    switch (a.k) {
      case 'draw': if (a.from === 'left') H.drawDiscard101(s, seat); else H.drawDeck101(s, seat); return {};
      case 'return': H.returnDiscard101(s, seat); return {};
      // bot: yerden aldığını kullanamadı → geri koy ve desteden çek
      case 'returnDraw': H.returnDiscard101(s, seat); H.drawDeck101(s, seat); return {};
      case 'open': {
        need((a.mode === 'melds' || a.mode === 'pairs') && Array.isArray(a.groups) && a.groups.length <= 12 && a.groups.every(isIdList), 'Geçersiz per.');
        H.open101(s, seat, a.mode, a.groups);
        return {};
      }
      case 'lay': need(isIdList(a.ids), 'Geçersiz per.'); H.layMeld101(s, seat, a.ids); return {};
      case 'add': need(Number.isInteger(a.id) && Number.isInteger(a.meld), 'Geçersiz taş.'); H.addToMeld101(s, seat, a.id, a.meld); return {};
      case 'swap': need(Number.isInteger(a.id) && Number.isInteger(a.meld), 'Geçersiz taş.'); H.swapJoker101(s, seat, a.id, a.meld); return {};
      case 'discard': {
        need(Number.isInteger(a.id), 'Geçersiz taş.');
        const r = H.discard101(s, seat, a.id);
        return { penalty: r.penalty, handOver: s.phase === 'ended', winner: r.finished ? seat : undefined };
      }
      default: throw new Error('Geçersiz hamle.');
    }
  },
  bot(s, seat, rng, d) {
    if (s.phase === 'draw') return { k: 'draw', from: decideDraw101(H.view101(s, seat), d) === 'discard' ? 'left' : 'deck' };
    const a = stepTurn101(H.view101(s, seat), rng, d);
    if (!a) return s.takenDiscard !== null && !s.actedThisTurn ? { k: 'returnDraw' } : { k: 'discard', id: s.hands[seat][0].id };
    if (a.type === 'open') return { k: 'open', mode: a.mode, groups: a.groups };
    if (a.type === 'lay') return { k: 'lay', ids: a.ids };
    if (a.type === 'add') return { k: 'add', id: a.tileId, meld: a.meldId };
    if (a.type === 'swap') return { k: 'swap', id: a.tileId, meld: a.meldId };
    return { k: 'discard', id: a.tileId };
  },
  safe(s, seat) {
    if (s.phase === 'draw') return { k: 'draw', from: 'deck' };
    if (s.takenDiscard !== null && !s.actedThisTurn) return { k: 'returnDraw' };
    return { k: 'discard', id: s.hands[seat][0].id };
  },
  view(s, seat) {
    const c = clone(s);
    c.hands = hideTileHands(s.hands, seat);
    c.deck = hiddenTiles(s.deck.length, 9);
    c.log = [];
    return c;
  },
  handOver: (s) => s.phase === 'ended',
  matchOver: (s) => s.matchOver,
  nextHand: (s, rng) => H.nextHand101(s, rng),
  result: (s) => ({ winners: [H.matchWinner101(s)], totals: [...s.totals] }),
};

// ---------------------------------------------------------------- tavla
/** Çevrimiçi tavla durumu: tur başındaki konum (geri alma için) saklanır */
export type OnlineTavla = V.TavlaState & { undo?: string | null };
const tavlaSnap = (s: OnlineTavla) => JSON.stringify({ points: s.points, bar: s.bar, off: s.off, remaining: s.remaining, turnMoves: s.turnMoves });

export const tavlaGame: OnlineGame<OnlineTavla> = {
  create: (o) => ({ ...V.newTavla({ target: o.tavlaTarget, katmerliMars: o.tavlaKatmerli }), undo: null }),
  actor: (s) => (s.phase === 'opening' ? 0 : s.phase === 'roll' || s.phase === 'move' ? s.current : null),
  apply(s, seat, a, rng) {
    switch (a.k) {
      case 'opening': V.rollOpening(s, rng); return {};
      case 'roll': V.roll(s, rng); s.undo = tavlaSnap(s); return {};
      case 'undo': {
        need(s.phase === 'move' && !!s.undo, 'Geri alınacak hamle yok.');
        Object.assign(s, JSON.parse(s.undo!));
        return {};
      }
      case 'end': V.endTurn(s); s.undo = null; return {};
      case 'move': {
        const ok = (x: unknown, word: string) => x === word || (Number.isInteger(x) && (x as number) >= 0 && (x as number) < 24);
        need(ok(a.from, 'bar') && ok(a.to, 'off'), 'Geçersiz hamle.');
        const m = V.move(s, a.from, a.to);
        const over = s.phase === 'gameOver' || s.phase === 'matchOver';
        // zarlar bitti: sıra kendiliğinden geçer
        if (!over && s.phase === 'move' && s.remaining.length === 0) { V.endTurn(s); s.undo = null; }
        return { hit: m.hit, handOver: over, winner: over ? seat : undefined };
      }
      default: throw new Error('Geçersiz hamle.');
    }
  },
  bot(s, seat, rng, d) {
    if (s.phase === 'opening') return { k: 'opening' };
    if (s.phase === 'roll') return { k: 'roll' };
    if (s.remaining.length === 0 || V.legalMoves(s).length === 0) return { k: 'end' };
    const seq = chooseSequence(s, seat as V.Player, [...s.remaining], rng, 0.8, d);
    const m = seq[0] ?? V.legalMoves(s)[0];
    return { k: 'move', from: m.from, to: m.to };
  },
  safe(s) {
    if (s.phase === 'opening') return { k: 'opening' };
    if (s.phase === 'roll') return { k: 'roll' };
    const m = V.legalMoves(s)[0];
    return m ? { k: 'move', from: m.from, to: m.to } : { k: 'end' };
  },
  view(s) { const c = clone(s); delete c.undo; return c; },
  handOver: (s) => s.phase === 'gameOver' || s.phase === 'matchOver',
  matchOver: (s) => s.phase === 'matchOver',
  nextHand: (s) => { V.newGame(s); s.undo = null; },
  result: (s) => ({ winners: [s.score[0] > s.score[1] ? 0 : 1], totals: [...s.score] }),
};

export const ONLINE_ENGINES: Record<OnlineGameId, OnlineGame<unknown>> = {
  batak: batakGame as OnlineGame<unknown>,
  king: kingGame as OnlineGame<unknown>,
  pisti4: pistiGame(4) as OnlineGame<unknown>,
  pisti2: pistiGame(2) as OnlineGame<unknown>,
  okey: okeyGame as OnlineGame<unknown>,
  okey101: okey101Game as OnlineGame<unknown>,
  tavla: tavlaGame as OnlineGame<unknown>,
};
