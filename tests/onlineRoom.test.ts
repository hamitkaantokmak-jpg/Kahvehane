import { describe, it, expect } from 'vitest';
import { Room, TIMING, Out } from '../src/online/room';
import { ONLINE_ENGINES } from '../src/online/games';
import { PROTOCOL_VERSION, ServerMsg, OnlineGameId, makeCode, isCode, parseClientMsg } from '../src/online/protocol';
import { PLAYER_SPEC } from '../src/characters/CharacterSpec';
import { createRng } from '../src/games/common/rng';

const hello = (name: string, extra: Record<string, unknown> = {}) => ({ t: 'hello' as const, v: PROTOCOL_VERSION, name, spec: PLAYER_SPEC, chaos: 'normal' as const, ...extra });
const msgsTo = (out: Out[], id: string, t?: ServerMsg['t']) => out.filter((o) => o.to === id && (!t || o.msg.t === t)).map((o) => o.msg);
const lastState = (out: Out[], id: string) => msgsTo(out, id, 'state').slice(-1)[0] as Extract<ServerMsg, { t: 'state' }> | undefined;

/** Oyunu sonuna kadar oynat: insan sırasında motorun botuyla hamle seç (sunucuya 'act' olarak gönder), zaman ilerlet */
function playToEnd(room: Room, ids: Record<number, string>, t0: number, maxSteps = 20000) {
  let now = t0;
  const eng = ONLINE_ENGINES[room.d.game];
  const rng = createRng(11);
  for (let i = 0; i < maxSteps && room.d.phase === 'playing'; i++) {
    now += 400;
    if (room.d.handOverAt !== null) { for (const id of Object.values(ids)) room.handle(id, { t: 'next' }, now); continue; }
    const actor = eng.actor(room.d.state);
    if (actor !== null && ids[actor] !== undefined && now >= room.d.pauseUntil) {
      const a = eng.bot(room.d.state, actor, rng, 'medium');
      const out = room.handle(ids[actor], { t: 'act', a }, now);
      expect(msgsTo(out, ids[actor], 'error')).toEqual([]);
    } else room.tick(now);
  }
  return now;
}

