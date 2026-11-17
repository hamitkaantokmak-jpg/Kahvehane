/**
 * PİŞTİ kural motoru — 2 ve 4 kişilik modlar aynı motoru kullanır.
 *
 * Seçilen kurallar (Türkiye'de en yaygın varyant):
 * - 52 kartlık deste. Yere 4 kart açılır (3'ü kapalı, en üstteki açık). Üstteki kart vale ise
 *   desteye karıştırılıp yeni kart açılır.
 * - Her oyuncuya 4'er kart dağıtılır; eller bitince deste bitene kadar yeniden 4'er kart dağıtılır.
 * - Oynanan kart yerdeki en üst kartla aynı değerdeyse ya da vale ise yerdeki tüm kartlar alınır.
 * - Yerde yalnızca bir kart varken aynı değerdeki kartla almak PİŞTİ'dir (10 puan).
 *   Tek valeyi vale ile almak çift pişti (20 puan). Valeyle vale olmayan tek kartı almak pişti değildir.
 * - Puanlar: her As 1, her Vale 1, Sinek 2 = 2, Karo 10 = 3, en çok kartı toplayan 3 (eşitlikte kimse).
 * - Son elde yerde kalan kartlar son alan oyuncuya/takıma gider.
 * - 4 kişilik modda karşılıklı oturanlar (0-2 ve 1-3) takımdır.
 * - Maç: hedef puana (varsayılan 151) ulaşılan elin sonunda en yüksek puanlı taraf kazanır.
 */
import { Rng, createRng, shuffle } from '../common/rng';

export type Suit = 0 | 1 | 2 | 3; // ♠ ♥ ♦ ♣
export const SUIT_SYMBOL = ['♠', '♥', '♦', '♣'] as const;
export const SUIT_NAME = ['Maça', 'Kupa', 'Karo', 'Sinek'] as const;
export const RANK_LABEL = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export interface Card {
  id: number;
  suit: Suit;
  rank: number; // 1 = As, 11 = Vale, 12 = Kız, 13 = Papaz
}

export const JACK = 11;

export function createDeck(): Card[] {
  const d: Card[] = [];
  let id = 0;
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) d.push({ id: id++, suit: s as Suit, rank: r });
  return d;
}

export function cardPoints(c: Card): number {
  if (c.suit === 2 && c.rank === 10) return 3;
  if (c.suit === 3 && c.rank === 2) return 2;
  if (c.rank === 1 || c.rank === JACK) return 1;
  return 0;
}

export function cardLabel(c: Card): string {
  return `${SUIT_SYMBOL[c.suit]}${RANK_LABEL[c.rank]}`;
}

export interface PistiOptions {
  players: 2 | 4;
  target: number;
}

export interface CaptureEvent {
  player: number;
  card: Card;
  cards: Card[];
  pisti: 0 | 10 | 20;
}

export interface SideTally {
  cards: number;
  points: number; // kart puanları
  pistiPoints: number;
}

export interface PistiState {
  options: PistiOptions;
  deck: Card[];
  hands: Card[][];
  pile: Card[];
  /** Yerdeki ilk 3 kapalı kart (pile içindeki ilk kartlar) sayısı — UI için. */
  hiddenCount: number;
  current: number;
  dealer: number;
  captured: Card[][]; // taraf (takım) başına
  pistis: number[]; // taraf başına pişti puanı
  lastCapturer: number | null;
  handScores: number[] | null;
  totals: number[];
  phase: 'play' | 'handOver' | 'matchOver';
  round: number;
  handNo: number;
  lastEvent: CaptureEvent | null;
  /** Herkese açık oynanmış kartlar (bot hafızası için). */
  played: Card[];
}

export class PistiError extends Error {}

export const sideOf = (s: PistiState, p: number) => (s.options.players === 4 ? p % 2 : p);
export const sideCount = (s: PistiState) => (s.options.players === 4 ? 2 : 2);

export function newPisti(options: PistiOptions = { players: 2, target: 151 }, rng: Rng = createRng()): PistiState {
  const s: PistiState = {
    options, deck: [], hands: [], pile: [], hiddenCount: 0, current: 0, dealer: options.players - 1,
    captured: [[], []], pistis: [0, 0], lastCapturer: null, handScores: null, totals: [0, 0], phase: 'play',
    round: 0, handNo: 0, lastEvent: null, played: [],
  };
  dealHand(s, rng);
  return s;
}

