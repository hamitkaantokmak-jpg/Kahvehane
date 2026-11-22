import { describe, it, expect } from 'vitest';
import { Room, Out } from '../src/online/room';
import { PROTOCOL_VERSION, ServerMsg } from '../src/online/protocol';
import { PLAYER_SPEC } from '../src/characters/CharacterSpec';
import { YANCI, revealedCount, botCatchAt, peekTargetOf } from '../src/online/yanci';
import { createRng } from '../src/games/common/rng';
import type { OkeyState } from '../src/games/okey/okey';

const hello = (name: string) => ({ t: 'hello' as const, v: PROTOCOL_VERSION, name, spec: PLAYER_SPEC, chaos: 'normal' as const });
const to = <T extends ServerMsg['t']>(out: Out[], id: string, t: T) => out.filter((o) => o.to === id && o.msg.t === t).map((o) => o.msg as Extract<ServerMsg, { t: T }>);

/** Okey odası: Ali 0, Veli 1, Can (koltuksuz) Ali'nin yancısı → Veli'nin eline bakabilir */
function setup(veliHuman = true) {
  const r = new Room('YNCI', 5, 'okey', 'okey2');
  const ali = r.join(hello('Ali'), 0).player!;
  const veli = veliHuman ? r.join(hello('Veli'), 0).player! : null;
  const can = r.join(hello('Can'), 0).player!;
  // Can 2. koltuğa oturmuştu; yancı olunca koltuğu boşalır
  const out = r.handle(can, { t: 'yanci', seat: 0 }, 0);
  expect(to(out, can, 'error')).toEqual([]);
  r.handle(ali, { t: 'start' }, 100);
  return { r, ali, veli, can };
}

describe('Yancı modu: saf kurallar', () => {
  it('sağdaki oyuncu, taşlar zamanla açılır, müdavim üstel sürede fark eder', () => {
    expect(peekTargetOf(3, 4)).toBe(0);
    expect(revealedCount(0, 0, 14)).toBe(1);
    expect(revealedCount(0, YANCI.revealEvery * 5, 14)).toBe(6);
    expect(revealedCount(0, 1e9, 14)).toBe(14);
    const rng = createRng(2);
    let caught = 0;
    for (let i = 0; i < 400; i++) if (botCatchAt(0, rng, 'hard') !== null) caught++;
    // zor müdavim 5 sn içinde çoğunlukla fark eder (1 - e^-2.5 ≈ %92)
    expect(caught / 400).toBeGreaterThan(0.85);
  });
});

