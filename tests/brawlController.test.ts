import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { Character } from '../src/characters/Character';
import { NPC_SPECS, PLAYER_SPEC } from '../src/characters/CharacterSpec';
import { NPC, NpcWorld } from '../src/npc/NPC';
import { PERSONALITIES } from '../src/npc/personalities';
import { BrawlController } from '../src/npc/BrawlController';
import { ChaosDirector } from '../src/chaos/ChaosDirector';
import { createRng } from '../src/games/common/rng';

function makeWorld(seed = 1, without: string[] = []) {
  const player = new Character(PLAYER_SPEC);
  const npcs: NPC[] = [];
  const nav = { findPath: (_sx: number, _sz: number, tx: number, tz: number) => [{ x: tx, z: tz }] };
  const fx = { stars() {}, puff() {}, symbol() {}, impactText() {} };
  const world = {
    kahve: { allSeats: () => [], benchSeats: [], collision: { blocked: () => false }, counterServePos: new THREE.Vector3(-3, 0, 0), tvViewPos: new THREE.Vector3(0, 0, -3) },
    nav, effects: fx, player, npcs, teaRequests: [], reservedTable: null,
  } as unknown as NpcWorld;
  // herkes kavga noktasına yakın dursun
  NPC_SPECS.filter((sp) => !without.includes(sp.id)).forEach((spec, i) => {
    const c = new Character(spec);
    c.pos.set((i % 4) * 0.8, 0, Math.floor(i / 4) * 0.8);
    const n = new NPC(c, PERSONALITIES[spec.id], world);
    n.mode = 'wander';
    npcs.push(n);
  });
  player.pos.set(0.5, 0, 1.5);
  const chaos = new ChaosDirector(createRng(seed));
  const bonks: string[] = [];
  const toasts: string[] = [];
  const ctl = new BrawlController(world, chaos, createRng(seed), { playerBonked: (by) => bonks.push(by.id), toast: (m) => toasts.push(m) });
  world.onTension = (s) => chaos.add(s);
  world.requestBrawl = (a, b) => ctl.start(a, b);
  const step = (sec: number, dt = 0.05) => {
    for (let t = 0; t < sec; t += dt) {
      for (const n of npcs) n.update(dt);
      for (const c of [player, ...npcs.map((n) => n.c)]) c.update(dt);
      chaos.update(dt);
      ctl.update(dt);
      vi.advanceTimersByTime(dt * 1000);
    }
  };
  return { world, npcs, player, chaos, ctl, bonks, toasts, step, byId: (id: string) => npcs.find((n) => n.id === id)! };
}

afterEach(() => vi.useRealTimers());

describe('Kavga davranış katmanı', () => {
  it('Rıza Dayı ilk şaplakta kavga başlatır, çevre taraf tutar, kavga söner ve herkes normale döner', () => {
    vi.useFakeTimers();
    const w = makeWorld(5, ['sukru']); // yatıştırma ayrı testte; burada vuruşlar sınanır
    const riza = w.byId('riza');
    riza.onBonked(w.player);
    expect(w.ctl.active).toBe(true);
    expect(riza.inBrawl).toBe(true);
    expect(w.chaos.tension).toBeGreaterThan(15);
    const b = w.ctl.brawl!;
    expect(b.state.a).toBe('riza');
    expect(b.state.b).toBe('player');
    // en az bir yakın NPC bir rol aldı
    expect(b.state.participants.length).toBeGreaterThan(2);
    w.step(20);
    expect(w.ctl.active).toBe(false);
    expect(w.ctl.history.length).toBe(1);
    // oyuncu en az bir kez vuruldu (Rıza ya da dostları)
    expect(w.bonks.length).toBeGreaterThan(0);
    for (const n of w.npcs) expect(n.inBrawl).toBe(false);
  });

  it('sakin karakter ilk şaplakta kavga başlatmaz, ikincide başlatır', () => {
    vi.useFakeTimers();
    const w = makeWorld(2);
    const nihat = w.byId('nihat');
    nihat.onBonked(w.player);
    expect(w.ctl.active).toBe(false);
    nihat.onBonked(w.player);
    expect(w.ctl.active).toBe(true);
  });

  it('gerginlik eşiği aşılınca Şükrü gelip kavgayı yatıştırır ve gerginlik düşer', () => {
    vi.useFakeTimers();
    const w = makeWorld(9);
    w.chaos.add(60);
    w.ctl.start('riza', 'cemal');
    const before = w.chaos.tension;
    w.step(8);
    expect(w.ctl.history[0]?.reason).toBe('calmed');
    expect(w.chaos.tension).toBeLessThan(before);
    expect(w.toasts.some((t) => t.includes('Şükrü'))).toBe(true);
  });

  it('Şükrü kavgaya taraf olarak katılmaz', () => {
    vi.useFakeTimers();
    for (const seed of [1, 2, 3, 4, 5]) {
      const w = makeWorld(seed);
      w.byId('riza').onBonked(w.player);
      expect(w.ctl.brawl!.has('sukru')).toBe(false);
    }
  });

  it('aynı anda tek kavga; Şükrü kavga tarafı olamaz', () => {
    vi.useFakeTimers();
    const w = makeWorld(3);
    expect(w.ctl.start('riza', 'cemal')).toBe(true);
    expect(w.ctl.start('kemal', 'ferhat')).toBe(false);
    const w2 = makeWorld(3);
    expect(w2.ctl.start('sukru', 'cemal')).toBe(false);
  });
});

describe('Kişilik verisi', () => {
  it('her NPC için yeni replik kategorileri dolu ve ilişkiler geçerli kimliklere işaret ediyor', () => {
    const ids = Object.keys(PERSONALITIES);
    for (const p of Object.values(PERSONALITIES)) {
      for (const k of ['brawlJoin', 'brawlBreakUp', 'calmDown', 'brawlFlee', 'debtTease', 'betRaise', 'teaSplashed', 'teaSeen'] as const) {
        expect(p.lines[k].length, `${p.id}.${k}`).toBeGreaterThanOrEqual(2);
        expect(new Set(p.lines[k]).size).toBe(p.lines[k].length);
      }
      for (const f of [...p.friends, ...p.rivals]) expect(ids).toContain(f);
      expect(p.friends.filter((f) => p.rivals.includes(f))).toEqual([]);
    }
    expect(PERSONALITIES.nihat.rivals).toEqual([]);
    expect(PERSONALITIES.riza.rivals).toContain('cemal');
  });
});

describe('Çay siparişi kaybolmaz', () => {
  it('Şükrü servis sırasında kavgaya çağrılırsa oyuncunun siparişi kuyruğa geri döner', () => {
    vi.useFakeTimers();
    const w = makeWorld(4);
    const s = w.byId('sukru');
    (w.world.teaRequests as unknown[]).push(w.player);
    s.mode = 'serve';
    (s as unknown as { serveStage: number; timer: number }).serveStage = 1;
    (s as unknown as { timer: number }).timer = 0;
    s.update(0.1); // siparişi alır, tepsiyle yola çıkar
    expect(w.world.teaRequests.length).toBe(0);
    s.enterBrawl('separator');
    expect(w.world.teaRequests[0]).toBe(w.player);
  });
});
