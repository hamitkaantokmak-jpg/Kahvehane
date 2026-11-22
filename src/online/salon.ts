/**
 * Ortak kahvehane (çevrimiçi 2. aşama) — saf kurallar. Odadaki herkes aynı kahvehanede dolaşır:
 * konum paylaşımı, el kol hareketleri, birbirine çay atma, zincirleme (sevimli) kavga, ortak gerginlik çubuğu,
 * gerginlik dolunca herkesin aynı anda yaşadığı olay ve "maç gecesi" (herkes TV'de aynı at yarışını izler).
 *
 * Hepsi yalnızca görsel/sosyaldir: oyun sonucunu, parayı ya da kimsenin kaydını etkilemez.
 * Zaman (`now`, ms) dışarıdan gelir; durum JSON'a çevrilebilir.
 */

/** Kahvehanenin yürünebilir sınırları (dünya koordinatı, metre) — kötü niyetli konumları kırpmak için */
export const SALON_BOUNDS = { minX: -9, maxX: 9, minZ: -7, maxZ: 6 };

export interface Presence {
  x: number;
  z: number;
  yaw: number;
  /** yürüyor mu */
  m: boolean;
  /** masadan kalkıp salonda dolaşıyor mu (false: odanın masasında oturuyor) */
  roam: boolean;
}

export const SALON_EMOTES = ['wave', 'laugh', 'clap', 'bellyDance', 'slamTable', 'laf', 'drink', 'wipe'] as const;
export type SalonEmote = (typeof SALON_EMOTES)[number];

/** Gerginlik puanları ve davranışı */
export const TENSION = {
  max: 100,
  decayPerSec: 0.5,
  /** olaydan sonra çubuk buraya iner */
  resetTo: 30,
  pts: { taunt: 3, objection: 5, slam: 6, tea: 10, flip: 25, emote: 1, laf: 3, salonTea: 8, brawl: 12 } as Record<string, number>,
};

/** Gerginlik dolunca herkesin ekranında aynı anda olan olaylar (yerel olay motorunda karşılıkları var) */
export const SHARED_EVENTS = ['tvGoal', 'powerCut', 'cat'] as const;
export type SharedEvent = (typeof SHARED_EVENTS)[number];

export const SALON_TIMING = {
  /** konum mesajları arası en az süre (ms) */
  posGap: 120,
  emoteGap: 1200,
  salonTeaGap: 4000,
  /** çaya karşılık bu süre içinde gelirse kavga başlar */
  retaliate: 20000,
  brawlDuration: 9000,
  /** maç gecesi: yarış bu kadar sonra başlar (bahis süresi) */
  raceLead: 20000,
  raceGap: 90000,
};

export interface SalonState {
  tension: number;
  tensionAt: number;
  /** a → b çay attı (karşılık için) */
  lastTea: { from: string; to: string; at: number }[];
  brawl: { ids: string[]; until: number } | null;
  race: { seed: number; startAt: number } | null;
  raceAt: number;
}

export const newSalon = (): SalonState => ({ tension: 0, tensionAt: 0, lastTea: [], brawl: null, race: null, raceAt: -1e12 });

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Konum mesajını doğrula ve sınırla; geçersizse null */
export function cleanPresence(m: Partial<Presence>): Presence | null {
  const { x, z, yaw } = m;
  if (![x, z, yaw].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  const B = SALON_BOUNDS;
  return { x: clamp(x!, B.minX, B.maxX), z: clamp(z!, B.minZ, B.maxZ), yaw: Math.atan2(Math.sin(yaw!), Math.cos(yaw!)), m: !!m.m, roam: !!m.roam };
}

/** Şu anki (sönümlenmiş) gerginlik */
export function tensionNow(s: SalonState, now: number): number {
  return Math.max(0, s.tension - (Math.max(0, now - s.tensionAt) / 1000) * TENSION.decayPerSec);
}

/**
 * Gerginlik ekle. Doluysa ortak olay seçilir ve çubuk düşer.
 * @returns yeni değer ve (varsa) tetiklenen olay
 */
export function addTension(s: SalonState, kind: string, now: number, rng: () => number): { value: number; event: SharedEvent | null } {
  const v = tensionNow(s, now) + (TENSION.pts[kind] ?? 0);
  s.tensionAt = now;
  if (v >= TENSION.max) {
    s.tension = TENSION.resetTo;
    return { value: s.tension, event: SHARED_EVENTS[Math.floor(rng() * SHARED_EVENTS.length)] };
  }
  s.tension = v;
  return { value: v, event: null };
}

/**
 * Salonda çay atıldı. Karşılık (kurban, atana süre içinde geri attı) ya da süren kavgaya katılma kavgayı büyütür.
 * @returns kavga başladı/büyüdüyse kavgadaki oyuncular, yoksa null
 */
export function onSalonTea(s: SalonState, from: string, to: string, now: number): string[] | null {
  s.lastTea = s.lastTea.filter((t) => now - t.at < SALON_TIMING.retaliate);
  if (s.brawl && now > s.brawl.until) s.brawl = null;
  // süren kavgaya dahil biri hedef ya da atan → zincir: katılan eklenir, süre uzar
  if (s.brawl && (s.brawl.ids.includes(to) || s.brawl.ids.includes(from))) {
    for (const id of [from, to]) if (!s.brawl.ids.includes(id)) s.brawl.ids.push(id);
    s.brawl.until = now + SALON_TIMING.brawlDuration;
    s.lastTea.push({ from, to, at: now });
    return [...s.brawl.ids];
  }
  const retaliation = s.lastTea.some((t) => t.from === to && t.to === from);
  s.lastTea.push({ from, to, at: now });
  if (!retaliation) return null;
  s.brawl = { ids: [to, from], until: now + SALON_TIMING.brawlDuration };
  return [...s.brawl.ids];
}

/** Maç gecesi: yarış iste. Çok sık istenirse null. */
export function requestRace(s: SalonState, now: number, rng: () => number): { seed: number; startAt: number } | null {
  if (s.race && now < s.race.startAt + 40000) return null;
  if (now - s.raceAt < SALON_TIMING.raceGap) return null;
  s.raceAt = now;
  s.race = { seed: Math.floor(rng() * 2 ** 31), startAt: now + SALON_TIMING.raceLead };
  return s.race;
}
