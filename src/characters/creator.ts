/**
 * Karakter oluşturucu — saf mantık (three.js / DOM yok, JSON'a çevrilebilir).
 *
 * Oyuncunun görünüşünü tanımlayan CharacterSpec'i güvenli biçimde üretir, doğrular ve saklar.
 * Seçenek listeleri arayüzün de kullandığı tek kaynaktır. Dışarıdan gelen (localStorage, ileride sunucu)
 * her veri `sanitizeSpec` ile beyaz listeye ve sınırlara çekilir; bozuk kayıt oyunu bozamaz.
 */
import type { Accessory, CharacterSpec, HairStyle, HeadShape, MustacheStyle, NoseShape } from './CharacterSpec';
import { PLAYER_SPEC, SKIN } from './CharacterSpec';
import { ARCHETYPES, ArchetypeId, mergeLook } from '../npc/archetypes';
import type { Rng } from '../games/common/rng';

export interface Choice<T> { value: T; label: string }

export const HEAD_SHAPES: Choice<HeadShape>[] = [
  { value: 'round', label: 'Yuvarlak' }, { value: 'egg', label: 'Yumurta' }, { value: 'wide', label: 'Geniş' }, { value: 'long', label: 'Uzun' },
];
export const NOSE_SHAPES: Choice<NoseShape>[] = [
  { value: 'potato', label: 'Patates' }, { value: 'long', label: 'Uzun' }, { value: 'hook', label: 'Kartal' }, { value: 'button', label: 'Kiraz' },
];
export const MUSTACHES: Choice<MustacheStyle>[] = [
  { value: 'none', label: 'Yok' }, { value: 'chevron', label: 'Klasik' }, { value: 'walrus', label: 'Pala' },
  { value: 'handlebar', label: 'Burma' }, { value: 'pencil', label: 'İnce' },
];
export const HAIRS: Choice<HairStyle>[] = [
  { value: 'side', label: 'Yana taralı' }, { value: 'curly', label: 'Kıvırcık' }, { value: 'slick', label: 'Briyantinli' },
  { value: 'tuft', label: 'Perçem' }, { value: 'combover', label: 'Yandan kapatma' }, { value: 'bald', label: 'Kel' },
];
/** Şapka yuvası: aynı anda tek şapka */
export const HATS: Choice<Accessory | 'none'>[] = [
  { value: 'none', label: 'Yok' }, { value: 'flatcap', label: 'Kasket' }, { value: 'fez', label: 'Fes' }, { value: 'cap', label: 'Bere' },
];
/** Boyun yuvası: tek parça */
export const NECKS: Choice<Accessory | 'none'>[] = [
  { value: 'none', label: 'Yok' }, { value: 'scarf', label: 'Atkı' }, { value: 'bowtie', label: 'Papyon' }, { value: 'tie', label: 'Kravat' },
];
/** Serbestçe açılıp kapanan parçalar */
export const EXTRAS: Choice<Accessory>[] = [
  { value: 'glasses', label: 'Gözlük' }, { value: 'vest', label: 'Yelek' }, { value: 'tracksuit', label: 'Eşofman' },
  { value: 'beads', label: 'Tespih' }, { value: 'pencil', label: 'Kulakta kalem' }, { value: 'pocket', label: 'Cep defteri' },
  { value: 'apron', label: 'Önlük' }, { value: 'towel', label: 'Omuzda havlu' },
];

export const SKIN_COLORS: number[] = [0xf7d7b5, SKIN.light, SKIN.ruddy, SKIN.tan, SKIN.olive, 0xb97a4f, 0x8a5a3b];
export const HAIR_COLORS: number[] = [0x1a1410, 0x2b1a10, 0x3b2314, 0x5a3a20, 0x8a5a2b, 0xb5651d, 0x888888, 0xe8e8e8];
export const SHIRT_COLORS: number[] = [0x3d8bd9, 0xd94b4b, 0x8bc34a, 0xf4c430, 0x9c7bd1, 0xf1e3c6, 0xffffff, 0xe67e22, 0x2e8b7a, 0x34495e];
export const PANTS_COLORS: number[] = [0x3a3f58, 0x2b2b33, 0x5a4a3a, 0x1f3a93, 0x2e4b2a, 0x6d4c41, 0x222222, 0x7f8c8d];
/** Ceket: null = ceketsiz */
export const JACKET_COLORS: (number | null)[] = [null, 0x7b5b3a, 0x222831, 0x3b4a6b, 0x556b2f, 0x8e1b2a, 0x5d4037];

