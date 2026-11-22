import { describe, it, expect } from 'vitest';
import { newSalon, addTension, tensionNow, onSalonTea, requestRace, cleanPresence, TENSION, SALON_TIMING, SHARED_EVENTS } from '../src/online/salon';
import { createRng } from '../src/games/common/rng';
import { Room, Out } from '../src/online/room';
import { PROTOCOL_VERSION, ServerMsg } from '../src/online/protocol';
import { PLAYER_SPEC } from '../src/characters/CharacterSpec';

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


const hello = (name: string, chaos: 'calm' | 'normal' | 'chaos' = 'normal') => ({ t: 'hello' as const, v: PROTOCOL_VERSION, name, spec: PLAYER_SPEC, chaos });
const to = (out: Out[], id: string, t: ServerMsg['t']) => out.filter((o) => o.to === id && o.msg.t === t).map((o) => o.msg);

describe('Ortak kahvehane (oda)', () => {
  it('konum: diğerlerine gider, sık gelen atlanır; dolaşmaya başlayınca koltuk "dolaşıyor" görünür; yeni gelen konumları alır', () => {
    const r = new Room('SALN', 1, 'okey', 'okey2');
    expect(r.view().table).toBe('okey2');
    const a = r.join(hello('Ali'), 0).player!;
    const b = r.join(hello('Veli'), 0).player!;
    const out = r.handle(a, { t: 'pos', x: 1, z: 2, yaw: 0, m: true, roam: true }, 1000);
    expect(to(out, b, 'pos')[0]).toMatchObject({ p: a, x: 1, z: 2, roam: true });
    expect(to(out, a, 'pos')).toEqual([]);
    expect((to(out, b, 'room')[0] as Extract<ServerMsg, { t: 'room' }>).room.seats[0].roam).toBe(true);
    expect(r.handle(a, { t: 'pos', x: 3, z: 2, yaw: 0, m: true, roam: true }, 1050)).toEqual([]);
    // konum mesajları hız sınırına sayılmaz
    for (let i = 0; i < 60; i++) r.handle(a, { t: 'pos', x: 1, z: 1, yaw: 0, m: true, roam: true }, 2000 + i * 200);
    expect(to(r.handle(a, { t: 'emote', id: 'wave' }, 20000), a, 'error')).toEqual([]);
    const c = r.join(hello('Can'), 21000);
    expect(to(c.out, c.player!, 'pos').length).toBe(1);
    expect(to(c.out, c.player!, 'tension').length).toBe(1);
    // geçersiz masa kimliği yok sayılır
    expect(new Room('XXXX', 1, 'kart', '../evil').view().table).toBe(undefined);
  });

  it('el kol hareketi, salonda çay, karşılıkla kavga, sakin moda saygı, gerginlik dolunca ortak olay', () => {
    const r = new Room('SALN', 1);
    const a = r.join(hello('Ali'), 0).player!;
    const b = r.join(hello('Veli'), 0).player!;
    const c = r.join(hello('Cem', 'calm'), 0).player!;
    expect(to(r.handle(a, { t: 'emote', id: 'nope' as 'wave' }, 0), a, 'error').length).toBe(1);
    const e = r.handle(a, { t: 'emote', id: 'bellyDance' }, 0);
    expect(to(e, b, 'emote')[0]).toEqual({ t: 'emote', p: a, id: 'bellyDance' });
    expect(to(e, b, 'tension').length).toBe(1);
    expect(to(r.handle(a, { t: 'salonTea', target: c }, 100), a, 'error').length).toBe(1);
    expect(to(r.handle(c, { t: 'salonTea', target: a }, 100), c, 'error').length).toBe(1);
    expect(to(r.handle(a, { t: 'salonTea', target: a }, 100), a, 'error').length).toBe(1);
    const t1 = r.handle(a, { t: 'salonTea', target: b }, 1000);
    expect(to(t1, c, 'salonTea')[0]).toEqual({ t: 'salonTea', from: a, to: b });
    expect(to(t1, c, 'brawl')).toEqual([]);
    const t2 = r.handle(b, { t: 'salonTea', target: a }, 3000);
    expect((to(t2, c, 'brawl')[0] as Extract<ServerMsg, { t: 'brawl' }>).ids.sort()).toEqual([a, b].sort());
    // gerginlik dolana kadar masa kaosu → ortak olay
    r.handle(a, { t: 'start' }, 4000);
    let ev = 0;
    for (let i = 0; i < 40 && !ev; i++) ev = to(r.handle(a, { t: 'chaos', kind: 'slam' }, 10000 + i * 3000), b, 'event').length;
    expect(ev).toBe(1);
  });

  it('maç gecesi: herkese aynı tohum ve başlama süresi; hemen tekrar istenemez', () => {
    const r = new Room('SALN', 1);
    const a = r.join(hello('Ali'), 0).player!;
    const b = r.join(hello('Veli'), 0).player!;
    const out = r.handle(a, { t: 'race' }, 5000);
    const ra = to(out, a, 'race')[0], rb = to(out, b, 'race')[0];
    expect(ra).toEqual(rb);
    expect(to(r.handle(b, { t: 'race' }, 6000), b, 'error').length).toBe(1);
    // geç gelen yaklaşan yarışı öğrenir
    const c = r.join(hello('Can'), 8000);
    expect((to(c.out, c.player!, 'race')[0] as Extract<ServerMsg, { t: 'race' }>).seed).toBe((ra as Extract<ServerMsg, { t: 'race' }>).seed);
  });
});