export function dealHand(s: PistiState, rng: Rng) {
  s.deck = shuffle(createDeck(), rng);
  s.pile = s.deck.splice(0, 4);
  // üstteki kart vale ise desteye karıştır ve yeniden aç
  let guard = 0;
  while (s.pile[3].rank === JACK && guard++ < 50) {
    const j = s.pile.pop()!;
    s.deck.push(j);
    shuffle(s.deck, rng);
    s.pile.push(s.deck.shift()!);
  }
  s.hiddenCount = 3;
  s.played = [s.pile[3]];
  s.hands = Array.from({ length: s.options.players }, () => []);
  s.captured = [[], []];
  s.pistis = [0, 0];
  s.lastCapturer = null;
  s.handScores = null;
  s.phase = 'play';
  s.round = 0;
  s.handNo++;
  s.dealer = (s.dealer + 1) % s.options.players;
  s.current = (s.dealer + 1) % s.options.players;
  s.lastEvent = null;
  dealRound(s);
}

function dealRound(s: PistiState) {
  for (let i = 0; i < s.options.players; i++) s.hands[i] = s.deck.splice(0, 4);
  s.round++;
}

export function playCard(s: PistiState, p: number, cardId: number): CaptureEvent | null {
  if (s.phase !== 'play') throw new PistiError('El bitti.');
  if (s.current !== p) throw new PistiError('Sıra sende değil.');
  const hand = s.hands[p];
  const i = hand.findIndex((c) => c.id === cardId);
  if (i < 0) throw new PistiError('Bu kart elinde değil.');
  const [card] = hand.splice(i, 1);
  s.played.push(card);
  const top = s.pile[s.pile.length - 1];
  let ev: CaptureEvent | null = null;
  if (top && (card.rank === top.rank || card.rank === JACK)) {
    let pisti: 0 | 10 | 20 = 0;
    if (s.pile.length === 1 && card.rank === top.rank) pisti = card.rank === JACK ? 20 : 10;
    const cards = [...s.pile, card];
    const side = sideOf(s, p);
    s.captured[side].push(...cards);
    s.pistis[side] += pisti;
    s.pile = [];
    s.hiddenCount = 0;
    s.lastCapturer = p;
    ev = { player: p, card, cards, pisti };
  } else {
    s.pile.push(card);
  }
  s.lastEvent = ev;
  s.current = (p + 1) % s.options.players;
  if (s.hands.every((h) => h.length === 0)) {
    if (s.deck.length > 0) dealRound(s);
    else endHand(s);
  }
  return ev;
}

export function tally(s: PistiState): SideTally[] {
  return [0, 1].map((side) => ({
    cards: s.captured[side].length,
    points: s.captured[side].reduce((a, c) => a + cardPoints(c), 0),
    pistiPoints: s.pistis[side],
  }));
}

function endHand(s: PistiState) {
  if (s.pile.length && s.lastCapturer !== null) {
    s.captured[sideOf(s, s.lastCapturer)].push(...s.pile);
    s.pile = [];
  }
  const t = tally(s);
  const scores = t.map((x) => x.points + x.pistiPoints);
  if (t[0].cards > t[1].cards) scores[0] += 3;
  else if (t[1].cards > t[0].cards) scores[1] += 3;
  s.handScores = scores;
  s.totals = s.totals.map((v, i) => v + scores[i]);
  s.phase = Math.max(...s.totals) >= s.options.target && s.totals[0] !== s.totals[1] ? 'matchOver' : 'handOver';
}

export function nextHand(s: PistiState, rng: Rng = createRng()) {
  if (s.phase !== 'handOver') throw new PistiError('Yeni el başlatılamaz.');
  dealHand(s, rng);
}

export function matchWinnerSide(s: PistiState): number {
  return s.totals[0] >= s.totals[1] ? 0 : 1;
}

/** Bot görünümü: kendi eli, yerdeki görünen kart(lar), herkese açık oynanmış kartlar. */
export interface PistiView {
  me: number;
  players: number;
  hand: Card[];
  top: Card | null;
  pileSize: number;
  played: Card[];
  deckCount: number;
  handSizes: number[];
}

export function viewPisti(s: PistiState, p: number): PistiView {
  return {
    me: p,
    players: s.options.players,
    hand: s.hands[p].map((c) => ({ ...c })),
    top: s.pile.length ? { ...s.pile[s.pile.length - 1] } : null,
    pileSize: s.pile.length,
    played: s.played.map((c) => ({ ...c })),
    deckCount: s.deck.length,
    handSizes: s.hands.map((h) => h.length),
  };
}
