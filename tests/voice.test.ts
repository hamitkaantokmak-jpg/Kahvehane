import { describe, it, expect } from 'vitest';
import * as V from '../src/audio/voiceLogic';
import { createRng } from '../src/games/common/rng';
import { NPC_SPECS } from '../src/characters/CharacterSpec';

describe('NPC mırıltısı mantığı', () => {
  it('her NPC kendine özgü ses profiline sahip', () => {
    const ps = NPC_SPECS.map((s) => V.profileFor(s.id, s.voicePitch));
    const keys = new Set(ps.map((p) => `${p.base}|${p.rate}|${p.timbre}`));
    expect(keys.size).toBe(NPC_SPECS.length);
    expect(V.profileFor('riza').base).toBeLessThan(V.profileFor('nihat').base);
    expect(V.profileFor('hasan').rate).toBeLessThan(V.profileFor('sukru').rate);
    expect(V.profileFor('bilinmeyen', 1.2).base).toBeCloseTo(168);
  });
  it('Türkçe ünlülerden hece dizisi', () => {
    expect(V.vowelsOf('Oğlum ne yapıyorsun')).toEqual(['o', 'u', 'e', 'a', 'i', 'o', 'u']);
    expect(V.vowelsOf('Hmm')).toEqual(['a', 'a']);
    expect(V.vowelsOf('a'.repeat(1) + ' ba'.repeat(30)).length).toBe(14);
    expect(V.vowelsOf('Ööüü çay')).toEqual(['o', 'a']);
  });
  it('hece zamanlaması deterministik, sıralı; soru sonda yükselir, kişiye göre hız', () => {
    const p = V.profileFor('cemal');
    const a = V.syllablesFor('Bahse var mısın?', p, createRng(3));
    const b = V.syllablesFor('Bahse var mısın?', p, createRng(3));
    expect(a).toEqual(b);
    for (let i = 1; i < a.length; i++) expect(a[i].at).toBeGreaterThan(a[i - 1].at);
    expect(a[a.length - 1].pitch).toBeGreaterThan(1.3);
    const slow = V.totalDuration(V.syllablesFor('Zzz uyuyorum ben artık', V.profileFor('hasan'), createRng(1)));
    const fast = V.totalDuration(V.syllablesFor('Zzz uyuyorum ben artık', V.profileFor('sukru'), createRng(1)));
    expect(slow).toBeGreaterThan(fast);
  });
  it('en yakın 2-3 konuşmacı seçilir, menzil dışı sessiz', () => {
    const sp = [{ id: 'a', x: 1, z: 0 }, { id: 'b', x: 5, z: 0 }, { id: 'c', x: 2, z: 0 }, { id: 'd', x: 3, z: 0 }, { id: 'e', x: 30, z: 0 }];
    expect(V.selectSpeakers({ x: 0, z: 0 }, sp, 3).map((s) => s.id)).toEqual(['a', 'c', 'd']);
    expect(V.selectSpeakers({ x: 0, z: 0 }, sp, 2).map((s) => s.id)).toEqual(['a', 'c']);
    expect(V.selectSpeakers({ x: 0, z: 0 }, [sp[4]], 3)).toEqual([]);
  });
});
