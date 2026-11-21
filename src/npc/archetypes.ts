/**
 * NPC tipleri (saf modül: three.js/DOM yok, JSON'a çevrilebilir veri).
 *
 * Her NPC bir tipe bağlıdır. Tip; görünüşün (kıyafet, aksesuar, beden), yürüyüşün, oturuşun,
 * bekleme alışkanlıklarının, sesin ve davranışın VARSAYILANLARINI verir. NPC tanımı (roster.ts)
 * yalnızca tipten farkını yazar. Amaç: uzaktan bakınca bile kimin hangi tip olduğu anlaşılsın.
 *
 * Tipler sevimli karikatürlerdir; hiçbir bölge, şive ya da kişiyle alay edilmez.
 */
import type { Accessory, CharacterSpec } from '../characters/CharacterSpec';
import type { ActivityKind } from './personalities';
import type { ActionName } from '../characters/Animator';

export type ArchetypeId = 'emekli' | 'esnaf' | 'delikanli' | 'memur' | 'kahveci';

/** Yürüyüş biçimi (Animator bu çarpanlarla yürür) */
export interface Gait {
  /** Varsayılan yürüme hızı (m/s) */
  speed: number;
  /** Adım sıklığı çarpanı */
  cadence: number;
  /** Kol sallama çarpanı */
  armSwing: number;
  /** Zıplama (adım başına yükselme) çarpanı */
  bounce: number;
  /** Yana yalpalama çarpanı (göbekliler paytak) */
  sway: number;
  /** Yürürken öne eğilme (negatif: dimdik/arkaya) */
  lean: number;
  /** Sürekli kambur duruş (baş ve gövde öne) */
  hunch: number;
  /** Elleri arkada kavuşturup yürür */
  handsBehind: boolean;
}

/** Oturuş biçimi */
export type SitStyle = 'slouch' | 'upright' | 'forward' | 'relaxed';

/** Ayakta beklerken alışkanlıklar (ağırlıklar) */
export interface IdleHabits {
  lookAround: number;
  handsBehind: number;
  sway: number;
  armsCrossed: number;
  handsOnHips: number;
  bounce: number;
}

export interface Archetype {
  id: ArchetypeId;
  /** Oyunda görünen ad */
  label: string;
  /** Kısa tarif (README / ileride bilgi kartı) */
  description: string;
  /** Görünüş varsayılanları (NPC tanımı ezebilir). `outfit` tipin imza aksesuarlarıdır, her zaman eklenir. */
  look: Partial<Omit<CharacterSpec, 'id' | 'name' | 'accessories'>> & { outfit: Accessory[] };
  gait: Gait;
  sit: SitStyle;
  idle: IdleHabits;
  /** Davranış varsayılanları */
  traits: {
    temper: number;
    betBoldness: number;
    favoriteTables: ('okey' | 'tavla' | 'kart')[];
    activities: Partial<Record<ActivityKind, number>>;
    signature: ActionName[];
    /** Başkasının oyununa akıl verme sıklığı çarpanı */
    kibitz: number;
  };
  /** Ses varsayılanı (perde çarpanı ve konuşma hızı) */
  voice: { pitch: number; rate: number };
  /** Tipe özgü genel replikler (NPC'nin kendi boşta repliklerine karışır) */
  idleLines: string[];
}

const NEUTRAL_IDLE: IdleHabits = { lookAround: 1, handsBehind: 0, sway: 1, armsCrossed: 0, handsOnHips: 0, bounce: 0 };