/** Kaydırıcıların sınırları (min, max, adım) */
export const SLIDERS = {
  height: { min: 0.88, max: 1.1, step: 0.01, label: 'Boy' },
  headSize: { min: 0.28, max: 0.37, step: 0.005, label: 'Kafa' },
  noseSize: { min: 0.9, max: 1.65, step: 0.05, label: 'Burun' },
  eyebrows: { min: 0.7, max: 1.8, step: 0.05, label: 'Kaş' },
  belly: { min: 0, max: 1, step: 0.05, label: 'Göbek' },
  legLength: { min: 0.42, max: 0.58, step: 0.01, label: 'Bacak' },
  voicePitch: { min: 0.75, max: 1.3, step: 0.05, label: 'Ses inceliği' },
} as const;
export type SliderKey = keyof typeof SLIDERS;

export const NAME_MAX = 16;
export const STORE_KEY = 'kahvehane.character.v1';

const HAT_SET = new Set(HATS.map((h) => h.value).filter((v) => v !== 'none'));
const NECK_SET = new Set(NECKS.map((h) => h.value).filter((v) => v !== 'none'));
const ACC_SET = new Set<string>([...HAT_SET, ...NECK_SET, ...EXTRAS.map((e) => e.value)]);

const clamp = (v: unknown, lo: number, hi: number, d: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : d;
  return Math.min(hi, Math.max(lo, n));
};
const pickOf = <T>(v: unknown, list: Choice<T>[], d: T): T => (list.some((c) => c.value === v) ? (v as T) : d);
const colorOf = (v: unknown, d: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffff ? v : d);

