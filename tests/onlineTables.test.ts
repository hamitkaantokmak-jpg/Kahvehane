import { describe, it, expect } from 'vitest';
import { Room, Out } from '../src/online/room';
import { ONLINE_ENGINES, tavlaGame } from '../src/online/games';
import { PROTOCOL_VERSION, ServerMsg, OnlineGameId, DEFAULT_OPTIONS } from '../src/online/protocol';
import { rotateTavla, rotateOkey, rotateOkey101, actionToAbs } from '../src/online/rotate';
import { PLAYER_SPEC } from '../src/characters/CharacterSpec';
import { createRng } from '../src/games/common/rng';
import * as V from '../src/games/tavla/tavla';
import * as O from '../src/games/okey/okey';
import * as H from '../src/games/okey101/okey101';

const hello = (name: string) => ({ t: 'hello' as const, v: PROTOCOL_VERSION, name, spec: PLAYER_SPEC, chaos: 'normal' as const });
const msgsTo = (out: Out[], id: string, t?: ServerMsg['t']) => out.filter((o) => o.to === id && (!t || o.msg.t === t)).map((o) => o.msg);

/** İnsan sırasında motorun botuyla 'act' gönder, gerisini tick'le; sunucu hiçbir insan hamlesini reddetmemeli */
function playToEnd(room: Room, ids: Record<number, string>, maxSteps = 40000) {
  let now = 1000;
  const eng = ONLINE_ENGINES[room.d.game];
  const rng = createRng(5);
  for (let i = 0; i < maxSteps && room.d.phase === 'playing'; i++) {
    now += 400;
    if (room.d.handOverAt !== null) { for (const id of Object.values(ids)) room.handle(id, { t: 'next' }, now); continue; }
    const actor = eng.actor(room.d.state);
    if (actor !== null && ids[actor] !== undefined && now >= room.d.pauseUntil) {
      const out = room.handle(ids[actor], { t: 'act', a: eng.bot(room.d.state, actor, rng, 'medium') }, now);
      expect(msgsTo(out, ids[actor], 'error')).toEqual([]);
    } else room.tick(now);
  }
}

