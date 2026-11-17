/**
 * Klasik Okey botu. Yalnızca OkeyView (kendi eli + açık taşlar) ile karar verir.
 */
import { Tile, OkeyCtx, toCounts, bestPartition, isJoker, identity, Counts } from '../common/tiles';
import { OKEY_RULES, OkeyView, evaluateFinish } from './okey';

export type OkeyBotAction =
  | { type: 'drawDeck' }
  | { type: 'drawDiscard' }
  | { type: 'discard'; tileId: number }
  | { type: 'finish'; tileId: number };

/** Elin "iyiliği": perlere giren taş sayısı + yarım perlerin potansiyeli; çift yolu da değerlendirilir. */
export function evaluateHand(tiles: Tile[], ctx: OkeyCtx): number {
  const { counts, jokers } = toCounts(tiles, ctx);
  const part = bestPartition(counts, jokers, OKEY_RULES, (m) => m.concrete.length + m.jokers);
  // perlere girmeyen taşlardaki bağlantılar
  const left = Int8Array.from(counts) as Counts;
  let jl = jokers;
  for (const m of part.melds) {
    for (const [c, n] of m.concrete) left[c * 14 + n]--;
    jl -= m.jokers;
  }
  let potential = 0;
  for (let c = 0; c < 4; c++)
    for (let n = 1; n <= 13; n++) {
      const k = left[c * 14 + n];
      if (!k) continue;
      const nx = n === 13 ? 1 : n + 1;
      if (left[c * 14 + nx]) potential += 3;
      if (n <= 11 && left[c * 14 + n + 2]) potential += 1.5;
      for (let c2 = c + 1; c2 < 4; c2++) if (left[c2 * 14 + n]) potential += 2.5;
    }
  const meldScore = part.score * 10 + potential + jl * 6;
  // çift yolu
  let pairs = 0;
  let singles = 0;
  for (let i = 0; i < 56; i++) {
    pairs += Math.floor(counts[i] / 2);
    singles += counts[i] % 2;
  }
  const pairScore = pairs >= 4 ? (pairs * 2 + Math.min(jokers, singles)) * 10 + (pairs - 4) * 4 : 0;
  return Math.max(meldScore, pairScore);
}

function bestDiscard(hand: Tile[], ctx: OkeyCtx, rng: () => number): { tile: Tile; score: number } {
  let best: { tile: Tile; score: number } | null = null;
  const seen = new Set<string>();
  for (const t of hand) {
    if (isJoker(t, ctx)) continue;
    const id = identity(t, ctx);
    const key = `${id.color}-${id.num}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const rest = hand.filter((x) => x !== t);
    // küçük rastgelelik + yüksek sayıları atmayı hafif tercih
    const score = evaluateHand(rest, ctx) + rng() * 0.5 + id.num * 0.01;
    if (!best || score > best.score) best = { tile: t, score };
  }
  if (!best) best = { tile: hand[0], score: -1 };
  return best;
}

export function decideOkey(view: OkeyView, rng: () => number = Math.random): OkeyBotAction {
  const { hand, ctx } = view;
  if (view.phase === 'draw') {
    const top = view.discardTops[(view.me + 3) % 4];
    if (top) {
      const withTop = [...hand, top];
      for (const t of withTop) {
        if (t.id === top.id) continue;
        if (evaluateFinish(withTop.filter((x) => x !== t), ctx)) return { type: 'drawDiscard' };
      }
      if (isJoker(top, ctx)) return { type: 'drawDiscard' };
      const now = evaluateHand(hand, ctx);
      // alınan taşı tutup başka bir taş atınca el ne kadar iyileşiyor?
      let bestWith = -Infinity;
      for (const t of hand) {
        if (isJoker(t, ctx)) continue;
        const sc = evaluateHand(withTop.filter((x) => x !== t), ctx);
        if (sc > bestWith) bestWith = sc;
      }
      if (bestWith >= now + 9) return { type: 'drawDiscard' };
    }
    return { type: 'drawDeck' };
  }
  // atış: önce bitiş kontrolü (okey atarak bitmek daha değerli)
  const finishes = hand.filter((t) => evaluateFinish(hand.filter((x) => x !== t), ctx));
  if (finishes.length) {
    const okeyFinish = finishes.find((t) => isJoker(t, ctx));
    return { type: 'finish', tileId: (okeyFinish ?? finishes[0]).id };
  }
  return { type: 'discard', tileId: bestDiscard(hand, ctx, rng).tile.id };
}
