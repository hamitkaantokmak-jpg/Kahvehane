import { describe, it, expect } from 'vitest';
import * as T from '../src/interactions/teaThrow';

const P = { tea: 5, brokenGlass: 10 };

describe('Çay fırlatma: ücret ve bekleme', () => {
  it('ücret: kırık bardak + çay; elde çay varsa yalnızca bardak', () => {
    const s = T.newThrowState();
    expect(T.throwCost(s, 'riza', P, false)).toBe(15);
    expect(T.throwCost(s, 'riza', P, true)).toBe(10);
  });
  it('aynı hedefe art arda atış zamlanır, üst sınırlı; süre geçince sıfırlanır', () => {
    const s = T.newThrowState();
    T.recordThrow(s, 'riza');
    expect(T.throwCost(s, 'riza', P, false)).toBe(20);
    T.recordThrow(s, 'riza');
    expect(T.throwCost(s, 'riza', P, false)).toBe(25);
    for (let i = 0; i < 10; i++) T.recordThrow(s, 'riza');
    expect(T.throwCost(s, 'riza', P, false)).toBe(15 + T.REPEAT_MAX);
    expect(T.throwCost(s, 'cemal', P, false)).toBe(15); // başka hedef etkilenmez
    T.updateThrows(s, T.REPEAT_WINDOW + 1);
    expect(T.throwCost(s, 'riza', P, false)).toBe(15);
  });
  it('bekleme süresi', () => {
    const s = T.newThrowState();
    expect(T.canThrow(s)).toBe(true);
    T.recordThrow(s, 'x');
    expect(T.canThrow(s)).toBe(false);
    T.updateThrows(s, T.THROW_COOLDOWN - 0.1);
    expect(T.canThrow(s)).toBe(false);
    T.updateThrows(s, 0.2);
    expect(T.canThrow(s)).toBe(true);
  });
});

describe('Çaylı yüz: leke süresi', () => {
  it('isabet süresi, yenileme ve üst sınır', () => {
    const st = T.newStain();
    expect(T.isStained(st)).toBe(false);
    T.splash(st);
    expect(st.remaining).toBe(T.STAIN_DURATION);
    T.updateStain(st, 10);
    T.splash(st); // 12 + 22 → sınır 30
    expect(st.remaining).toBe(T.STAIN_MAX);
    T.splash(st);
    expect(st.remaining).toBe(T.STAIN_MAX);
  });
  it('son saniyelerde solar ve biter; silinebilir', () => {
    const st = T.newStain();
    T.splash(st);
    expect(T.stainIntensity(st)).toBe(1);
    T.updateStain(st, T.STAIN_DURATION - T.STAIN_FADE / 2);
    expect(T.stainIntensity(st)).toBeCloseTo(0.5);
    T.updateStain(st, 100);
    expect(T.stainIntensity(st)).toBe(0);
    T.splash(st);
    T.wipe(st);
    expect(T.isStained(st)).toBe(false);
  });
});
