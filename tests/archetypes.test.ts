import { describe, it, expect } from 'vitest';
import { ARCHETYPES, pickHabit, mergeLook, ArchetypeId } from '../src/npc/archetypes';
import { ROSTER, NPC_SPECS, PERSONALITIES, NPC_VOICES, specFor, personalityFor } from '../src/npc/roster';
import { LINES } from '../src/npc/personalities';
import { createRng } from '../src/games/common/rng';

const HATS = ['flatcap', 'fez', 'cap'];

describe('NPC tipleri ve kadro', () => {
  it('her NPC geçerli bir tipe bağlı, replikleri ve sesi var; her tip en az bir NPC’de kullanılıyor', () => {
    const used = new Set<ArchetypeId>();
    for (const d of ROSTER) {
      expect(ARCHETYPES[d.type]).toBeDefined();
      expect(LINES[d.id]).toBeDefined();
      expect(NPC_VOICES[d.id]).toBeDefined();
      used.add(d.type);
    }
    expect([...used].sort()).toEqual(Object.keys(ARCHETYPES).sort());
    expect(new Set(ROSTER.map((d) => d.id)).size).toBe(ROSTER.length);
  });

  it('tipin imza kıyafeti her zaman eklenir; şapkalar çakışmaz', () => {
    const byId = Object.fromEntries(NPC_SPECS.map((s) => [s.id, s]));
    expect(byId.kemal.accessories).toEqual(expect.arrayContaining(['tie', 'glasses', 'fez']));
    expect(byId.cemal.accessories).toEqual(expect.arrayContaining(['pencil', 'pocket']));
    expect(byId.nihat.accessories).toContain('tracksuit');
    expect(byId.ferhat.accessories).toContain('tracksuit');
    expect(byId.sukru.accessories).toEqual(expect.arrayContaining(['apron', 'bowtie', 'towel']));
    expect(byId.riza.accessories).toEqual(expect.arrayContaining(['vest', 'beads', 'flatcap']));
    for (const s of NPC_SPECS) {
      expect(s.accessories.filter((a) => HATS.includes(a)).length).toBeLessThanOrEqual(1);
      expect(new Set(s.accessories).size).toBe(s.accessories.length);
      expect(s.archetype).toBe(ROSTER.find((d) => d.id === s.id)!.type);
    }
    // NPC'nin kendi şapkası tipin şapkasını ezer
    const look = mergeLook('emekli', { accessories: ['fez'] });
    expect(look.accessories).toContain('fez');
  });

  it('NPC farkı tip varsayılanını ezer, verilmeyen değer tipten gelir', () => {
    const riza = PERSONALITIES.riza;
    expect(riza.temper).toBe(0.9); // kendi değeri
    expect(riza.kibitz).toBe(ARCHETYPES.emekli.traits.kibitz); // tipten
    expect(PERSONALITIES.sukru.activities).toEqual({ serve: 10 }); // kahveci tipinden
    expect(PERSONALITIES.cemal.betBoldness).toBe(0.9);
    // tipin genel boşta replikleri NPC'nin kendi replikleriyle karışır
    expect(riza.lines.idle).toEqual(expect.arrayContaining([...LINES.riza.idle, ...ARCHETYPES.emekli.idleLines]));
    expect(LINES.riza.idle).not.toEqual(expect.arrayContaining(ARCHETYPES.emekli.idleLines)); // kaynak değişmez
  });

  it('tipler hareketle de ayrışır: emekli en ağır, delikanlı en hızlı; emekli elleri arkada yürür', () => {
    const sp = (t: ArchetypeId) => ARCHETYPES[t].gait.speed;
    expect(sp('emekli')).toBeLessThan(sp('memur'));
    expect(sp('memur')).toBeLessThan(sp('esnaf'));
    expect(sp('esnaf')).toBeLessThan(sp('delikanli'));
    expect(ARCHETYPES.emekli.gait.handsBehind).toBe(true);
    expect(new Set(Object.values(ARCHETYPES).map((a) => a.sit)).size).toBeGreaterThanOrEqual(4);
    // bekleme alışkanlığı tipin baskın huyuna göre seçilir
    const rng = createRng(7);
    const count = (t: ArchetypeId, k: string) => { let n = 0; for (let i = 0; i < 2000; i++) if (pickHabit(ARCHETYPES[t].idle, rng()) === k) n++; return n; };
    expect(count('memur', 'armsCrossed')).toBeGreaterThan(count('memur', 'bounce'));
    expect(count('delikanli', 'bounce')).toBeGreaterThan(count('emekli', 'bounce'));
    expect(count('emekli', 'handsBehind')).toBeGreaterThan(600);
  });

  it('kadro verisi JSON’a çevrilebilir ve geri kurulduğunda aynı karakterleri verir', () => {
    const back = JSON.parse(JSON.stringify(ROSTER));
    expect(back.map(specFor)).toEqual(NPC_SPECS);
    expect(back.map(personalityFor)).toEqual(ROSTER.map(personalityFor));
    expect(() => JSON.stringify(ARCHETYPES)).not.toThrow();
  });
});
