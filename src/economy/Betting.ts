/**
 * Bahisli masa hesabı — saf mantık. Kural motorlarına dokunmaz: her oyunun mevcut sonuç
 * yapısından (skorlar/toplamlar/tavla sonucu) basit bir "kim öder, kim alır" sonucu çıkarır.
 *
 * Bahis birimi "çay"dır: 1 çay = çayın taban fiyatı (zamdan etkilenmez).
 *  - Okey: puanı en düşük olan(lar) öder → en yüksek puanlı(lar) alır.
 *  - 101: seri maçta en yüksek toplamı alan(lar) öder → en düşük toplamlı(lar) alır.
 *  - Tavla: her oyunda kaybeden öder: normal 1×, mars 2×, katmerli mars 3×.
 *  - Pişti: kaybeden takım(ın her üyesi) öder → kazanan takım(ın üyeleri) alır.
 *  - Batak: toplamı en düşük olan öder → en yüksek olan alır (eşlide takımca).
 *  - King: toplamı en düşük olan öder → en yüksek olan alır.
 */
import { BASE_PRICES, EconomyState, PLAYER, credit, playerPay, balanceOf } from './Economy';

export const STAKES = [0, 3, 5, 10] as const; // çay cinsinden
export type Stake = (typeof STAKES)[number] | number;

export const stakeCoins = (stakeTeas: number) => stakeTeas * BASE_PRICES.tea;

export interface Outcome {
  /** oyun içi oyuncu indeksleri */
  payers: number[];
  winners: number[];
  /** bahsin çarpanı (tavla marsı vb.) */
  multiplier: number;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

function minIdx(v: number[]) { const m = Math.min(...v); return v.map((x, i) => (x === m ? i : -1)).filter((i) => i >= 0); }
function maxIdx(v: number[]) { const m = Math.max(...v); return v.map((x, i) => (x === m ? i : -1)).filter((i) => i >= 0); }

/** Okey: kaybeden puanı en düşük olan (20'den düşmeli sistem) */
export function okeyOutcome(scores: number[]): Outcome | null {
  const payers = minIdx(scores), winners = maxIdx(scores);
  if (payers.length === scores.length) return null; // herkes eşit
  return { payers, winners, multiplier: 1 };
}

/** 101: toplamı en yüksek olan öder, en düşük olan alır */
export function okey101Outcome(totals: number[]): Outcome | null {
  const payers = maxIdx(totals), winners = minIdx(totals);
  if (payers.length === totals.length) return null;
  return { payers, winners, multiplier: 1 };
}

/** Tavla: tek oyunun sonucu (oyuncu 0 / 1) */
export function tavlaOutcome(winner: 0 | 1, kind: 'normal' | 'mars' | 'katmerli'): Outcome {
  return { payers: [1 - winner], winners: [winner], multiplier: kind === 'normal' ? 1 : kind === 'mars' ? 2 : 3 };
}

/** Pişti: taraf toplamları; 4 kişide taraf = oyuncu % 2 */
export function pistiOutcome(sideTotals: number[], players: 2 | 4): Outcome | null {
  if (sideTotals[0] === sideTotals[1]) return null;
  const lose = sideTotals[0] < sideTotals[1] ? 0 : 1;
  const side = (p: number) => (players === 4 ? p % 2 : p);
  const all = Array.from({ length: players }, (_, i) => i);
  return { payers: all.filter((p) => side(p) === lose), winners: all.filter((p) => side(p) !== lose), multiplier: 1 };
}

/** Batak: toplamı en düşük öder, en yüksek alır; eşlide ortaklar birlikte (toplamları zaten eşit) */
export function batakOutcome(totals: number[]): Outcome | null {
  const payers = minIdx(totals), winners = maxIdx(totals);
  if (payers.length === totals.length) return null;
  return { payers, winners, multiplier: 1 };
}

/** King: toplamı en düşük öder, en yüksek alır */
export function kingOutcome(totals: number[]): Outcome | null {
  const payers = minIdx(totals), winners = maxIdx(totals);
  if (payers.length === totals.length) return null;
  return { payers, winners, multiplier: 1 };
}

/**
 * Sonucu para transferlerine çevirir: her ödeyen `stake × çarpan` öder; toplam kazananlara eşit bölünür
 * (bölünemeyen artık ilk kazanana). `ids`: oyun indeksi → kimlik ('player' ya da NPC id).
 */
export function settle(outcome: Outcome | null, stakeTeas: number, ids: string[]): Transfer[] {
  if (!outcome || stakeTeas <= 0 || !outcome.winners.length) return [];
  const each = stakeCoins(stakeTeas) * outcome.multiplier;
  const out: Transfer[] = [];
  for (const p of outcome.payers) {
    const share = Math.floor(each / outcome.winners.length);
    let rem = each - share * outcome.winners.length;
    for (const w of outcome.winners) {
      const amt = share + (rem > 0 ? rem : 0);
      rem = 0;
      if (amt > 0) out.push({ from: ids[p], to: ids[w], amount: amt });
    }
  }
  return out;
}

export interface AppliedTransfer extends Transfer {
  /** Ödeyen oyuncuysa ve parası yetmediyse veresiyeye yazılan kısım */
  onCredit: number;
}

/**
 * Transferleri uygular. NPC'ler ellerindeki kadarını öder (negatife düşmez);
 * oyuncu parası yetmezse kalanı alacaklıya veresiye yazılır (bahis borcu sınırı zorlamaz — maç oynandı, borç borçtur).
 */
export function applyTransfers(s: EconomyState, transfers: Transfer[]): AppliedTransfer[] {
  const res: AppliedTransfer[] = [];
  for (const t of transfers) {
    if (t.from === PLAYER) {
      const before = balanceOf(s, PLAYER);
      const r = playerPay(s, t.to, t.amount, true);
      if (!r.ok) {
        // sınır aşılıyor: yine de borç yazılır (bahis borcu)
        const cash = Math.min(before, t.amount);
        s.balances[PLAYER] = before - cash;
        credit(s, t.to, cash);
        s.debts[t.to] = (s.debts[t.to] ?? 0) + (t.amount - cash);
        res.push({ ...t, onCredit: t.amount - cash });
      } else res.push({ ...t, onCredit: r.onCredit });
      s.stats.lost += t.amount;
    } else {
      const have = balanceOf(s, t.from);
      const amt = Math.min(have, t.amount);
      s.balances[t.from] = have - amt;
      credit(s, t.to, amt);
      if (t.to === PLAYER) s.stats.won += amt;
      res.push({ ...t, amount: amt, onCredit: 0 });
    }
  }
  return res;
}

/** Cesur NPC bahsi artırmak ister mi? (kişilik `betBoldness` 0..1) */
export function wantsRaise(boldness: number, stakeTeas: number, roll: number): boolean {
  if (stakeTeas <= 0 || stakeTeas >= 10) return false;
  return roll < boldness * 0.9;
}