describe('Çevrimiçi oda', () => {
  it('oda kodu: 4 harf, karışan harf yok; mesaj ayrıştırma kötü girdiye dayanıklı', () => {
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) { const c = makeCode(rng); expect(isCode(c)).toBe(true); expect(c).not.toMatch(/[IO01]/); }
    expect(parseClientMsg('{bozuk')).toBe(null);
    expect(parseClientMsg('x'.repeat(10000))).toBe(null);
    expect(parseClientMsg('{"a":1}')).toBe(null);
    expect(parseClientMsg('{"t":"ping"}')).toEqual({ t: 'ping' });
  });

  it('katılma: ilk gelen oda sahibi; adlar süzülür; 4 kişiden sonrası alınmaz; eski sürüm reddedilir', () => {
    const r = new Room('KAHV', 1);
    const a = r.join(hello('<b>Ali</b>'), 0);
    const b = r.join(hello('Veli'), 0);
    expect(r.d.host).toBe(a.player);
    const w = msgsTo(a.out, a.player!, 'welcome')[0] as Extract<ServerMsg, { t: 'welcome' }>;
    expect(w.seat).toBe(0);
    expect(w.room.seats[0].name).toBe('bAli/b');
    expect(r.player(b.player!)!.seat).toBe(1);
    r.join(hello('C'), 0); r.join(hello('D'), 0);
    expect(r.join(hello('E'), 0).player).toBe(null);
    expect(new Room('XXXX', 1).join({ ...hello('Z'), v: 999 }, 0).player).toBe(null);
  });

  it('yalnızca sahip seçer ve başlatır; herkes yalnızca kendi elini görür; maç sonuna kadar oynanır (batak, king, pişti)', () => {
    for (const game of ['batak', 'king', 'pisti4', 'pisti2'] as OnlineGameId[]) {
      const r = new Room('ABCD', 7);
      const a = r.join(hello('Ali'), 0).player!;
      const b = r.join(hello('Veli'), 0).player!;
      expect(msgsTo(r.handle(b, { t: 'config', game, options: {} }, 0), b, 'error').length).toBe(1);
      r.handle(a, { t: 'config', game, options: { batakHands: 3, kingShort: true, pistiTarget: 51 } }, 0);
      expect(msgsTo(r.handle(b, { t: 'start' }, 0), b, 'error').length).toBe(1);
      const out = r.handle(a, { t: 'start' }, 0);
      const sa = lastState(out, a)!, sb = lastState(out, b)!;
      expect(sa.seat).toBe(0);
      expect(sb.seat).toBe(1);
      const va = sa.view as { hands: { id: number; rank: number }[][] };
      expect(va.hands[0].every((c) => c.id >= 0 && c.rank > 0)).toBe(true); // kendi eli açık
      expect(va.hands[1].every((c) => c.id < 0 && c.rank === 0)).toBe(true); // başkasınınki kapalı
      if (game.startsWith('pisti')) {
        const v = sa.view as { deck: { rank: number }[]; pile: { rank: number }[]; hiddenCount: number };
        expect(v.deck.every((c) => c.rank === 0)).toBe(true);
        expect(v.pile.slice(0, v.hiddenCount).every((c) => c.rank === 0)).toBe(true);
      }
      playToEnd(r, { 0: a, 1: b }, 0);
      expect(r.d.phase).toBe('lobby');
      expect(r.d.lastResult?.game).toBe(game);
      expect(r.d.lastResult!.winners.length).toBeGreaterThan(0);
    }
  });

  it('sıra kontrolü ve geçersiz hamle; el toplanırken bekletir', () => {
    const r = new Room('ABCD', 3);
    const a = r.join(hello('Ali'), 0).player!;
    r.join(hello('Veli'), 0);
    r.handle(a, { t: 'start' }, 0); // batak: dağıtan 3 → ilk söz 0 (Ali)
    const v = r.handle(a, { t: 'act', a: { k: 'play', id: 5 } }, 10);
    expect(msgsTo(v, a, 'error').length).toBe(1);
    expect(msgsTo(r.handle(a, { t: 'act', a: { k: 'bid', b: 4 } }, 10), a, 'error').length).toBe(1); // 5'ten az
    expect(msgsTo(r.handle(a, { t: 'act', a: { k: 'bid', b: 6 } }, 10), a, 'error')).toEqual([]);
    expect(msgsTo(r.handle(a, { t: 'act', a: { k: 'bid', b: 7 } }, 10), a, 'error').length).toBe(1); // sıra Veli'de
  });

  it('bağlantısı kopanın yerine bot oynar; token ile geri dönen koltuğuna oturur', () => {
    const r = new Room('ABCD', 5);
    const j = r.join(hello('Ali'), 0);
    const a = j.player!;
    const token = (msgsTo(j.out, a, 'welcome')[0] as Extract<ServerMsg, { t: 'welcome' }>).token;
    r.handle(a, { t: 'start' }, 0);
    r.disconnect(a, 100);
    // kopukken sıra ondaysa bekleme süresinden önce bot oynamaz, sonra oynar
    expect(r.tick(100 + TIMING.disconnectGrace - 1)).toEqual([]);
    r.tick(100 + TIMING.disconnectGrace + TIMING.botDelay);
    expect(r.d.seq).toBeGreaterThan(1);
    const back = r.join(hello('Ali', { token }), 20000);
    expect(back.player).toBe(a);
    expect(r.player(a)!.seat).toBe(0);
    expect(lastState(back.out, a)).toBeDefined();
  });

  it('oynamayan insanın yerine 60 sn sonra bot oynar', () => {
    const r = new Room('ABCD', 6);
    const a = r.join(hello('Ali'), 0).player!;
    r.handle(a, { t: 'start' }, 0);
    expect(r.tick(TIMING.idleTakeover - 10)).toEqual([]);
    expect(r.tick(TIMING.idleTakeover + 10).length).toBeGreaterThan(0);
    expect(r.nextWake(0)).not.toBe(null);
  });

  it('kaos: bekleme süresi, sakine çay atılmaz, sakin olan çay atamaz, masa devirme maçta bir kez, susturma, söz listesi', () => {
    const r = new Room('ABCD', 8);
    const a = r.join(hello('Ali'), 0).player!;
    const b = r.join(hello('Veli', { chaos: 'calm' }), 0).player!;
    const c = r.join(hello('Can', { chaos: 'chaos' }), 0).player!;
    r.handle(a, { t: 'start' }, 0);
    expect(msgsTo(r.handle(a, { t: 'chaos', kind: 'tea', target: 1 }, 1000), a, 'error')[0]).toMatchObject({ msg: expect.stringContaining('sakin') });
    expect(msgsTo(r.handle(b, { t: 'chaos', kind: 'tea', target: 0 }, 1000), b, 'error').length).toBe(1);
    const ok = r.handle(a, { t: 'chaos', kind: 'tea', target: 2 }, 5000);
    expect(msgsTo(ok, c, 'chaos')).toEqual([{ t: 'chaos', from: 0, kind: 'tea', target: 2 }]);
    expect(msgsTo(r.handle(a, { t: 'chaos', kind: 'slam' }, 5100), a, 'error').length).toBe(1); // bekleme
    expect(msgsTo(r.handle(a, { t: 'chaos', kind: 'tea', target: 2 }, 9000), a, 'error').length).toBe(1); // aynı hedefe sık
    expect(msgsTo(r.handle(a, { t: 'chaos', kind: 'flip' }, 20000), a, 'chaos').length).toBe(1);
    expect(msgsTo(r.handle(a, { t: 'chaos', kind: 'flip' }, 30000), a, 'error').length).toBe(1); // bir kez
    r.handle(c, { t: 'mute', player: a, on: true }, 30000);
    const t = r.handle(a, { t: 'chaos', kind: 'taunt', phrase: 2 }, 40000);
    expect(msgsTo(t, c, 'chaos')).toEqual([]); // susturdu
    expect(msgsTo(t, b, 'chaos').length).toBe(1);
    expect(msgsTo(r.handle(a, { t: 'chaos', kind: 'taunt', phrase: 99 }, 50000), a, 'error').length).toBe(1);
    expect(msgsTo(r.handle(a, { t: 'chaos', kind: 'objection', target: 0 }, 60000), a, 'error').length).toBe(1); // kendine olmaz
  });

  it('mesaj seli sınırlanır', () => {
    const r = new Room('ABCD', 9);
    const a = r.join(hello('Ali'), 0).player!;
    let errs = 0;
    for (let i = 0; i < 40; i++) errs += msgsTo(r.handle(a, { t: 'ping' }, 100), a, 'error').length;
    expect(errs).toBeGreaterThan(0);
  });

  it('oda durumu JSON olarak kaydedilip geri yüklenince kaldığı yerden devam eder', () => {
    const r = new Room('ABCD', 10);
    const a = r.join(hello('Ali'), 0).player!;
    const b = r.join(hello('Veli'), 0).player!;
    r.handle(a, { t: 'config', game: 'king', options: { kingShort: true } }, 0);
    r.handle(a, { t: 'start' }, 0);
    const now = 5000;
    r.tick(now);
    const copy = Room.from(JSON.parse(JSON.stringify(r.toJSON())));
    expect(copy.view()).toEqual(r.view());
    playToEnd(copy, { 0: a, 1: b }, now);
    expect(copy.d.phase).toBe('lobby');
    expect(copy.d.lastResult?.game).toBe('king');
  });
});
