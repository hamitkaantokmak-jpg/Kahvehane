/**
 * Pişti botu: yalnızca kendi elini, yerdeki üst kartı ve herkese açık oynanmış kartları bilir.
 */
import { Card, JACK, PistiView, cardPoints } from './pisti';

export function choosePistiCard(v: PistiView, rng: () => number = Math.random): number {
  const seen = new Map<number, number>();
  for (const c of [...v.played, ...v.hand]) seen.set(c.rank, (seen.get(c.rank) ?? 0) + 1);
  const unseen = (rank: number) => 4 - (seen.get(rank) ?? 0);
  const unknownCards = Math.max(1, 52 - v.played.length - v.hand.length);
  const pileValueGuess = (v.top ? cardPoints(v.top) : 0) + Math.max(0, v.pileSize - 1) * 0.25;

  let best: Card = v.hand[0];
  let bestScore = -Infinity;
  for (const c of v.hand) {
    let score = 0;
    const captures = v.top && (c.rank === v.top.rank || c.rank === JACK);
    if (captures && v.top) {
      const pisti = v.pileSize === 1 && c.rank === v.top.rank ? (c.rank === JACK ? 20 : 10) : 0;
      score = 5 + pileValueGuess + cardPoints(c) + pisti + v.pileSize * 0.35;
      // valeyi küçük yığın için harcama
      if (c.rank === JACK && c.rank !== v.top.rank && v.pileSize <= 2 && pileValueGuess < 1) score -= 6;
    } else {
      // rakibin alma ihtimali: aynı değerden görünmeyen kart sayısı + valeler
      const match = unseen(c.rank) / unknownCards;
      const jacks = unseen(JACK) / unknownCards;
      const handSize = Math.max(1, v.handSizes[(v.me + 1) % v.players]);
      const pTake = Math.min(1, (match + (v.pileSize > 0 ? jacks : 0)) * handSize);
      const give = cardPoints(c) + pileValueGuess + v.pileSize * 0.3 + (v.pileSize === 0 ? 10 * Math.min(1, match * handSize) : 0);
      score = -pTake * give - cardPoints(c) * 0.6;
      if (c.rank === JACK) score -= 4; // valeyi elde tut
    }
    score += rng() * 0.2;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best.id;
}
