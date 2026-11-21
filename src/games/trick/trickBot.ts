/**
 * El alma oyunları için ortak bot yardımcıları. Botlar yalnızca kendi elini, ortadaki eli ve
 * herkese açık oynanmış kartları bilir (gizli bilgi kullanılmaz).
 */
import { Card, Suit, Play, power, wouldWin, currentWinning } from './trick';

export const lowest = (cs: Card[]) => cs.reduce((a, b) => (power(b) < power(a) ? b : a));
export const highest = (cs: Card[]) => cs.reduce((a, b) => (power(b) > power(a) ? b : a));

/** Bu kart kendi renginde oyundaki en büyük kalan kart mı (oynanmışlar + kendi eli düşülür) */
export function isMaster(c: Card, hand: Card[], played: Card[]): boolean {
  const gone = new Set([...played, ...hand].filter((x) => x.suit === c.suit).map((x) => power(x)));
  for (let p = power(c) + 1; p <= 14; p++) if (!gone.has(p)) return false;
  return true;
}

/** Elde bu renkten kaç kart var */
export const count = (hand: Card[], s: Suit) => hand.filter((c) => c.suit === s).length;

/** Eli kazanan en küçük yasal kart (yoksa null) */
export function cheapestWinner(legal: Card[], trick: Play[], trump: Suit | null, me: number): Card | null {
  const w = legal.filter((c) => wouldWin(trick, c, trump, me));
  if (!w.length) return null;
  // kozla kazanmak yerine renkle kazanmayı tercih et
  const nonTrump = w.filter((c) => c.suit !== trump);
  return lowest(nonTrump.length ? nonTrump : w);
}

/** Eli kaybettiren en büyük yasal kart (yoksa null) — ceza oyunlarında "altından girmek" */
export function highestLoser(legal: Card[], trick: Play[], trump: Suit | null, me: number): Card | null {
  const l = legal.filter((c) => !wouldWin(trick, c, trump, me));
  return l.length ? highest(l) : null;
}

/** El gücü tahmini (koz rengiyle): batak ihalesi ve King koz seçimi için */
export function estimateTricks(hand: Card[], trump: Suit): number {
  let t = 0;
  for (let s = 0 as Suit; s < 4; s = (s + 1) as Suit) {
    const cs = hand.filter((c) => c.suit === s).sort((a, b) => power(b) - power(a));
    const n = cs.length;
    if (s === trump) {
      // kozda büyükler + uzunluk
      for (const c of cs) { const p = power(c); if (p === 14) t += 1; else if (p === 13) t += n >= 2 ? 0.9 : 0.4; else if (p === 12) t += n >= 3 ? 0.7 : 0.2; else if (p === 11) t += n >= 4 ? 0.5 : 0; }
      t += Math.max(0, n - 3) * 0.85;
    } else {
      for (const c of cs) { const p = power(c); if (p === 14) t += 0.95; else if (p === 13) t += n >= 2 ? 0.7 : 0.2; else if (p === 12) t += n >= 3 ? 0.3 : 0; }
      // kısa renk + koz: kesme şansı
      const trumps = count(hand, trump);
      if (n === 0 && trumps >= 2) t += 0.9;
      else if (n === 1 && trumps >= 3) t += 0.5;
    }
  }
  return t;
}

/** En iyi koz rengi ve tahmini el sayısı */
export function bestTrump(hand: Card[]): { suit: Suit; tricks: number } {
  let best: { suit: Suit; tricks: number } = { suit: 0, tricks: -1 };
  for (let s = 0 as Suit; s < 4; s = (s + 1) as Suit) {
    const t = estimateTricks(hand, s) + count(hand, s) * 0.05;
    if (t > best.tricks) best = { suit: s, tricks: t };
  }
  return best;
}

/** Elinde kazanma ihtimali yüksek kart (renginin en büyüğü) ile açış; yoksa uzun rengin küçüğü */
export function leadToWin(legal: Card[], hand: Card[], played: Card[], trump: Suit | null): Card {
  const masters = legal.filter((c) => c.suit !== trump && isMaster(c, hand, played));
  if (masters.length) return highest(masters);
  // en uzun koz-dışı renkten küçük kart
  const non = legal.filter((c) => c.suit !== trump);
  const pool = non.length ? non : legal;
  const bySuit = (s: Suit) => count(hand, s);
  return pool.reduce((a, b) => (bySuit(b.suit) > bySuit(a.suit) || (bySuit(b.suit) === bySuit(a.suit) && power(b) < power(a)) ? b : a));
}

/** Ortadaki eli şu an kimin aldığı (oyuncu no) */
export const winningPlayer = (trick: Play[], trump: Suit | null) => currentWinning(trick, trump)?.player ?? null;
