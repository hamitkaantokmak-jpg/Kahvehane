/**
 * Çay fırlatma ve "çaylı yüz" — saf mantık (three.js/DOM yok; zaman dt ile verilir).
 * Bu etki YALNIZCA görsel ve sosyaldir: hiçbir oyun kuralına, taşa, karta ya da bota etkisi yoktur.
 *
 * Ücret: kırık bardak + (elde çay yoksa) çay bedeli + aynı hedefe art arda atış zammı.
 *   Aynı hedefe 60 sn içinde yapılan her yeni atış +5🪙 daha pahalıdır (en fazla +20).
 * Bekleme: atışlar arasında 4 sn.
 * Leke: isabette 22 sn; tekrar isabette süre uzar ama en fazla 30 sn olur; son 6 sn'de solar; silinebilir.
 */
export const THROW_COOLDOWN = 4;
export const REPEAT_WINDOW = 60;
export const REPEAT_STEP = 5;
export const REPEAT_MAX = 20;
export const STAIN_DURATION = 22;
export const STAIN_MAX = 30;
export const STAIN_FADE = 6;

export interface ThrowState {
  cooldown: number;
  /** hedef → [son atıştan beri geçen süre, art arda sayısı] */
  recent: Record<string, { since: number; count: number }>;
}

export const newThrowState = (): ThrowState => ({ cooldown: 0, recent: {} });

export interface Prices { tea: number; brokenGlass: number }

/** Bu hedefe atışın ücreti */
export function throwCost(s: ThrowState, target: string, prices: Prices, holdingTea: boolean): number {
  const r = s.recent[target];
  const repeat = r && r.since < REPEAT_WINDOW ? Math.min(REPEAT_MAX, r.count * REPEAT_STEP) : 0;
  return prices.brokenGlass + (holdingTea ? 0 : prices.tea) + repeat;
}

export const canThrow = (s: ThrowState) => s.cooldown <= 0;

/** Atışı kaydet (ödeme başarılı olduktan sonra çağrılır) */
export function recordThrow(s: ThrowState, target: string) {
  s.cooldown = THROW_COOLDOWN;
  const r = s.recent[target];
  if (r && r.since < REPEAT_WINDOW) { r.count++; r.since = 0; }
  else s.recent[target] = { since: 0, count: 1 };
}

export function updateThrows(s: ThrowState, dt: number) {
  s.cooldown = Math.max(0, s.cooldown - dt);
  for (const [k, r] of Object.entries(s.recent)) {
    r.since += dt;
    if (r.since > REPEAT_WINDOW) delete s.recent[k];
  }
}

export interface StainState {
  remaining: number;
}

export const newStain = (): StainState => ({ remaining: 0 });

/** İsabet: lekeyi başlat ya da yenile (üst sınırlı) */
export function splash(st: StainState) {
  st.remaining = Math.min(STAIN_MAX, st.remaining > 0 ? st.remaining + STAIN_DURATION : STAIN_DURATION);
}

export function updateStain(st: StainState, dt: number) {
  st.remaining = Math.max(0, st.remaining - dt);
}

/** Görünürlük yoğunluğu 0..1 (son saniyelerde solar) */
export function stainIntensity(st: StainState): number {
  if (st.remaining <= 0) return 0;
  return st.remaining >= STAIN_FADE ? 1 : st.remaining / STAIN_FADE;
}

export function wipe(st: StainState) { st.remaining = 0; }

export const isStained = (st: StainState) => st.remaining > 0;
