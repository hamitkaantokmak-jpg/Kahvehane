/**
 * El alma (trick) oyunlarının ortak çekirdeği — Batak ve King kullanır. Saf mantık, JSON'a çevrilebilir veri.
 * Kartlar pişti modülündeki 52'lik desteyle aynıdır (Card, Suit); As en büyüktür.
 */
import { Card, Suit, createDeck, SUIT_SYMBOL, RANK_LABEL } from '../pisti/pisti';
import { Rng, shuffle } from '../common/rng';

export type { Card, Suit };
export { SUIT_SYMBOL, RANK_LABEL };

/** El içi güç: As 14, Papaz 13, Kız 12, Vale 11, 10..2 */
export const power = (c: Card) => (c.rank === 1 ? 14 : c.rank);

export interface Play { player: number; card: Card }

/** 52 kartı karıştırıp 4 oyuncuya 13'er dağıtır */
export function deal4(rng: Rng): Card[][] {
  const d = shuffle(createDeck(), rng);
  return [0, 1, 2, 3].map((p) => sortHand(d.slice(p * 13, p * 13 + 13)));
}

/** El sıralaması: renk sırası ♠ ♥ ♣ ♦ (renkler karışmasın diye siyah-kırmızı dönüşümlü), içinde büyükten küçüğe */
const SUIT_ORDER = [0, 1, 3, 2];
export function sortHand(h: Card[]): Card[] {
  return [...h].sort((a, b) => SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit) || power(b) - power(a));
}

/** Ortadaki eli kim alıyor: koz varsa en büyük koz, yoksa açılan rengin en büyüğü */
export function trickWinner(trick: Play[], trump: Suit | null): number {
  const lead = trick[0].card.suit;
  let best = trick[0];
  for (const t of trick.slice(1)) {
    const c = t.card, b = best.card;
    const cT = trump !== null && c.suit === trump, bT = trump !== null && b.suit === trump;
    if (cT && !bT) best = t;
    else if (cT === bT && c.suit === b.suit && power(c) > power(b)) best = t;
    else if (!cT && !bT && c.suit === lead && b.suit !== lead) best = t;
  }
  return best.player;
}

/** Şu an eli kazanan kart (henüz tamamlanmamış el için) */
export function currentWinning(trick: Play[], trump: Suit | null): Play | null {
  if (!trick.length) return null;
  const w = trickWinner(trick, trump);
  return trick.find((t) => t.player === w)!;
}

/** `c` kartı ortadaki eli şu an alır mı */
export function wouldWin(trick: Play[], c: Card, trump: Suit | null, player: number): boolean {
  if (!trick.length) return true;
  return trickWinner([...trick, { player, card: c }], trump) === player;
}

export const cardText = (c: Card) => `${SUIT_SYMBOL[c.suit]}${RANK_LABEL[c.rank]}`;
export const next = (p: number) => (p + 1) % 4;
