/**
 * Kahvehanenin müdavimleri — her NPC TEK YERDE tanımlıdır: tip, görünüş farkları, kişilik değerleri, ses.
 * Tip varsayılanları (kıyafet, yürüyüş, oturuş, alışkanlıklar): archetypes.ts. Replikler: personalities.ts (LINES).
 * Saf veri modülü (three.js/DOM yok).
 */
import type { CharacterSpec, Accessory } from '../characters/CharacterSpec';
import { SKIN } from '../characters/CharacterSpec';
import type { VoiceProfile } from '../audio/voiceLogic';
import { ARCHETYPES, ArchetypeId, mergeLook } from './archetypes';
import { LINES, Personality } from './personalities';

export interface NpcDef {
  id: string;
  name: string;
  type: ArchetypeId;
  /** Tipten farklı görünüş (yüz, saç, renkler, ek aksesuar) */
  look: Partial<Omit<CharacterSpec, 'id' | 'name' | 'archetype'>> & { accessories?: Accessory[] };
  /** Tipten farklı kişilik değerleri */
  traits: Partial<Omit<Personality, 'id' | 'archetype' | 'lines' | 'friends' | 'rivals'>>;
  friends: string[];
  rivals: string[];
  /** Kendine özgü konuşma sesi */
  voice: VoiceProfile;
}

export const ROSTER: NpcDef[] = [
  {
    id: 'riza', name: 'Rıza Dayı', type: 'emekli',
    look: {
      headSize: 0.36, headShape: 'wide', noseSize: 1.45, noseShape: 'potato', mustache: 'walrus', eyebrows: 1.7,
      hair: 'combover', hairColor: 0xe8e8e8, belly: 1, legLength: 0.42, armLength: 0.95, handSize: 1.3,
      skin: SKIN.ruddy, shirt: 0xf1e3c6, jacket: 0x7b5b3a, accessories: ['flatcap'], voicePitch: 0.75,
    },
    traits: { temper: 0.9, favoriteTables: ['okey'], activities: { sitTable: 5, watchTv: 1, chat: 2, wander: 1 }, signature: ['slamTable', 'angry', 'think'], betBoldness: 0.35 },
    friends: ['kemal', 'hasan'], rivals: ['cemal', 'ferhat'],
    voice: { base: 105, rate: 6, range: 0.25, timbre: 'sawtooth', gain: 1 }, // kalın, ağır, homurtulu
  },
  {
    id: 'cemal', name: 'Cemal Reis', type: 'esnaf',
    look: {
      height: 1.08, headSize: 0.31, headShape: 'long', noseSize: 1.2, noseShape: 'hook', mustache: 'handlebar', eyebrows: 1.2,
      hair: 'slick', hairColor: 0x1a1410, legLength: 0.58, armLength: 1.1, handSize: 1.1,
      skin: SKIN.olive, shirt: 0xd94b4b, accessories: ['glasses'], voicePitch: 0.9,
    },
    traits: { temper: 0.6, favoriteTables: ['tavla', 'okey'], activities: { sitTable: 4, chat: 2, watchTv: 1, wander: 1 }, signature: ['leanBack', 'point', 'shrug'], betBoldness: 0.9 },
    friends: ['nihat'], rivals: ['riza', 'kemal'],
    voice: { base: 135, rate: 9, range: 0.35, timbre: 'square', gain: 0.9 }, // hızlı, iddialı
  },
  {
    id: 'nihat', name: 'Nihat Çakal', type: 'delikanli',
    look: {
      height: 0.9, headSize: 0.32, headShape: 'egg', noseSize: 1.6, noseShape: 'long', mustache: 'pencil', eyebrows: 0.9,
      hair: 'tuft', hairColor: 0x5a3a20, belly: 0.15, legLength: 0.48, armLength: 1.15, handSize: 1.05,
      skin: SKIN.light, shirt: 0x8bc34a, pants: 0x2e4b2a, accessories: ['cap'], voicePitch: 1.25,
    },
    traits: { temper: 0.3, favoriteTables: ['kart', 'okey'], activities: { sitTable: 4, chat: 3, wander: 2, watchTv: 1 }, signature: ['laugh', 'point', 'bellyDance'], betBoldness: 0.5 },
    friends: ['riza', 'cemal', 'sukru', 'hasan', 'ferhat', 'kemal'], rivals: [],
    voice: { base: 190, rate: 10, range: 0.5, timbre: 'triangle', gain: 0.9 }, // ince, kıkırdak
  },
  {
    id: 'sukru', name: 'Çaycı Şükrü', type: 'kahveci',
    look: {
      headSize: 0.3, headShape: 'round', noseSize: 1.0, noseShape: 'button', mustache: 'chevron', eyebrows: 1.1,
      hair: 'curly', hairColor: 0x2b1a10, armLength: 1.0, handSize: 1.1, skin: SKIN.tan, voicePitch: 1.15,
    },
    traits: { temper: 0.4 },
    friends: ['riza', 'cemal', 'nihat', 'hasan', 'ferhat', 'kemal'], rivals: [],
    voice: { base: 165, rate: 11, range: 0.4, timbre: 'triangle', gain: 0.85 }, // çok konuşan, hızlı
  },
  {
    id: 'hasan', name: 'Uykucu Hasan', type: 'emekli',
    look: {
      height: 0.97, headSize: 0.34, headShape: 'round', noseSize: 1.25, noseShape: 'potato', mustache: 'walrus', eyebrows: 1.3,
      hair: 'bald', hairColor: 0x777777, legLength: 0.45, armLength: 1, handSize: 1.2,
      skin: SKIN.olive, shirt: 0x9c7bd1, pants: 0x3d3d3d, jacket: 0x556b2f, voicePitch: 0.8,
    },
    traits: { temper: 0.2, favoriteTables: ['tavla'], activities: { sleep: 6, bench: 2, watchTv: 1 }, signature: ['leanBack', 'shrug'], betBoldness: 0.2 },
    friends: ['riza', 'nihat'], rivals: [],
    voice: { base: 95, rate: 4, range: 0.15, timbre: 'sawtooth', gain: 0.7 }, // uykulu, yavaş
  },
  {
    id: 'ferhat', name: 'Fanatik Ferhat', type: 'delikanli',
    look: {
      height: 1.04, headSize: 0.3, headShape: 'egg', noseSize: 1.15, noseShape: 'hook', mustache: 'chevron', eyebrows: 1.5,
      hair: 'side', hairColor: 0x221509, belly: 0.6, legLength: 0.53, armLength: 1.05, handSize: 1.15,
      skin: SKIN.ruddy, shirt: 0xf4c430, pants: 0x1f3a93, accessories: ['scarf'], voicePitch: 1.05,
    },
    traits: { temper: 0.75, favoriteTables: ['kart'], activities: { watchTv: 6, chat: 1, sitTable: 1 }, signature: ['cheer', 'angry', 'point'], betBoldness: 0.7 },
    friends: ['nihat', 'cemal'], rivals: ['kemal', 'riza'],
    voice: { base: 150, rate: 9.5, range: 0.55, timbre: 'square', gain: 1 }, // coşkulu
  },
  {
    id: 'kemal', name: 'Muhtar Kemal', type: 'memur',
    look: {
      headSize: 0.35, headShape: 'wide', noseSize: 1.3, noseShape: 'hook', mustache: 'handlebar', eyebrows: 1.4,
      hair: 'slick', hairColor: 0x888888, belly: 0.75, legLength: 0.48, armLength: 1, handSize: 1.2,
      skin: SKIN.light, shirt: 0xe0e0e0, accessories: ['fez'], voicePitch: 0.85,
    },
    traits: { temper: 0.5, favoriteTables: ['okey', 'kart'], activities: { sitTable: 4, chat: 3, bench: 1 }, signature: ['think', 'talk', 'facepalm'], betBoldness: 0.4 },
    friends: ['riza'], rivals: ['cemal', 'ferhat'],
    voice: { base: 120, rate: 6.5, range: 0.2, timbre: 'sawtooth', gain: 0.9 }, // resmi, tekdüze
  },
];

