import { describe, it, expect } from 'vitest';
import { newSalon, addTension, tensionNow, onSalonTea, requestRace, cleanPresence, TENSION, SALON_TIMING, SHARED_EVENTS } from '../src/online/salon';
import { createRng } from '../src/games/common/rng';

describe('Ortak kahvehane (saf kurallar)', () => {
  it('konum: sayı olmayan reddedilir, sınır dışı kırpılır', () => {
    expect(cleanPresence({ x: NaN, z: 0, yaw: 0 })).toBe(null);
    expect(cleanPresence({ x: '1' as unknown as number, z: 0, yaw: 0 })).toBe(null);
    const p = cleanPresence({ x: 999, z: -999, yaw: 7, m: true, roam: true })!;
    expect(p.x).toBe(9);
    expect(p.z).toBe(-7);
    expect(Math.abs(p.yaw)).toBeLessThanOrEqual(Math.PI);
  });

  it('gerginlik birikir, zamanla söner; dolunca ortak olay çıkar ve çubuk düşer', () => {
    const s = newSalon();
    const rng = createRng(3);
    expect(addTension(s, 'tea', 0, rng).value).toBe(10);
    expect(tensionNow(s, 4000)).toBeCloseTo(10 - 4 * TENSION.decayPerSec);
    let ev = null;
    for (let i = 0; i < 20 && !ev; i++) ev = addTension(s, 'flip', 5000, rng).event;
    expect(SHARED_EVENTS).toContain(ev);
    expect(tensionNow(s, 5000)).toBe(TENSION.resetTo);
    expect(addTension(s, 'bilinmeyen', 5000, rng).value).toBe(TENSION.resetTo);
  });

  it('çaya karşılık kavga başlatır; üçüncü kişi çay atınca kavgaya katılır (zincir); süre dolunca biter', () => {
    const s = newSalon();
    expect(onSalonTea(s, 'a', 'b', 0)).toBe(null);
    expect(onSalonTea(s, 'c', 'd', 100)).toBe(null);
    expect(onSalonTea(s, 'b', 'a', 2000)?.sort()).toEqual(['a', 'b']);
    expect(onSalonTea(s, 'c', 'a', 3000)?.sort()).toEqual(['a', 'b', 'c']);
    // geç kalan karşılık kavga başlatmaz
    const t = newSalon();
    onSalonTea(t, 'a', 'b', 0);
    expect(onSalonTea(t, 'b', 'a', SALON_TIMING.retaliate + 1)).toBe(null);
    // kavga bittikten sonra ilgisiz çay yeni kavga değildir
    expect(onSalonTea(s, 'x', 'a', 3000 + SALON_TIMING.brawlDuration + 1)).toBe(null);
  });

  it('maç gecesi: herkes aynı tohumla aynı yarışı izler; çok sık istenemez', () => {
    const s = newSalon();
    const rng = createRng(9);
    const r = requestRace(s, 1000, rng)!;
    expect(r.startAt).toBe(1000 + SALON_TIMING.raceLead);
    expect(requestRace(s, 5000, rng)).toBe(null);
    expect(requestRace(s, 1000 + SALON_TIMING.raceGap + 1, rng)?.seed).not.toBe(undefined);
  });
});