describe('Yancı modu: oda', () => {
  it('yancı sahibinin elini görür, işaret yalnızca sahibine gider; yancılık yalnızca okey masasında ve koltuk başına bir', () => {
    const { r, ali, veli, can } = setup();
    expect(r.view().watchers).toEqual([expect.objectContaining({ player: can, yanci: 0 })]);
    const st = to(r.handle(ali, { t: 'ping' }, 200), can, 'state');
    expect(st).toEqual([]);
    // oyun başlarken yancıya da sahibinin gözünden durum gitti
    const real = r.d.state as OkeyState;
    const j = r.join({ ...hello('Can'), token: r.player(can)!.token }, 300);
    const s = to(j.out, can, 'state')[0];
    expect(s.yanci).toBe(true);
    expect(s.seat).toBe(0);
    expect((s.view as OkeyState).hands[0].map((t) => t.id)).toEqual(real.hands[0].map((t) => t.id));
    expect((s.view as OkeyState).hands[1].every((t) => t.id < 0)).toBe(true);
    // işaret
    const pt = r.handle(can, { t: 'point', id: real.hands[0][0].id }, 400);
    expect(to(pt, ali, 'point')[0]).toEqual({ t: 'point', id: real.hands[0][0].id, from: can });
    expect(to(pt, veli!, 'point')).toEqual([]);
    // ikinci yancı aynı koltuğa olamaz
    const d = r.join(hello('Dur'), 500).player!;
    expect(to(r.handle(d, { t: 'yanci', seat: 0 }, 500), d, 'error').length).toBe(1);
    // kart masasında yancı yok
    const k = new Room('KART', 1, 'kart');
    const x = k.join(hello('X'), 0).player!;
    expect(to(k.handle(x, { t: 'yanci', seat: 1 }, 0), x, 'error').length).toBe(1);
  });

  it('gizlice bakış: taşlar yavaş yavaş görünür, herkes eğildiğini görür, bakılana 1 sn sonra 👀, süre dolunca biter', () => {
    const { r, ali, veli, can } = setup();
    const real = r.d.state as OkeyState;
    const o = r.handle(can, { t: 'peek', on: true }, 1000);
    expect(to(o, ali, 'lean')[0]).toEqual({ t: 'lean', p: can, on: true });
    const v0 = to(o, can, 'peekView')[0];
    expect(v0.seat).toBe(1);
    expect(v0.tiles.length).toBe(1);
    expect(v0.total).toBe(real.hands[1].length);
    expect(r.nextWake(1000)).toBeLessThanOrEqual(1000 + YANCI.revealEvery);
    let cue = 0, seen = 0;
    for (let t = 1100; t <= 1000 + YANCI.maxPeek + 100; t += 100) {
      const out = r.tick(t);
      cue += to(out, veli!, 'peekCue').filter((m) => m.on).length;
      const pv = to(out, can, 'peekView').slice(-1)[0];
      if (pv) seen = pv.tiles.length;
      // Veli'ye taş gitmez
      expect(to(out, veli!, 'peekView')).toEqual([]);
      if (t === 1900) expect(cue).toBe(0);
    }
    expect(cue).toBe(1);
    expect(seen).toBeGreaterThan(10);
    expect(r.player(can)!.peek).toBe(null);
    // hemen yeniden bakamaz
    expect(to(r.handle(can, { t: 'peek', on: true }, 1000 + YANCI.maxPeek + 500), can, 'error').length).toBe(1);
  });

  it('tokat: bakarken (ya da hemen sonra) yakalar ve o el bir daha bakamaz; boşa tokat bekletir', () => {
    const { r, ali, veli, can } = setup();
    // boşa tokat
    const miss = r.handle(veli!, { t: 'catch' }, 1000);
    expect(to(miss, ali, 'slap')[0]).toEqual({ t: 'slap', by: 1, yanci: can, ok: false });
    expect(to(r.handle(veli!, { t: 'catch' }, 2000), veli!, 'error').length).toBe(1);
    // bakış bittikten hemen sonra da yakalanır
    r.handle(can, { t: 'peek', on: true }, 20_000);
    r.handle(can, { t: 'peek', on: false }, 21_000);
    const hit = r.handle(veli!, { t: 'catch' }, 21_000 + YANCI.grace - 100);
    expect(to(hit, ali, 'slap')[0]).toEqual({ t: 'slap', by: 1, yanci: can, ok: true });
    expect(to(r.handle(can, { t: 'peek', on: true }, 40_000), can, 'error')[0].msg).toContain('yakalandın');
    // Ali'nin kendine (yancısı ona bakmıyor) tokat hakkı yok
    expect(to(r.handle(ali, { t: 'catch' }, 41_000), ali, 'error').length).toBe(1);
  });

  it('bakılan müdavimse kendisi fark edip tokat atar (zor müdavim çoğunlukla yakalar)', () => {
    let caught = 0;
    for (let k = 0; k < 20; k++) {
      const r = new Room('YNCI', 100 + k, 'okey');
      const ali = r.join(hello('Ali'), 0).player!;
      const can = r.join(hello('Can'), 0).player!;
      r.handle(can, { t: 'yanci', seat: 0 }, 0);
      r.handle(ali, { t: 'config', game: 'okey', options: { difficulty: 'hard' } }, 0);
      r.handle(ali, { t: 'start' }, 0);
      r.handle(can, { t: 'peek', on: true }, 10);
      for (let t = 100; t < 6000; t += 100) if (to(r.tick(t), ali, 'slap').some((m) => m.ok)) { caught++; break; }
    }
    expect(caught).toBeGreaterThan(14);
  });
});
