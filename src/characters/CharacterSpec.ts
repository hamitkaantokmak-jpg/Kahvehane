/**
 * Karakter tanımı — modüler yapı, ileride karakter oluşturma ekranı bu veriyi düzenleyecek.
 * Tüm görsel özellikler parametreli; model bu veriden prosedürel olarak üretilir.
 */
export type HeadShape = 'round' | 'egg' | 'wide' | 'long';
export type NoseShape = 'potato' | 'long' | 'hook' | 'button';
export type MustacheStyle = 'none' | 'walrus' | 'handlebar' | 'pencil' | 'chevron';
export type HairStyle = 'bald' | 'side' | 'curly' | 'slick' | 'tuft' | 'combover';
export type Accessory = 'flatcap' | 'fez' | 'glasses' | 'beads' | 'apron' | 'vest' | 'scarf' | 'cap' | 'bowtie';

export interface CharacterSpec {
  id: string;
  name: string;
  /** Genel ölçek (boy). */
  height: number;
  headSize: number;
  headShape: HeadShape;
  noseSize: number;
  noseShape: NoseShape;
  mustache: MustacheStyle;
  eyebrows: number; // kalınlık
  hair: HairStyle;
  hairColor: number;
  belly: number; // 0..1
  legLength: number; // kalça yüksekliği (m)
  armLength: number;
  handSize: number;
  skin: number;
  shirt: number;
  pants: number;
  jacket?: number;
  accessories: Accessory[];
  /** Ses perdesi (sentez sesler için). */
  voicePitch: number;
}

export const SKIN = { light: 0xf3c69a, tan: 0xe0a476, olive: 0xd29a6a, ruddy: 0xeba487 };

export const PLAYER_SPEC: CharacterSpec = {
  id: 'player', name: 'Sen', height: 1, headSize: 0.33, headShape: 'round', noseSize: 1.1, noseShape: 'potato',
  mustache: 'chevron', eyebrows: 1, hair: 'curly', hairColor: 0x3b2314, belly: 0.45, legLength: 0.5, armLength: 1,
  handSize: 1.15, skin: SKIN.tan, shirt: 0x3d8bd9, pants: 0x3a3f58, accessories: ['scarf'], voicePitch: 1,
};

export const NPC_SPECS: CharacterSpec[] = [
  {
    id: 'riza', name: 'Rıza Dayı', height: 0.95, headSize: 0.36, headShape: 'wide', noseSize: 1.45, noseShape: 'potato',
    mustache: 'walrus', eyebrows: 1.7, hair: 'combover', hairColor: 0xe8e8e8, belly: 1, legLength: 0.42, armLength: 0.95,
    handSize: 1.3, skin: SKIN.ruddy, shirt: 0xf1e3c6, pants: 0x5a4a3a, jacket: 0x7b5b3a, accessories: ['flatcap', 'beads'], voicePitch: 0.75,
  },
  {
    id: 'cemal', name: 'Cemal Reis', height: 1.08, headSize: 0.31, headShape: 'long', noseSize: 1.2, noseShape: 'hook',
    mustache: 'handlebar', eyebrows: 1.2, hair: 'slick', hairColor: 0x1a1410, belly: 0.55, legLength: 0.58, armLength: 1.1,
    handSize: 1.1, skin: SKIN.olive, shirt: 0xd94b4b, pants: 0x2b2b33, jacket: 0x222831, accessories: ['glasses'], voicePitch: 0.9,
  },
  {
    id: 'nihat', name: 'Nihat Çakal', height: 0.9, headSize: 0.32, headShape: 'egg', noseSize: 1.6, noseShape: 'long',
    mustache: 'pencil', eyebrows: 0.9, hair: 'tuft', hairColor: 0x5a3a20, belly: 0.15, legLength: 0.48, armLength: 1.15,
    handSize: 1.05, skin: SKIN.light, shirt: 0x8bc34a, pants: 0x4e3b2c, accessories: ['cap'], voicePitch: 1.25,
  },
  {
    id: 'sukru', name: 'Çaycı Şükrü', height: 1.0, headSize: 0.3, headShape: 'round', noseSize: 1.0, noseShape: 'button',
    mustache: 'chevron', eyebrows: 1.1, hair: 'curly', hairColor: 0x2b1a10, belly: 0.3, legLength: 0.52, armLength: 1.0,
    handSize: 1.1, skin: SKIN.tan, shirt: 0xffffff, pants: 0x222222, accessories: ['apron', 'bowtie'], voicePitch: 1.15,
  },
  {
    id: 'hasan', name: 'Uykucu Hasan', height: 0.97, headSize: 0.34, headShape: 'round', noseSize: 1.25, noseShape: 'potato',
    mustache: 'walrus', eyebrows: 1.3, hair: 'bald', hairColor: 0x777777, belly: 0.85, legLength: 0.45, armLength: 1,
    handSize: 1.2, skin: SKIN.olive, shirt: 0x9c7bd1, pants: 0x3d3d3d, jacket: 0x556b2f, accessories: ['vest'], voicePitch: 0.8,
  },
  {
    id: 'ferhat', name: 'Fanatik Ferhat', height: 1.04, headSize: 0.3, headShape: 'egg', noseSize: 1.15, noseShape: 'hook',
    mustache: 'chevron', eyebrows: 1.5, hair: 'side', hairColor: 0x221509, belly: 0.6, legLength: 0.53, armLength: 1.05,
    handSize: 1.15, skin: SKIN.ruddy, shirt: 0xf4c430, pants: 0x1f3a93, accessories: ['scarf'], voicePitch: 1.05,
  },
  {
    id: 'kemal', name: 'Muhtar Kemal', height: 1.0, headSize: 0.35, headShape: 'wide', noseSize: 1.3, noseShape: 'hook',
    mustache: 'handlebar', eyebrows: 1.4, hair: 'slick', hairColor: 0x888888, belly: 0.75, legLength: 0.48, armLength: 1,
    handSize: 1.2, skin: SKIN.light, shirt: 0xe0e0e0, pants: 0x30302f, jacket: 0x3b4a6b, accessories: ['fez', 'glasses'], voicePitch: 0.85,
  },
];
