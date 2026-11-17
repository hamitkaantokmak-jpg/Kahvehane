import { describe, it, expect } from 'vitest';
import * as R from '../src/chaos/eventRules';
import { DEFAULT_EVENTS, TENSION_POINTS, ChaosRegistry } from '../src/chaos/events';
import { ChaosDirector } from '../src/chaos/ChaosDirector';
import { createRng } from '../src/games/common/rng';

describe('Aşama 5 olay kuralları', () => {
  it('masa devirme yalnızca çok sinirli, okeyi kaybeden karakterde', () => {
    expect(R.shouldFlipTable({ temper: 0.9, lostMatch: true, game: 'okey', anger: 0.5 }, 0.5)).toBe(true);
    expect(R.shouldFlipTable({ temper: 0.9, lostMatch: true, game: 'okey', anger: 0 }, 0.5)).toBe(false);
    expect(R.shouldFlipTable({ temper: 0.9, lostMatch: false, game: 'okey', anger: 1 }, 0)).toBe(false);
    expect(R.shouldFlipTable({ temper: 0.6, lostMatch: true, game: 'okey', anger: 1 }, 0)).toBe(false);
    expect(R.shouldFlipTable({ temper: 0.9, lostMatch: true, game: 'tavla', anger: 1 }, 0)).toBe(false);
  });
  it('itiraz cevabı mizaca göre ve gerginlik ekler', () => {
    expect(R.objectionOutcome(0.9, 0.1).reply).toBe('angry');
    expect(R.objectionOutcome(0.2, 0.5).reply).toBe('deny');
    expect(R.objectionOutcome(0.2, 0.9).reply).toBe('mock');
    expect(R.objectionOutcome(0.9, 0.1).tension).toBeGreaterThan(R.objectionOutcome(0.2, 0.9).tension);
  });
  it('tekrar etmeyen seçici: art arda tekrar yok, liste tükenmeden tekrar yok, deterministik', () => {
    const items = ['a', 'b', 'c', 'd'];
    const p = new R.NoRepeatPicker(items, createRng(5));
    const seq = Array.from({ length: 40 }, () => p.next());
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
    for (let k = 0; k < 40; k += 4) expect(new Set(seq.slice(k, k + 4)).size).toBe(4);
    const q = new R.NoRepeatPicker(items, createRng(5));
    expect(Array.from({ length: 40 }, () => q.next())).toEqual(seq);
  });
  it('gol anında bardak devrilmesi mesafeye bağlı', () => {
    expect(R.glassTips(10, 0)).toBe(false);
    expect(R.glassTips(1, 0.4)).toBe(true);
    expect(R.glassTips(5.5, 0.4)).toBe(false);
  });
  it('elektrik kesintisi ışık eğrisi: söner, loş kalır, geri gelir', () => {
    const d = R.DURATIONS.powerCut;
    expect(R.powerLightFactor(0, d)).toBeCloseTo(1);
    expect(R.powerLightFactor(5, d)).toBeLessThan(0.25);
    expect(R.powerLightFactor(d, d)).toBeCloseTo(1);
  });
  it('olay kayıtları: her olayın puanı, bekleme süresi ve gerginlik aralığı tanımlı', () => {
    const ids = DEFAULT_EVENTS.map((e) => e.id);
    for (const id of ['brawl', 'tvGoal', 'powerCut', 'cat', 'tableFlip', 'objection', 'kibitz'] as const) expect(ids).toContain(id);
    for (const e of DEFAULT_EVENTS) {
      expect(e.cooldown).toBeGreaterThan(0);
      expect(e.minTension).toBeLessThanOrEqual(e.maxTension);
      expect(e.tension).toBeGreaterThanOrEqual(0);
    }
    expect(TENSION_POINTS.tableFlip).toBe(25);
    expect(TENSION_POINTS.cat).toBe(15);
    expect(new ChaosRegistry().get('cat')!.tension).toBe(TENSION_POINTS.cat);
  });
  it('tetiklenen (rastgele seçilmeyen) olaylar ağırlıksızdır: direktör kendiliğinden seçmez', () => {
    const d = new ChaosDirector(createRng(1));
    d.available = new Set(['tableFlip', 'objection', 'kibitz']);
    d.state.tension = 60;
    for (let i = 0; i < 50; i++) expect(d.pick()).toBe(null);
    // tetiklenince bekleme ve puan işlenir
    const before = d.tension;
    d.trigger('tableFlip');
    expect(d.tension).toBeGreaterThan(before);
    expect(d.state.cooldowns.tableFlip).toBeGreaterThan(0);
  });
  it('kibitz aralığı', () => {
    const r = createRng(2);
    for (let i = 0; i < 20; i++) { const v = R.nextKibitzDelay(r); expect(v).toBeGreaterThanOrEqual(9); expect(v).toBeLessThan(18); }
  });
});
