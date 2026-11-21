/**
 * King botu: oyun (sözleşme) seçimi, koz seçimi ve oynayış. Yalnızca KingView'deki bilgiyi kullanır.
 */
import type { Difficulty } from '../common/types';
import type { Rng } from '../common/rng';
import { Card, Suit, power } from '../trick/trick';
import { Contract, KingView, cardPenalty } from './king';
import { bestTrump, cheapestWinner, highestLoser, lowest, highest, leadToWin, count } from '../trick/trickBot';

/** Elin bir sözleşmedeki beklenen puanı (kaba tahmin) */
export function expectedScore(hand: Card[], c: Contract): number {
  const high = (min: number) => hand.filter((x) => power(x) >= min).length;
  const hearts = hand.filter((x) => x.suit === 1);
  switch (c) {
    case 'koz': return bestTrump(hand).tricks * 50 - 150;
    case 'el': return -(high(12) * 0.8 + high(10) * 0.3) * 50;
    case 'kupa': return -(hearts.filter((x) => power(x) >= 10).length * 1.6 + Math.max(0, hearts.length - 3) * 0.4) * 30 * 1.5;
    case 'erkek': return -(hand.filter((x) => x.rank === 13 || x.rank === 11).length * 0.55 + high(14) * 0.15) * 60;
    case 'kiz': return -hand.filter((x) => x.rank === 12).reduce((a, q) => a + (count(hand, q.suit) <= 2 ? 0.7 : 0.35), 0) * 100;
    case 'rifki': {
      const k = hearts.some((x) => x.rank === 13);
      const ace = hearts.some((x) => x.rank === 1);
      return -(k ? (hearts.length <= 3 ? 0.75 : 0.35) : ace && hearts.length <= 2 ? 0.25 : 0.12) * 320;
    }
    case 'sonIki': return -(high(13) * 0.25) * 180 * 0.6;
  }
}

export function decideContract(v: KingView, rng: Rng, diff: Difficulty = 'medium'): Contract {
  const opts = v.available;
  if (diff === 'easy') return opts[Math.floor(rng() * opts.length)];
  let best = opts[0], bs = -Infinity;
  for (const c of opts) {
    const sc = expectedScore(v.hand, c) + (diff === 'medium' ? (rng() - 0.5) * 40 : 0);
    if (sc > bs) { bs = sc; best = c; }
  }
  return best;
}

export function decideKingTrump(v: KingView): Suit { return bestTrump(v.hand).suit; }

export function chooseKingCard(v: KingView, rng: Rng, diff: Difficulty = 'medium'): number {
  const legal = v.legal;
  if (legal.length === 1) return legal[0].id;
  if (diff === 'easy' && rng() < 0.35) return legal[Math.floor(rng() * legal.length)].id;
  const ct = v.contract!;
  const memory = diff === 'hard' ? v.played : v.played.slice(-12);
  if (ct === 'koz') {
    if (!v.trick.length) return leadToWin(legal, v.hand, memory, v.trump).id;
    const win = cheapestWinner(legal, v.trick, v.trump, v.me);
    if (win && (v.trick.length === 3 || win.suit === v.trump || power(win) >= 13)) return win.id;
    return lowest(legal).id;
  }
  // ceza oyunları: cezalı kartı almamaya, almak zorundaysan cezasız almaya, rengin yoksa cezayı başkasına atmaya çalış
  const pen = (c: Card) => cardPenalty(c, ct);
  if (!v.trick.length) {
    // en küçük kartla, uzun renkten aç; ceza kartını açma
    const safe = legal.filter((c) => pen(c) === 0);
    const pool = safe.length ? safe : legal;
    return lowest(pool.filter((c) => count(v.hand, c.suit) === Math.max(...pool.map((x) => count(v.hand, x.suit))))).id;
  }
  const lead = v.trick[0].card.suit;
  const following = legal.some((c) => c.suit === lead);
  if (!following) {
    // rengin yok: cezalı kartı ya da en büyük kartı başkasına at
    const bad = legal.filter((c) => pen(c) > 0);
    if (bad.length) return highest(bad).id;
    return highest(legal).id;
  }
  const loser = highestLoser(legal, v.trick, null, v.me);
  if (loser) return loser.id;
  // almak zorundasın: sonuncuysan en büyükle al (büyük kartından kurtul), değilsen en küçükle
  const trickHasPenalty = v.trick.some((t) => pen(t.card) > 0);
  if (v.trick.length === 3 && !trickHasPenalty) return highest(legal.filter((c) => pen(c) === 0).length ? legal.filter((c) => pen(c) === 0) : legal).id;
  return lowest(legal).id;
}
