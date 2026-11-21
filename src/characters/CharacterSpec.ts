/**
 * Karakter tanımı — modüler yapı, ileride karakter oluşturma ekranı bu veriyi düzenleyecek.
 * Tüm görsel özellikler parametreli; model bu veriden prosedürel olarak üretilir.
 */
export type HeadShape = 'round' | 'egg' | 'wide' | 'long';
export type NoseShape = 'potato' | 'long' | 'hook' | 'button';
export type MustacheStyle = 'none' | 'walrus' | 'handlebar' | 'pencil' | 'chevron';
export type HairStyle = 'bald' | 'side' | 'curly' | 'slick' | 'tuft' | 'combover';
export type Accessory = 'flatcap' | 'fez' | 'glasses' | 'beads' | 'apron' | 'vest' | 'scarf' | 'cap' | 'bowtie'
  | 'tie' | 'pencil' | 'pocket' | 'tracksuit' | 'towel';

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
  /** NPC tipi (npc/archetypes.ts) — yürüyüş, oturuş ve bekleme alışkanlıkları buradan gelir. Oyuncuda yok. */
  archetype?: import('../npc/archetypes').ArchetypeId;
}

export const SKIN = { light: 0xf3c69a, tan: 0xe0a476, olive: 0xd29a6a, ruddy: 0xeba487 };

export const PLAYER_SPEC: CharacterSpec = {
  id: 'player', name: 'Sen', height: 1, headSize: 0.33, headShape: 'round', noseSize: 1.1, noseShape: 'potato',
  mustache: 'chevron', eyebrows: 1, hair: 'curly', hairColor: 0x3b2314, belly: 0.45, legLength: 0.5, armLength: 1,
  handSize: 1.15, skin: SKIN.tan, shirt: 0x3d8bd9, pants: 0x3a3f58, accessories: ['scarf'], voicePitch: 1,
};

/** NPC tanımları (tip + görünüş + kişilik + ses) tek yerde: npc/roster.ts */