/** Tanımdan görsel karakter verisi (tip varsayılanları + NPC farkları) */
export function specFor(d: NpcDef): CharacterSpec {
  const base: CharacterSpec = {
    id: d.id, name: d.name, height: 1, headSize: 0.32, headShape: 'round', noseSize: 1.2, noseShape: 'potato',
    mustache: 'none', eyebrows: 1, hair: 'side', hairColor: 0x2b1a10, belly: 0.5, legLength: 0.5, armLength: 1,
    handSize: 1.1, skin: SKIN.tan, shirt: 0xdddddd, pants: 0x333333, accessories: [], voicePitch: 1,
  };
  return { ...base, ...mergeLook(d.type, d.look), id: d.id, name: d.name, archetype: d.type } as CharacterSpec;
}

/** Tanımdan kişilik (tip varsayılanları + NPC farkları + replikler) */
export function personalityFor(d: NpcDef): Personality {
  const t = ARCHETYPES[d.type].traits;
  const lines = { ...LINES[d.id] };
  // tipe özgü genel boşta replikleri karışsın
  lines.idle = [...lines.idle, ...ARCHETYPES[d.type].idleLines];
  return {
    id: d.id,
    archetype: d.type,
    temper: d.traits.temper ?? t.temper,
    betBoldness: d.traits.betBoldness ?? t.betBoldness,
    favoriteTables: d.traits.favoriteTables ?? t.favoriteTables,
    activities: d.traits.activities ?? t.activities,
    signature: d.traits.signature ?? t.signature,
    kibitz: d.traits.kibitz ?? t.kibitz,
    friends: d.friends,
    rivals: d.rivals,
    lines,
  };
}

export const NPC_SPECS: CharacterSpec[] = ROSTER.map(specFor);
export const PERSONALITIES: Record<string, Personality> = Object.fromEntries(ROSTER.map((d) => [d.id, personalityFor(d)]));
export const NPC_VOICES: Record<string, VoiceProfile> = Object.fromEntries(ROSTER.map((d) => [d.id, d.voice]));
