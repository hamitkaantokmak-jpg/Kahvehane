import { describe, it, expect } from 'vitest';
import * as C from '../src/characters/creator';
import { PLAYER_SPEC } from '../src/characters/CharacterSpec';
import { ARCHETYPES } from '../src/npc/archetypes';
import { createRng } from '../src/games/common/rng';

const memStore = () => { const m = new Map<string, string>(); return { m, get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v) }; };
const HATS = ['flatcap', 'fez', 'cap'];
const NECKS = ['scarf', 'bowtie', 'tie'];

describe('Karakter oluşturucu (saf mantık)', () => {
  it('bozuk/kötü niyetli girdiyi geçerli karaktere çevirir', () => {
    const s = C.sanitizeSpec({
      id: 'hacker', name: '<img src=x onerror=alert(1)>Ali\u0000   Usta çok uzun bir isim', height: 99, headSize: -5, belly: 'çok',
      headShape: 'kare', hair: 'mohawk', skin: -1, shirt: 0x1000000, accessories: ['fez', 'cap', 'tie', 'scarf', 'jetpack', 'glasses', 'glasses'],
      voicePitch: NaN, jacket: null,
    });
    expect(s.id).toBe('player');
    expect(s.name).not.toMatch(/[<>]/);
    expect(s.name.length).toBeLessThanOrEqual(C.NAME_MAX);
    expect(s.height).toBe(C.SLIDERS.height.max);
    expect(s.headSize).toBe(C.SLIDERS.headSize.min);
    expect(s.belly).toBe(PLAYER_SPEC.belly);
    expect(s.headShape).toBe(PLAYER_SPEC.headShape);
    expect(s.hair).toBe(PLAYER_SPEC.hair);
    expect(s.skin).toBe(PLAYER_SPEC.skin);
    expect(s.shirt).toBe(PLAYER_SPEC.shirt);
    expect(s.voicePitch).toBe(PLAYER_SPEC.voicePitch);
    expect(s.jacket).toBeUndefined();
    // tek şapka, tek boyun parçası, bilinmeyen parça yok, tekrar yok
    expect(s.accessories).toEqual(['fez', 'tie', 'glasses']);
    expect(C.sanitizeSpec(null)).toEqual(C.sanitizeSpec(PLAYER_SPEC));
    expect(C.sanitizeName('   ')).toBe(PLAYER_SPEC.name);
  });

  it('rastgele karakter her zaman geçerli ve tohumla tekrarlanabilir', () => {
    const a = createRng(42), b = createRng(42);
    for (let i = 0; i < 300; i++) {
      const x = C.randomSpec(a, 'Ali');
      expect(x).toEqual(C.randomSpec(b, 'Ali'));
      expect(C.sanitizeSpec(x)).toEqual(x); // zaten temiz
      expect(x.accessories.filter((v) => HATS.includes(v)).length).toBeLessThanOrEqual(1);
      expect(x.accessories.filter((v) => NECKS.includes(v)).length).toBeLessThanOrEqual(1);
      expect(x.name).toBe('Ali');
    }
  });

  it('yuvalar ve ekstralar: şapka/boyun değişince eskisi çıkar; ekstra aç-kapa', () => {
    let s = C.sanitizeSpec(PLAYER_SPEC); // atkılı
    s = C.setSlot(s, 'hat', 'flatcap');
    s = C.setSlot(s, 'hat', 'fez');
    expect(C.slotValue(s, 'hat')).toBe('fez');
    expect(s.accessories).not.toContain('flatcap');
    s = C.setSlot(s, 'neck', 'bowtie');
    expect(s.accessories).not.toContain('scarf');
    s = C.setSlot(s, 'neck', 'none');
    expect(C.slotValue(s, 'neck')).toBe('none');
    s = C.toggleExtra(s, 'vest');
    expect(s.accessories).toContain('vest');
    s = C.toggleExtra(s, 'vest');
    expect(s.accessories).not.toContain('vest');
  });

  it('tip şablonu kıyafeti giydirir ama yüzü, şapkayı ve adı korur', () => {
    const base = C.sanitizeSpec({ ...PLAYER_SPEC, name: 'Kaan', mustache: 'handlebar', hair: 'bald', skin: C.SKIN_COLORS[6], accessories: ['fez', 'glasses', 'scarf'] });
    const m = C.applyTemplate(base, 'memur');
    expect(m.name).toBe('Kaan');
    expect(m.mustache).toBe('handlebar');
    expect(m.hair).toBe('bald');
    expect(m.skin).toBe(C.SKIN_COLORS[6]);
    expect(m.accessories).toEqual(expect.arrayContaining(['fez', 'glasses', 'tie']));
    expect(m.accessories).not.toContain('scarf'); // tek boyun parçası: kravat
    expect(m.jacket).toBe(ARCHETYPES.memur.look.jacket);
    expect(C.applyTemplate(base, 'delikanli').accessories).toContain('tracksuit');
  });

  it('kaydet/yükle: gidip gelir; kayıt yoksa ya da bozuksa varsayılan', () => {
    const st = memStore();
    expect(C.loadPlayerSpec(st)).toEqual({ spec: C.sanitizeSpec(PLAYER_SPEC), saved: false });
    const x = C.randomSpec(createRng(7), 'Hamit');
    C.savePlayerSpec(st, x);
    expect(C.loadPlayerSpec(st)).toEqual({ spec: x, saved: true });
    st.m.set(C.STORE_KEY, '{bozuk json');
    expect(C.loadPlayerSpec(st).saved).toBe(false);
    st.m.set(C.STORE_KEY, JSON.stringify({ ...x, height: 50, accessories: ['cap', 'fez'] }));
    const y = C.loadPlayerSpec(st).spec;
    expect(y.height).toBe(C.SLIDERS.height.max);
    expect(y.accessories).toEqual(['cap']);
    expect(C.loadPlayerSpec(null).saved).toBe(false);
  });
});
