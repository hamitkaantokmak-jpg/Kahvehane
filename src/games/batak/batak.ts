/**
 * İHALELİ BATAK kural motoru (tekli ve eşli). Saf mantık, JSON'a çevrilebilir durum.
 *
 * Seçilen kurallar (kahvehanelerde en yaygın hali):
 * - 52 kart, 4 oyuncu, 13'er kart. Dağıtanın solundan başlayarak ihale: en az 5 (eşlide 7), en çok 13.
 *   Her oyuncu sırası gelince ya mevcut ihaleyi yükseltir ya da "pas" der; pas diyen o elde ihaleye dönmez.
 *   Üç kişi pas deyince ihale kalanındır; herkes pas derse son söz sahibi en az ihaleyle almak zorundadır.
 * - İhaleyi alan kozu seçer ve ilk kartı o açar.
 * - Oynayış: açılan renge uymak zorunludur; o renkten eli alabilecek bir kartın varsa yükseltmek zorunludur
 *   (ortaya koz düşmüşse renk kartı alamaz, yükseltme gerekmez). Rengin yoksa koz atmak zorunludur;
 *   ortada koz varsa ve geçebiliyorsan büyük koz atmak zorunludur. Koz da yoksa istediğin kartı atarsın.
 * - Koz "açılmadan" (biri renk tutamayıp koz atmadan) kozla el açılamaz; elinde yalnızca koz kaldıysa açabilirsin.
 * - Puan: ihaleyi tutturan aldığı el sayısı kadar alır, tutturamayan (batan) ihale kadar kaybeder;
 *   diğerleri aldıkları el sayısı kadar alır. Eşlide eşlerin elleri birlikte sayılır, puan iki eşe de yazılır.
 * - Maç: seçilen el sayısı oynanır, toplamı en yüksek olan (eşlide takım) kazanır.
 */
import { Rng } from '../common/rng';
import { Card, Suit, Play, deal4, trickWinner, currentWinning, power, next } from '../trick/trick';

export interface BatakOptions {
  /** Eşli batak (0-2 ve 1-3 takım) */
  partners: boolean;
  /** Maçtaki el sayısı */
  hands: number;
}

export type BatakPhase = 'bid' | 'trump' | 'play' | 'handOver' | 'matchOver';
export type Bid = number | 'pass' | null;

export interface BatakState {
  options: BatakOptions;
  hands: Card[][];
  dealer: number;
  current: number;
  phase: BatakPhase;
  bids: Bid[];
  highBid: number;
  bidder: number | null;
  trump: Suit | null;
  trumpBroken: boolean;
  trick: Play[];
  lastTrick: Play[] | null;
  lastWinner: number | null;
  tricksWon: number[];
  handScores: number[] | null;
  /** Bu elde ihale tuttu mu (el sonu) */
  made: boolean | null;
  totals: number[];
  handNo: number;
  /** Herkese açık oynanmış kartlar (bot hafızası) */
  played: Card[];
}

export class BatakError extends Error {}

export const minBid = (o: BatakOptions) => (o.partners ? 7 : 5);
export const teamOf = (s: BatakState, p: number) => (s.options.partners ? p % 2 : p);
export const partnerOf = (p: number) => (p + 2) % 4;

export function newBatak(options: BatakOptions, rng: Rng, dealer = 3): BatakState {
  const s: BatakState = {
    options, hands: [], dealer, current: 0, phase: 'bid', bids: [null, null, null, null], highBid: 0, bidder: null,
    trump: null, trumpBroken: false, trick: [], lastTrick: null, lastWinner: null, tricksWon: [0, 0, 0, 0],
    handScores: null, made: null, totals: [0, 0, 0, 0], handNo: 1, played: [],
  };
  startHand(s, rng);
  return s;
}

function startHand(s: BatakState, rng: Rng) {
  s.hands = deal4(rng);
  s.bids = [null, null, null, null];
  s.highBid = 0;
  s.bidder = null;
  s.trump = null;
  s.trumpBroken = false;
  s.trick = [];
  s.lastTrick = null;
  s.lastWinner = null;
  s.tricksWon = [0, 0, 0, 0];
  s.handScores = null;
  s.made = null;
  s.played = [];
  s.phase = 'bid';
  s.current = next(s.dealer);
}

export function nextHand(s: BatakState, rng: Rng) {
  if (s.phase !== 'handOver') throw new BatakError('El bitmedi.');
  s.handNo++;
  s.dealer = next(s.dealer);
  startHand(s, rng);
}

// ------------------------------------------------------------------ ihale
const passed = (s: BatakState) => s.bids.filter((b) => b === 'pass').length;

/** Bu oyuncunun verebileceği ihaleler (pas dahil) */
export function legalBids(s: BatakState, p: number): Bid[] {
  if (s.phase !== 'bid' || s.current !== p) return [];
  const lo = Math.max(minBid(s.options), s.highBid + 1);
  const out: Bid[] = [];
  for (let b = lo; b <= 13; b++) out.push(b);
  // herkes pas dediyse son kalan pas diyemez
  const mustTake = passed(s) === 3 && s.bidder === null;
  if (!mustTake) out.unshift('pass');
  return out;
}

