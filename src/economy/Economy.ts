/**
 * Kahvehane ekonomisi — saf mantık (three.js/DOM yok; Math.random/Date.now yok).
 * Para tamamen OYUN İÇİ sanal "kahve parası"dır (🪙); gerçek para, ödeme ya da dışarı çıkarılabilir
 * bir değerle hiçbir bağlantısı yoktur.
 *
 * - Cüzdan: oyuncu + NPC bakiyeleri (negatife düşmez).
 * - Veresiye defteri: oyuncunun kime ne kadar borcu olduğu ('sukru' = kahvehane hesabı). Toplam borç sınırlıdır.
 * - Fiyatlar: çay/simit/tost; Şükrü ara sıra geçici "zam" yapar (enjekte edilen rng ile).
 * - Günlük giriş bonusu (gün numarası dışarıdan verilir), iflas koruması (bulaşık yıkama işi).
 */
import type { Rng } from '../games/common/rng';

export const PLAYER = 'player';
export const HOUSE = 'sukru';

export type Item = 'tea' | 'simit' | 'tost' | 'brokenGlass';
export const BASE_PRICES: Record<Item, number> = { tea: 5, simit: 8, tost: 15, brokenGlass: 10 };
export const ITEM_TR: Record<Item, string> = { tea: 'çay', simit: 'simit', tost: 'tost', brokenGlass: 'kırık bardak' };

export const START_BALANCE = 100;
export const NPC_START = 150;
export const DEBT_LIMIT = 40;
export const DAILY_BONUS = 25;
export const WORK_PAY = 12;
export const WORK_COOLDOWN = 60;

export interface PricingState {
  /** Zam çarpanı (1 = normal) */
  multiplier: number;
  /** Zammın bitmesine kalan süre (sn) */
  remaining: number;
}

export interface EconomyState {
  balances: Record<string, number>;
  /** Oyuncunun borçları: alacaklı → tutar */
  debts: Record<string, number>;
  pricing: PricingState;
  /** Son günlük bonusun alındığı gün numarası (yerel gün sayısı) */
  lastDaily: number | null;
  /** Bulaşık işi bekleme süresi (sn) */
  workCooldown: number;
  /** İstatistik */
  stats: { spent: number; won: number; lost: number; work: number };
}

export class EconomyError extends Error {}

export function newEconomy(npcIds: string[] = []): EconomyState {
  const balances: Record<string, number> = { [PLAYER]: START_BALANCE };
  for (const id of npcIds) balances[id] = NPC_START;
  return { balances, debts: {}, pricing: { multiplier: 1, remaining: 0 }, lastDaily: null, workCooldown: 0, stats: { spent: 0, won: 0, lost: 0, work: 0 } };
}

/** Eski/eksik kaydı tamamla (geriye dönük uyumluluk) */
export function normalize(s: Partial<EconomyState> | null | undefined, npcIds: string[] = []): EconomyState {
  const base = newEconomy(npcIds);
  if (!s) return base;
  const out: EconomyState = {
    ...base,
    ...s,
    balances: { ...base.balances, ...(s.balances ?? {}) },
    debts: { ...(s.debts ?? {}) },
    pricing: { ...base.pricing, ...(s.pricing ?? {}) },
    stats: { ...base.stats, ...(s.stats ?? {}) },
  };
  return out;
}

export const balanceOf = (s: EconomyState, id: string) => s.balances[id] ?? 0;
export const totalDebt = (s: EconomyState) => Object.values(s.debts).reduce((a, b) => a + b, 0);

export function credit(s: EconomyState, id: string, amount: number) {
  if (amount < 0) throw new EconomyError('Negatif tutar');
  s.balances[id] = balanceOf(s, id) + amount;
}

/** Bakiyeden düş; yetmiyorsa düşmez ve false döner. */
export function debit(s: EconomyState, id: string, amount: number): boolean {
  if (amount < 0) throw new EconomyError('Negatif tutar');
  if (balanceOf(s, id) < amount) return false;
  s.balances[id] = balanceOf(s, id) - amount;
  return true;
}

/** Güncel fiyat (zam dahil, yukarı yuvarlanır) */
export function price(s: EconomyState, item: Item): number {
  return Math.ceil(BASE_PRICES[item] * s.pricing.multiplier);
}

export type PayResult = { ok: true; paid: number; onCredit: number } | { ok: false; reason: 'debtLimit' };

/**
 * Oyuncu `to` kişisine `amount` öder. Para yetmezse kalanı veresiyeye yazılır;
 * veresiye sınırı aşılacaksa ödeme yapılmaz (allowCredit=false ise hiç borç yazılmaz).
 */
