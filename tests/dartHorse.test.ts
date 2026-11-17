import { describe, it, expect } from 'vitest';
import * as D from '../src/games/dart/dart';
import { chooseTarget, botThrow, DART_SKILLS } from '../src/games/dart/dartBot';
import * as A from '../src/games/atyarisi/atyarisi';
import { createRng } from '../src/games/common/rng';

const H = (base: number, mult: 0 | 1 | 2 | 3): D.Hit => ({ base, mult, score: base * mult, label: '', offBoard: mult === 0 });

describe('Dart: tahta puanı', () => {
  it('dilim, halka ve boğa', () => {
    expect(D.scoreAt(0, 0).score).toBe(50);
    expect(D.scoreAt(0, 0.06).score).toBe(25);
    expect(D.scoreAt(0, 0.6)).toMatchObject({ base: 20, mult: 3, score: 60 });
    expect(D.scoreAt(0, 0.97)).toMatchObject({ base: 20, mult: 2, score: 40 });
    expect(D.scoreAt(0, 0.4)).toMatchObject({ base: 20, mult: 1 });
    expect(D.scoreAt(0.4, 0)).toMatchObject({ base: 6 }); // sağ: 6
    expect(D.scoreAt(-0.4, 0)).toMatchObject({ base: 11 }); // sol: 11
    expect(D.scoreAt(0, -0.4)).toMatchObject({ base: 3 }); // alt: 3
    expect(D.scoreAt(1.2, 0)).toMatchObject({ score: 0, offBoard: true });
    for (const s of D.SECTORS) for (const r of ['single', 'treble', 'double'] as const) {
      const p = D.aimPoint(s, r);
      const h = D.scoreAt(p.x, p.y);
      expect(h.base).toBe(s);
      expect(h.mult).toBe(r === 'single' ? 1 : r === 'treble' ? 3 : 2);
    }
  });
});

describe('Dart: X01 kuralları', () => {
  it('puan düşer, 3 okta tur değişir', () => {
    const s = D.newDart({ start: 301, doubleOut: true, teams: false });
    D.throwDart(s, H(20, 3));
    D.throwDart(s, H(20, 1));
    expect(s.current).toBe(0);
    const r = D.throwDart(s, H(5, 1));
    expect(r.turnEnded).toBe(true);
    expect(s.remaining[0]).toBe(301 - 85);
    expect(s.current).toBe(1);
  });
  it('bust: negatif, 1 (çiftle bitişte) ve çift olmayan bitiş; tur puanı geri alınır', () => {
    const s = D.newDart({ start: 301, doubleOut: true, teams: false });
    s.remaining[0] = 40; s.turnStart = 40;
    D.throwDart(s, H(10, 1)); // 30
    const r = D.throwDart(s, H(20, 2)); // -10 → bust
    expect(r.bust).toBe(true);
    expect(s.remaining[0]).toBe(40);
    expect(s.current).toBe(1);
    const s2 = D.newDart({ start: 301, doubleOut: true, teams: false });
    s2.remaining[0] = 21; s2.turnStart = 21;
    expect(D.throwDart(s2, H(20, 1)).bust).toBe(true); // 1'e iniş
    const s3 = D.newDart({ start: 301, doubleOut: true, teams: false });
    s3.remaining[0] = 20; s3.turnStart = 20;
    expect(D.throwDart(s3, H(20, 1)).bust).toBe(true); // tekliyle 0
    const s4 = D.newDart({ start: 301, doubleOut: false, teams: false });
    s4.remaining[0] = 21; s4.turnStart = 21;
    expect(D.throwDart(s4, H(20, 1)).bust).toBe(false); // çiftle bitiş kapalıyken 1 serbest
    expect(D.throwDart(s4, H(1, 1)).checkout).toBe(true);
  });
  it('çiftle bitirme ve boğayla bitirme', () => {
    const s = D.newDart({ start: 501, doubleOut: true, teams: false });
    s.remaining[0] = 40;
    const r = D.throwDart(s, H(20, 2));
    expect(r.checkout).toBe(true);
    expect(s.winner).toBe(0);
    expect(() => D.throwDart(s, H(1, 1))).toThrow();
    const s2 = D.newDart({ start: 501, doubleOut: true, teams: false });
    s2.remaining[0] = 50;
    expect(D.throwDart(s2, D.scoreAt(0, 0)).checkout).toBe(true);
  });
  it('takımlar: 4 oyuncu, takım puanı ortak, sıra 0-1-2-3', () => {
    const s = D.newDart({ start: 301, doubleOut: false, teams: true });
    expect(s.players).toBe(4);
    for (let k = 0; k < 3; k++) D.throwDart(s, H(20, 1));
    for (let k = 0; k < 3; k++) D.throwDart(s, H(1, 1));
    for (let k = 0; k < 3; k++) D.throwDart(s, H(20, 1)); // oyuncu 2 → takım 0
    expect(s.remaining).toEqual([301 - 120, 301 - 3]);
    expect(s.current).toBe(3);
  });
  it('bot hedef seçimi ve geçerli atışlarla oyun biter', () => {
    expect(chooseTarget({ me: 0, myRemaining: 32, dartsLeft: 3, doubleOut: true }, DART_SKILLS.riza)).toMatchObject({ sector: 16, ring: 'double' });
    expect(chooseTarget({ me: 0, myRemaining: 50, dartsLeft: 3, doubleOut: true }, DART_SKILLS.riza).ring).toBe('bull');
    expect(chooseTarget({ me: 0, myRemaining: 301, dartsLeft: 3, doubleOut: true }, DART_SKILLS.cemal)).toMatchObject({ sector: 20, ring: 'treble' });
    const rng = createRng(3);
    const s = D.newDart({ start: 301, doubleOut: true, teams: false });
    let guard = 0;
    while (s.winner === null && guard++ < 3000) {
      const skill = s.current === 0 ? DART_SKILLS.riza : DART_SKILLS.cemal;
      const t = botThrow(D.viewDart(s, s.current), skill, rng);
      D.throwDart(s, D.scoreAt(t.point.x, t.point.y));
    }
    expect(s.winner).not.toBe(null);
  });
  it('isabetli bot (Rıza), sapan bota (Cemal) göre ortalama daha çok T20 civarı vurur', () => {
    const avg = (skill: typeof DART_SKILLS.riza) => {
      const rng = createRng(9);
      let sum = 0;
      for (let i = 0; i < 2000; i++) { const t = botThrow({ me: 0, myRemaining: 501, dartsLeft: 3, doubleOut: true }, { ...skill, bold: 1 }, rng); sum += D.scoreAt(t.point.x, t.point.y).score; }
      return sum / 2000;
    };
    expect(avg(DART_SKILLS.riza)).toBeGreaterThan(avg(DART_SKILLS.cemal));
  });
});