export function bid(s: BatakState, p: number, b: number | 'pass') {
  if (s.phase !== 'bid') throw new BatakError('İhale zamanı değil.');
  if (s.current !== p) throw new BatakError('Sıra sende değil.');
  if (!legalBids(s, p).includes(b)) throw new BatakError('Bu ihale verilemez.');
  s.bids[p] = b;
  if (b !== 'pass') { s.highBid = b; s.bidder = p; }
  // ihale bitti mi: üç pas + bir ihaleci, ya da 13 söylendi
  if ((passed(s) === 3 && s.bidder !== null) || s.highBid === 13) {
    s.phase = 'trump';
    s.current = s.bidder!;
    return;
  }
  let q = next(p);
  while (s.bids[q] === 'pass') q = next(q);
  s.current = q;
}

export function chooseTrump(s: BatakState, p: number, suit: Suit) {
  if (s.phase !== 'trump' || s.bidder !== p) throw new BatakError('Kozu ihaleyi alan seçer.');
  s.trump = suit;
  s.phase = 'play';
  s.current = p;
}

// ------------------------------------------------------------------ oynayış
export function legalCards(s: BatakState, p: number): Card[] {
  if (s.phase !== 'play' || s.current !== p) return [];
  const hand = s.hands[p];
  const trump = s.trump!;
  if (!s.trick.length) {
    if (s.trumpBroken) return hand;
    const non = hand.filter((c) => c.suit !== trump);
    return non.length ? non : hand;
  }
  const lead = s.trick[0].card.suit;
  const win = currentWinning(s.trick, trump)!.card;
  const follow = hand.filter((c) => c.suit === lead);
  if (follow.length) {
    // ortaya koz düşmediyse ve yükseltebiliyorsan yükselt
    if (win.suit === lead) {
      const higher = follow.filter((c) => power(c) > power(win));
      if (higher.length) return higher;
    }
    return follow;
  }
  const trumps = hand.filter((c) => c.suit === trump);
  if (trumps.length) {
    if (win.suit === trump) {
      const over = trumps.filter((c) => power(c) > power(win));
      if (over.length) return over;
    }
    return trumps;
  }
  return hand;
}

export interface PlayResult { trickDone: boolean; winner: number | null; handOver: boolean }

export function playCard(s: BatakState, p: number, cardId: number): PlayResult {
  if (s.phase !== 'play') throw new BatakError('Kart oynama zamanı değil.');
  if (s.current !== p) throw new BatakError('Sıra sende değil.');
  const c = s.hands[p].find((x) => x.id === cardId);
  if (!c) throw new BatakError('Bu kart elinde yok.');
  if (!legalCards(s, p).some((x) => x.id === cardId)) throw new BatakError('Bu kart şimdi oynanamaz (renge uy, yükselt ya da koz at).');
  s.hands[p] = s.hands[p].filter((x) => x.id !== cardId);
  s.trick.push({ player: p, card: c });
  s.played.push(c);
  if (c.suit === s.trump) s.trumpBroken = true;
  if (s.trick.length < 4) { s.current = next(p); return { trickDone: false, winner: null, handOver: false }; }
  const w = trickWinner(s.trick, s.trump);
  s.tricksWon[w]++;
  s.lastTrick = s.trick;
  s.lastWinner = w;
  s.trick = [];
  s.current = w;
  if (s.hands.every((h) => h.length === 0)) { endHand(s); return { trickDone: true, winner: w, handOver: true }; }
  return { trickDone: true, winner: w, handOver: false };
}

/** El puanı: saf hesap (test edilebilir) */
export function scoreHand(tricks: number[], bidder: number, bidAmount: number, partners: boolean): { scores: number[]; made: boolean } {
  const team = (p: number) => (partners ? p % 2 : p);
  const teamTricks = (t: number) => tricks.reduce((a, n, p) => a + (team(p) === t ? n : 0), 0);
  const made = teamTricks(team(bidder)) >= bidAmount;
  const scores = [0, 1, 2, 3].map((p) => {
    const own = partners ? teamTricks(team(p)) : tricks[p];
    if (team(p) === team(bidder)) return made ? own : -bidAmount;
    return own;
  });
  return { scores, made };
}

function endHand(s: BatakState) {
  const r = scoreHand(s.tricksWon, s.bidder!, s.highBid, s.options.partners);
  s.handScores = r.scores;
  s.made = r.made;
  s.totals = s.totals.map((t, i) => t + r.scores[i]);
  s.phase = s.handNo >= s.options.hands ? 'matchOver' : 'handOver';
}

/** Maçı kazanan oyuncular (eşlide takım üyeleri) */
export function matchWinners(s: BatakState): number[] {
  const best = Math.max(...s.totals);
  return [0, 1, 2, 3].filter((p) => s.totals[p] === best);
}

/** Botun görebildikleri: kendi eli, ortadaki el, ihale/koz, alınan el sayıları, oynanmış kartlar */
export interface BatakView {
  me: number;
  hand: Card[];
  partners: boolean;
  phase: BatakPhase;
  bids: Bid[];
  highBid: number;
  bidder: number | null;
  trump: Suit | null;
  trumpBroken: boolean;
  trick: Play[];
  tricksWon: number[];
  handSizes: number[];
  played: Card[];
  legal: Card[];
  legalBids: Bid[];
  min: number;
}

export function viewBatak(s: BatakState, p: number): BatakView {
  return {
    me: p, hand: [...s.hands[p]], partners: s.options.partners, phase: s.phase, bids: [...s.bids], highBid: s.highBid,
    bidder: s.bidder, trump: s.trump, trumpBroken: s.trumpBroken, trick: [...s.trick], tricksWon: [...s.tricksWon],
    handSizes: s.hands.map((h) => h.length), played: [...s.played], legal: legalCards(s, p), legalBids: legalBids(s, p), min: minBid(s.options),
  };
}