export const ARCHETYPES: Record<ArchetypeId, Archetype> = {
  emekli: {
    id: 'emekli',
    label: 'Emekli dayı',
    description: 'Kasket, yelek, tespih. Ağır ve elleri arkada yürür, arkasına yaslanıp oturur, bolca akıl verir.',
    look: { height: 0.95, belly: 0.85, legLength: 0.44, pants: 0x5a4a3a, jacket: 0x8a6d4b, outfit: ['vest', 'beads'] },
    gait: { speed: 1.0, cadence: 0.85, armSwing: 0.3, bounce: 0.5, sway: 1.5, lean: 0.12, hunch: 0.12, handsBehind: true },
    sit: 'slouch',
    idle: { ...NEUTRAL_IDLE, handsBehind: 3, lookAround: 1.5, sway: 0.5 },
    traits: {
      temper: 0.5, betBoldness: 0.3, favoriteTables: ['okey', 'tavla'],
      activities: { sitTable: 4, chat: 2, bench: 2, watchTv: 1 }, signature: ['think', 'leanBack', 'shrug'], kibitz: 1.6,
    },
    voice: { pitch: 0.8, rate: 5.5 },
    idleLines: ['Bizim zamanımızda çay 25 kuruştu.', 'Ah dizlerim, ah...', 'Şu gençler bir otursa da okey öğrense.', 'Hava döndü, belli olur bizim dizden.'],
  },
  esnaf: {
    id: 'esnaf',
    label: 'Esnaf',
    description: 'Kolları sıvalı gömlek, kulağında kalem, cebinde not. Hızlı adımlı, pazarlıkçı, elleri belinde bekler.',
    look: { height: 1.02, belly: 0.55, legLength: 0.52, pants: 0x2b2b33, outfit: ['pencil', 'pocket'] },
    gait: { speed: 1.5, cadence: 1.15, armSwing: 1.3, bounce: 0.9, sway: 1, lean: 0.1, hunch: 0, handsBehind: false },
    sit: 'relaxed',
    idle: { ...NEUTRAL_IDLE, handsOnHips: 3, lookAround: 1 },
    traits: {
      temper: 0.55, betBoldness: 0.6, favoriteTables: ['tavla', 'kart'],
      activities: { sitTable: 3, chat: 2, wander: 2 }, signature: ['point', 'shrug', 'talk'], kibitz: 1,
    },
    voice: { pitch: 0.95, rate: 9 },
    idleLines: ['Dükkanı çırağa bıraktım, bir çay içip kalkacağım.', 'Bugün siftah yaptık, çaylar benden değil!', 'Hesap kitap, hep hesap kitap.'],
  },
  delikanli: {
    id: 'delikanli',
    label: 'Delikanlı',
    description: 'Eşofman, atkı ya da şapka, dağınık saç. Zıplayarak hızlı yürür, öne eğilip oturur, yerinde duramaz.',
    look: { height: 1.0, belly: 0.2, legLength: 0.54, pants: 0x1f2a44, outfit: ['tracksuit'] },
    gait: { speed: 1.7, cadence: 1.2, armSwing: 1.2, bounce: 1.6, sway: 0.6, lean: 0.14, hunch: 0, handsBehind: false },
    sit: 'forward',
    idle: { ...NEUTRAL_IDLE, bounce: 3, lookAround: 2, sway: 0.5 },
    traits: {
      temper: 0.65, betBoldness: 0.65, favoriteTables: ['kart', 'okey'],
      activities: { watchTv: 3, sitTable: 3, chat: 2, wander: 2 }, signature: ['cheer', 'laugh', 'point'], kibitz: 0.8,
    },
    voice: { pitch: 1.2, rate: 10 },
    idleLines: ['Abi bir dakika, maç kaçta?', 'Ben bu oyunu telefonda hep yeniyorum.', 'Hadi ya, bir el daha!'],
  },
  memur: {
    id: 'memur',
    label: 'Memur',
    description: 'Ceket, kravat, gözlük, taranmış saç. Dimdik ve ölçülü yürür, kollarını kavuşturur, kurallara titizdir.',
    look: { height: 1.0, belly: 0.6, legLength: 0.5, pants: 0x30302f, jacket: 0x3b4a6b, outfit: ['tie', 'glasses'] },
    gait: { speed: 1.25, cadence: 0.95, armSwing: 0.55, bounce: 0.4, sway: 0.5, lean: -0.04, hunch: 0, handsBehind: false },
    sit: 'upright',
    idle: { ...NEUTRAL_IDLE, armsCrossed: 3, lookAround: 0.8, sway: 0.3 },
    traits: {
      temper: 0.35, betBoldness: 0.25, favoriteTables: ['okey'],
      activities: { sitTable: 4, chat: 3, bench: 1 }, signature: ['think', 'talk', 'facepalm'], kibitz: 1.3,
    },
    voice: { pitch: 0.9, rate: 6.5 },
    idleLines: ['Usulüne göre oynayalım lütfen.', 'Bu masanın kuralları yazılı mı acaba?', 'Mesai bitti, şimdi okey mesaisi.'],
  },
  kahveci: {
    id: 'kahveci',
    label: 'Kahveci',
    description: 'Önlük, papyon, omzunda havlu. Tepsiyle dengeli ve çevik yürür, hiç boş durmaz.',
    look: { height: 1.0, belly: 0.3, legLength: 0.52, shirt: 0xffffff, pants: 0x222222, outfit: ['apron', 'bowtie', 'towel'] },
    gait: { speed: 1.45, cadence: 1.1, armSwing: 0.7, bounce: 0.7, sway: 0.6, lean: 0.06, hunch: 0, handsBehind: false },
    sit: 'upright',
    idle: { ...NEUTRAL_IDLE, handsOnHips: 1, lookAround: 2 },
    traits: {
      temper: 0.4, betBoldness: 0.1, favoriteTables: [],
      activities: { serve: 10 }, signature: ['pour', 'wave', 'talk'], kibitz: 0.5,
    },
    voice: { pitch: 1.1, rate: 11 },
    idleLines: ['Çaylar taze, demler yeni!', 'Kim çay dedi?', 'Bardak yıkamaktan elim nasır tuttu.'],
  },
};

/** Tipi olmayan karakter (oyuncu) için nötr yürüyüş */
export const NEUTRAL_GAIT: Gait = { speed: 1.3, cadence: 1, armSwing: 1, bounce: 1, sway: 1, lean: 0, hunch: 0, handsBehind: false };
export const NEUTRAL_HABITS: IdleHabits = NEUTRAL_IDLE;

/** Ağırlıklı alışkanlık seçimi (rng 0..1 enjekte edilir) */
export function pickHabit(h: IdleHabits, r: number): keyof IdleHabits | 'none' {
  const entries = Object.entries(h) as [keyof IdleHabits, number][];
  const total = entries.reduce((a, [, w]) => a + w, 0) + 1; // +1: hiçbir şey yapmama
  let x = r * total;
  for (const [k, w] of entries) { if ((x -= w) < 0) return k; }
  return 'none';
}

/** Görünüş birleştirme: tip varsayılanları + NPC farkları; tipin imza aksesuarları her zaman eklenir, şapkalar çakışmaz */
const HATS: Accessory[] = ['flatcap', 'fez', 'cap'];
export function mergeLook(type: ArchetypeId, own: Partial<CharacterSpec> & { accessories?: Accessory[] }): Partial<CharacterSpec> {
  const a = ARCHETYPES[type];
  const { outfit, ...defaults } = a.look;
  const ownAcc = own.accessories ?? [];
  const ownHat = ownAcc.some((x) => HATS.includes(x));
  const acc = [...new Set([...ownAcc, ...outfit.filter((x) => !(ownHat && HATS.includes(x)))])];
  return { ...defaults, ...own, accessories: acc };
}