describe('Çevrimiçi okey, 101 ve tavla', () => {
  it('oda masa türüne bağlı: okey odasında kart oyunu seçilemez, tavla odası 2 kişilik', () => {
    const r = new Room('OKEY', 3, 'okey');
    expect(r.d.game).toBe('okey');
    const a = r.join(hello('Ali'), 0).player!;
    expect(msgsTo(r.handle(a, { t: 'config', game: 'batak', options: {} }, 0), a, 'error').length).toBe(1);
    expect(msgsTo(r.handle(a, { t: 'config', game: 'okey101', options: { okey101Hands: 1 } }, 0), a, 'error')).toEqual([]);
    expect(r.view().kind).toBe('okey');
    const t = new Room('TAVL', 3, 'tavla');
    t.join(hello('A'), 0); t.join(hello('B'), 0);
    expect(t.join(hello('C'), 0).player).toBe(null);
    expect(t.view().seats.length).toBe(2);
    // eski kayıt (masa türü yok) → kart
    const old = Room.from({ ...new Room('ESKI', 1).d, kind: undefined });
    expect(old.kind).toBe('kart');
  });

  for (const game of ['okey', 'okey101', 'tavla'] as OnlineGameId[]) {
    it(`${game}: iki arkadaş + müdavimler maç sonuna kadar oynar; gizli taşlar sızmaz`, () => {
      const kind = game === 'tavla' ? 'tavla' : 'okey';
      const r = new Room('ABCD', 9, kind);
      const a = r.join(hello('Ali'), 0).player!;
      const b = r.join(hello('Veli'), 0).player!;
      r.handle(a, { t: 'config', game, options: { okey101Hands: 1, tavlaTarget: 1 } }, 0);
      const out = r.handle(a, { t: 'start' }, 0);
      const st = msgsTo(out, b, 'state')[0] as Extract<ServerMsg, { t: 'state' }>;
      expect(st.seat).toBe(1);
      if (game !== 'tavla') {
        const v = st.view as O.OkeyState;
        const real = r.d.state as O.OkeyState;
        expect(v.hands[1].map((t) => t.id)).toEqual(real.hands[1].map((t) => t.id));
        for (const p of [0, 2, 3]) expect(v.hands[p].every((t) => t.id < 0 && t.num === 0)).toBe(true);
        expect(v.deck.every((t) => t.id < 0)).toBe(true);
        expect(v.deck.length).toBe(real.deck.length);
      }
      playToEnd(r, { 0: a, 1: b });
      expect(r.d.phase).toBe('lobby');
      expect(r.d.lastResult?.game).toBe(game);
    });
  }

  it('101 botu: yerden aldığını kullanamazsa geri koyup desteden çeker (oyun kilitlenmez)', () => {
    const s = H.newMatch101(createRng(4), { hands: 1 }, 0);
    // 0 numara attı, 1 yerden aldı ama kullanamıyor varsayalım: 'returnDraw'
    H.discard101(s, 0, s.hands[0][0].id);
    H.drawDiscard101(s, 1);
    const before = s.deck.length;
    ONLINE_ENGINES.okey101.apply(s, 1, { k: 'returnDraw' }, createRng(1));
    expect(s.takenDiscard).toBe(null);
    expect(s.deck.length).toBe(before - 1);
    expect(s.discards[0].length).toBe(1);
  });

  it('tavla: zarlar bitince sıra kendiliğinden geçer; geri alma tur başına döner; hamle yoksa "end"', () => {
    const s = tavlaGame.create(DEFAULT_OPTIONS, createRng(2));
    tavlaGame.apply(s, 0, { k: 'opening' }, createRng(3));
    const p = s.current;
    // zar at (sabit), bir hamle yap, geri al
    tavlaGame.apply(s, p, { k: 'roll' }, createRng(8));
    const snap = JSON.stringify(s.points);
    const m = V.legalMoves(s)[0];
    tavlaGame.apply(s, p, { k: 'move', from: m.from, to: m.to }, createRng(1));
    if (s.current === p && s.phase === 'move') {
      tavlaGame.apply(s, p, { k: 'undo' }, createRng(1));
      expect(JSON.stringify(s.points)).toBe(snap);
    }
    // tüm zarları oyna → sıra rakipte
    let guard = 0;
    while (s.current === p && s.phase === 'move' && guard++ < 10) {
      const a = tavlaGame.bot(s, p, createRng(1), 'medium');
      tavlaGame.apply(s, p, a, createRng(1));
    }
    expect(s.current).toBe(1 - p);
    expect(s.phase).toBe('roll');
    // görünümde geri alma kaydı yok
    expect('undo' in tavlaGame.view(s, 0)).toBe(false);
    // hamlesiz zar: 'end' bekler
    expect(() => tavlaGame.apply(s, p, { k: 'move', from: 0, to: 0 }, createRng(1))).toThrow();
  });

  it('tavla aynalama: koltuk 1 kendini beyaz görür; göreli hamle mutlak hamleye doğru çevrilir', () => {
    const s = V.newTavla();
    V.rollOpening(s, createRng(1));
    s.current = 1; s.phase = 'roll';
    V.roll(s, createRng(1), [6, 5]);
    const rel = rotateTavla(s, 1);
    expect(rel.points).toEqual(V.initialPoints());
    expect(rel.current).toBe(0);
    // göreli düzende yasal bir hamle, mutlak düzende de yasal olmalı
    const m = V.legalMoves(rel)[0];
    const abs = actionToAbs('tavla', { k: 'move', from: m.from, to: m.to }, 1) as { from: V.From; to: V.To };
    expect(V.legalMoves(s).some((x) => x.from === abs.from && x.to === abs.to)).toBe(true);
    expect(rotateTavla(s, 0)).toBe(s);
  });

  it('okey/101 döndürme: soldaki (bir önceki) oyuncu korunur, puanlar ve perler doğru koltukta', () => {
    const s = O.newMatch(createRng(3), 2);
    s.scores = [20, 19, 18, 17];
    const v = rotateOkey(s, 2);
    expect(v.current).toBe(0);
    expect(v.scores).toEqual([18, 17, 20, 19]);
    expect(v.hands[0]).toBe(s.hands[2]);
    const h = H.newMatch101(createRng(3), { hands: 1 }, 0);
    h.table = [{ id: 1, owner: 3, kind: 'run', tiles: [], slots: [] }];
    const hv = rotateOkey101(h, 3);
    expect(hv.table[0].owner).toBe(0);
    expect(hv.current).toBe(1);
  });
});