export function playerPay(s: EconomyState, to: string, amount: number, allowCredit = true): PayResult {
  const have = balanceOf(s, PLAYER);
  const cash = Math.min(have, amount);
  const rest = amount - cash;
  if (rest > 0 && (!allowCredit || totalDebt(s) + rest > DEBT_LIMIT)) return { ok: false, reason: 'debtLimit' };
  s.balances[PLAYER] = have - cash;
  if (to !== HOUSE) credit(s, to, cash);
  if (rest > 0) s.debts[to] = (s.debts[to] ?? 0) + rest;
  s.stats.spent += amount;
  return { ok: true, paid: cash, onCredit: rest };
}

/** Bir ürün satın al (çay vb.): kahvehaneye öder */
export function buy(s: EconomyState, item: Item, allowCredit = true): PayResult & { price?: number } {
  const p = price(s, item);
  const r = playerPay(s, HOUSE, p, allowCredit);
  return r.ok ? { ...r, price: p } : r;
}

/** Borç öde: önce kahvehane, sonra diğer alacaklılar. Ödenen tutarı döndürür. */
export function payDebt(s: EconomyState, maxAmount = Infinity): number {
  let paid = 0;
  const order = Object.keys(s.debts).sort((a, b) => (a === HOUSE ? -1 : b === HOUSE ? 1 : 0));
  for (const who of order) {
    const can = Math.min(s.debts[who], balanceOf(s, PLAYER), maxAmount - paid);
    if (can <= 0) continue;
    s.balances[PLAYER] -= can;
    if (who !== HOUSE) credit(s, who, can);
    s.debts[who] -= can;
    if (s.debts[who] <= 0) delete s.debts[who];
    paid += can;
  }
  return paid;
}

export const overDebtLimit = (s: EconomyState) => totalDebt(s) >= DEBT_LIMIT;

/** Şükrü'nün zammı: her çağrıda düşük olasılıkla %10-%40 geçici zam. Zaman akışı update ile. */
export function maybeRaise(s: EconomyState, rng: Rng, chance = 0.25): boolean {
  if (s.pricing.remaining > 0 || rng() >= chance) return false;
  s.pricing.multiplier = 1 + (1 + Math.floor(rng() * 4)) / 10;
  s.pricing.remaining = 90 + Math.floor(rng() * 90);
  return true;
}

export function updateEconomy(s: EconomyState, dt: number) {
  if (s.pricing.remaining > 0) {
    s.pricing.remaining = Math.max(0, s.pricing.remaining - dt);
    if (s.pricing.remaining === 0) s.pricing.multiplier = 1;
  }
  s.workCooldown = Math.max(0, s.workCooldown - dt);
}

/** Günlük bonus: aynı gün ikinci kez verilmez. `day` = dışarıdan verilen gün numarası. */
export function claimDaily(s: EconomyState, day: number): number {
  if (s.lastDaily === day) return 0;
  s.lastDaily = day;
  credit(s, PLAYER, DAILY_BONUS);
  return DAILY_BONUS;
}

/** İflas: çay parası yok VE veresiye de dolmuş. Oyuncu oyundan atılmaz; Şükrü iş teklif eder. */
export function isBroke(s: EconomyState): boolean {
  return balanceOf(s, PLAYER) < price(s, 'tea') && totalDebt(s) + price(s, 'tea') > DEBT_LIMIT;
}

/** Bulaşık yıkama: kazanç önce borca sayılır, kalanı cüzdana. Bekleme süresi var. */
export function workShift(s: EconomyState): { earned: number; toDebt: number } | null {
  if (s.workCooldown > 0) return null;
  s.workCooldown = WORK_COOLDOWN;
  s.stats.work++;
  let pay = WORK_PAY;
  let toDebt = 0;
  if (s.debts[HOUSE]) {
    toDebt = Math.min(s.debts[HOUSE], pay);
    s.debts[HOUSE] -= toDebt;
    if (s.debts[HOUSE] <= 0) delete s.debts[HOUSE];
    pay -= toDebt;
  }
  credit(s, PLAYER, pay);
  return { earned: WORK_PAY, toDebt };
}

/** Gün numarası (yerel saatle) — oyun katmanı Date'i buradan geçirir. */
export function dayNumber(epochMs: number, tzOffsetMin = 0): number {
  return Math.floor((epochMs - tzOffsetMin * 60_000) / 86_400_000);
}