/** Görünen adı temizle: kontrol karakterleri ve HTML işaretleri atılır, boşluklar sadeleşir, uzunluk sınırlanır */
export function sanitizeName(v: unknown): string {
  if (typeof v !== 'string') return PLAYER_SPEC.name;
  const s = v.replace(/[\u0000-\u001f\u007f<>&"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  return s || PLAYER_SPEC.name;
}

/** Her türlü girdiyi geçerli bir oyuncu karakterine çevirir (beyaz liste + sınırlar + tek şapka/tek boyun parçası) */
export function sanitizeSpec(raw: unknown): CharacterSpec {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = PLAYER_SPEC;
  const accIn = Array.isArray(r.accessories) ? r.accessories.filter((a): a is Accessory => typeof a === 'string' && ACC_SET.has(a)) : d.accessories;
  const acc: Accessory[] = [];
  let hat = false, neck = false;
  for (const a of accIn) {
    if (acc.includes(a)) continue;
    if (HAT_SET.has(a)) { if (hat) continue; hat = true; }
    if (NECK_SET.has(a)) { if (neck) continue; neck = true; }
    acc.push(a);
  }
  const S = SLIDERS;
  const spec: CharacterSpec = {
    id: 'player',
    name: sanitizeName(r.name),
    height: clamp(r.height, S.height.min, S.height.max, d.height),
    headSize: clamp(r.headSize, S.headSize.min, S.headSize.max, d.headSize),
    headShape: pickOf(r.headShape, HEAD_SHAPES, d.headShape),
    noseSize: clamp(r.noseSize, S.noseSize.min, S.noseSize.max, d.noseSize),
    noseShape: pickOf(r.noseShape, NOSE_SHAPES, d.noseShape),
    mustache: pickOf(r.mustache, MUSTACHES, d.mustache),
    eyebrows: clamp(r.eyebrows, S.eyebrows.min, S.eyebrows.max, d.eyebrows),
    hair: pickOf(r.hair, HAIRS, d.hair),
    hairColor: colorOf(r.hairColor, d.hairColor),
    belly: clamp(r.belly, S.belly.min, S.belly.max, d.belly),
    legLength: clamp(r.legLength, S.legLength.min, S.legLength.max, d.legLength),
    armLength: d.armLength,
    handSize: d.handSize,
    skin: colorOf(r.skin, d.skin),
    shirt: colorOf(r.shirt, d.shirt),
    pants: colorOf(r.pants, d.pants),
    accessories: acc,
    voicePitch: clamp(r.voicePitch, S.voicePitch.min, S.voicePitch.max, d.voicePitch),
  };
  if (r.jacket !== undefined && r.jacket !== null) spec.jacket = colorOf(r.jacket, 0x7b5b3a);
  return spec;
}

/** Rastgele ama her zaman geçerli bir karakter (rng enjekte edilir) */
export function randomSpec(rng: Rng, name?: string): CharacterSpec {
  const one = <T>(a: T[]) => a[Math.floor(rng() * a.length) % a.length];
  const range = (k: SliderKey) => { const s = SLIDERS[k]; return Math.round((s.min + rng() * (s.max - s.min)) / s.step) * s.step; };
  const acc: Accessory[] = [];
  const hat = one(HATS).value; if (hat !== 'none' && rng() < 0.6) acc.push(hat);
  const neck = one(NECKS).value; if (neck !== 'none' && rng() < 0.5) acc.push(neck);
  for (const e of EXTRAS) if (rng() < 0.15) acc.push(e.value);
  return sanitizeSpec({
    name: name ?? PLAYER_SPEC.name,
    height: range('height'), headSize: range('headSize'), noseSize: range('noseSize'), eyebrows: range('eyebrows'),
    belly: range('belly'), legLength: range('legLength'), voicePitch: range('voicePitch'),
    headShape: one(HEAD_SHAPES).value, noseShape: one(NOSE_SHAPES).value, mustache: one(MUSTACHES).value, hair: one(HAIRS).value,
    hairColor: one(HAIR_COLORS), skin: one(SKIN_COLORS), shirt: one(SHIRT_COLORS), pants: one(PANTS_COLORS),
    jacket: one(JACKET_COLORS), accessories: acc,
  });
}

/** Tip şablonu: kahvehanedeki tiplerden birinin kıyafetini ve bedenini mevcut yüze giydir */
export function applyTemplate(spec: CharacterSpec, type: ArchetypeId): CharacterSpec {
  const look = mergeLook(type, {});
  const faceAcc = spec.accessories.filter((a) => a === 'glasses' || HAT_SET.has(a)); // gözlük ve şapka kalır
  return sanitizeSpec({ ...spec, ...look, name: spec.name, headShape: spec.headShape, noseShape: spec.noseShape, mustache: spec.mustache, hair: spec.hair, hairColor: spec.hairColor, skin: spec.skin, accessories: [...faceAcc, ...(look.accessories ?? [])] });
}
export const TEMPLATES: Choice<ArchetypeId>[] = (Object.keys(ARCHETYPES) as ArchetypeId[]).map((id) => ({ value: id, label: ARCHETYPES[id].label }));

/** Tek yuvalı parçayı değiştir (şapka/boyun): eskisini çıkarıp yenisini koyar */
export function setSlot(spec: CharacterSpec, slot: 'hat' | 'neck', value: Accessory | 'none'): CharacterSpec {
  const set = slot === 'hat' ? HAT_SET : NECK_SET;
  const acc = spec.accessories.filter((a) => !set.has(a));
  if (value !== 'none') acc.push(value);
  return sanitizeSpec({ ...spec, accessories: acc });
}
export function slotValue(spec: CharacterSpec, slot: 'hat' | 'neck'): Accessory | 'none' {
  const set = slot === 'hat' ? HAT_SET : NECK_SET;
  return spec.accessories.find((a) => set.has(a)) ?? 'none';
}
export function toggleExtra(spec: CharacterSpec, a: Accessory): CharacterSpec {
  const has = spec.accessories.includes(a);
  return sanitizeSpec({ ...spec, accessories: has ? spec.accessories.filter((x) => x !== a) : [...spec.accessories, a] });
}

/** Kalıcılık arayüzü (tarayıcıda localStorage, testte bellek, ileride sunucu) */
export interface SpecStore { get(key: string): string | null; set(key: string, value: string): void }

export function loadPlayerSpec(store: SpecStore | null): { spec: CharacterSpec; saved: boolean } {
  try {
    const raw = store?.get(STORE_KEY);
    if (raw) return { spec: sanitizeSpec(JSON.parse(raw)), saved: true };
  } catch { /* bozuk kayıt: varsayılana dön */ }
  return { spec: sanitizeSpec(PLAYER_SPEC), saved: false };
}

export function savePlayerSpec(store: SpecStore | null, spec: CharacterSpec) {
  try { store?.set(STORE_KEY, JSON.stringify(sanitizeSpec(spec))); } catch { /* yok say */ }
}

export function localSpecStore(): SpecStore | null {
  try {
    // tarayıcıda localStorage; sunucuda (Worker) yok → null
    const ls = (globalThis as unknown as { localStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void } }).localStorage;
    if (!ls) return null;
    return { get: (k) => ls.getItem(k), set: (k, v) => ls.setItem(k, v) };
  } catch { return null; }
}

export const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