describe('At yarışı', () => {
  it('aynı seed → aynı atlar, oranlar ve sonuç', () => {
    const f1 = A.makeField(1234), f2 = A.makeField(1234);
    expect(f1).toEqual(f2);
    expect(A.runRace(1234, f1)).toEqual(A.runRace(1234, f2));
    expect(f1.length).toBe(A.RACE_HORSES);
    expect(new Set(f1.map((h) => h.name)).size).toBe(A.RACE_HORSES);
  });
  it('oranlar olasılıklarla tutarlı: güçlü atın oranı düşük', () => {
    const f = A.makeField(7);
    const strongest = [...f].sort((a, b) => b.strength - a.strength)[0];
    const weakest = [...f].sort((a, b) => a.strength - b.strength)[0];
    expect(strongest.odds).toBeLessThan(weakest.odds);
    expect(f.every((h) => h.odds >= 1.3)).toBe(true);
    const p = A.winProbabilities(f);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
  it('sonuç tutarlı: sıra sürelere göre, kontrol noktaları monoton ve 1\'de biter', () => {
    const f = A.makeField(55);
    const r = A.runRace(55, f);
    for (let i = 1; i < r.order.length; i++) expect(r.times[r.order[i]]).toBeGreaterThanOrEqual(r.times[r.order[i - 1]]);
    for (const pts of r.checkpoints) { for (let k = 1; k < pts.length; k++) expect(pts[k]).toBeGreaterThanOrEqual(pts[k - 1]); }
    expect(A.positionAt(r, r.order[0], r.times[r.order[0]] + 0.01)).toBeCloseTo(1, 1);
    expect(A.positionAt(r, 0, r.duration)).toBe(1);
  });
  it('güçlü atlar uzun vadede daha sık kazanır (simülasyon)', () => {
    let favWins = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const f = A.makeField(seed);
      const fav = [...f].sort((a, b) => a.odds - b.odds)[0].id;
      if (A.runRace(seed, f).order[0] === fav) favWins++;
    }
    expect(favWins / 400).toBeGreaterThan(1 / A.RACE_HORSES);
  });
  it('ödeme: kazanan bahis × oran (aşağı yuvarlanır), kaybeden 0', () => {
    const f = A.makeField(3);
    const r = A.runRace(3, f);
    const w = r.order[0], l = r.order[5];
    const p = A.payouts([{ who: 'player', horse: w, amount: 10 }, { who: 'cemal', horse: l, amount: 20 }], f, r);
    expect(p[0]).toEqual({ who: 'player', win: true, amount: Math.floor(10 * f[w].odds) });
    expect(p[1]).toEqual({ who: 'cemal', win: false, amount: 0 });
  });
  it('zamanlayıcı aşamaları ve foto finiş tanımı', () => {
    const s = A.newSchedule(1, 5);
    const rng = createRng(1);
    expect(A.tickSchedule(s, 4, 20, rng)).toBe(null);
    expect(A.tickSchedule(s, 1, 20, rng)).toBe('betting');
    expect(s.raceNo).toBe(1);
    expect(A.tickSchedule(s, A.SCHEDULE.betting, 20, rng)).toBe('running');
    expect(A.tickSchedule(s, 21, 20, rng)).toBe('results');
    expect(A.tickSchedule(s, A.SCHEDULE.results, 20, rng)).toBe('idle');
    let photo = 0;
    for (let seed = 1; seed <= 300; seed++) if (A.runRace(seed, A.makeField(seed)).photoFinish) photo++;
    expect(photo).toBeGreaterThan(0);
  });
});
