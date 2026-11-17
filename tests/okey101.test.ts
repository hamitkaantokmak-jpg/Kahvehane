import { describe, it, expect } from 'vitest';
import { createRng } from '../src/games/common/rng';
import * as K from '../src/games/okey101/okey101';
import { decideDraw101, planTurn101 } from '../src/games/okey101/okey101Bot';
import { Tile, TileColor } from '../src/games/common/tiles';

let nid = 7000;
const T = (color: number, num: number): Tile => ({ id: nid++, color: color as TileColor, num, fake: false });
const ids = (ts: Tile[]) => ts.map((t) => t.id);

function setup(hand0: Tile[], others?: Tile[][]): K.Okey101State {
  const s = K.newMatch101(createRng(42), { hands: 3 }, 0);
  s.ctx = { okeyColor: 3, okeyNum: 7 }; // siyah 7 okey
  s.hands[0] = hand0;
  if (others) others.forEach((h, i) => (s.hands[i + 1] = h));
  return s;
}

describe('101 Okey', () => {
  it('dağıtım: başlayan 22, diğerleri 21', () => {
    const s = K.newMatch101(createRng(1), { hands: 5 }, 1);
    expect(s.hands.map((h) => h.length)).toEqual([21, 22, 21, 21]);
    expect(s.deck.length).toBe(105 - 85);
    expect(s.current).toBe(1);
    expect(s.phase).toBe('play');
  });

  it('101 altı açma reddedilir, 101 ve üstü kabul edilir', () => {
    const a = [T(0, 11), T(0, 12), T(0, 13)]; // 36
    const b = [T(1, 10), T(2, 10), T(3, 10)]; // 30
    const c = [T(2, 3), T(2, 4), T(2, 5)]; // 12
    const d = [T(0, 9), T(1, 9), T(2, 9)]; // 27
    const filler = [T(1, 1), T(1, 3)];
    const s = setup([...a, ...b, ...c, ...filler]);
    expect(() => K.open101(s, 0, 'melds', [ids(a), ids(b), ids(c)])).toThrow(/101/);
    const s2 = setup([...a, ...b, ...c, ...d, ...filler]);
    expect(K.open101(s2, 0, 'melds', [ids(a), ids(b), ids(c), ids(d)])).toBe(105);
    expect(s2.opened[0]).toBe('melds');
    expect(s2.table.length).toBe(4);
    expect(s2.hands[0].length).toBe(2);
  });

  it('geçersiz per ve 13-1 bağlantısı reddedilir', () => {
    const bad = [T(0, 12), T(0, 13), T(0, 1)];
    const s = setup([...bad, T(1, 1)]);
    expect(() => K.open101(s, 0, 'melds', [ids(bad)])).toThrow(/Geçersiz/);
  });

  it('okey değer kazanır', () => {
    const a = [T(0, 12), T(0, 13), T(3, 7)]; // okey → 11: 36
    expect(K.checkMeld(a, { okeyColor: 3, okeyNum: 7 })?.value).toBe(36);
  });

  it('çift açma: en az 5 çift', () => {
    const pairs = [[T(0, 1), T(0, 1)], [T(1, 2), T(1, 2)], [T(2, 3), T(2, 3)], [T(3, 4), T(3, 4)]];
    const s = setup([...pairs.flat(), T(0, 5), T(3, 7), T(1, 9)]);
    expect(() => K.open101(s, 0, 'pairs', pairs.map(ids))).toThrow(/5/);
    const five = [...pairs, [s.hands[0][8], s.hands[0][9]]]; // 5 + okey
    K.open101(s, 0, 'pairs', five.map(ids));
    expect(s.opened[0]).toBe('pairs');
    expect(s.hands[0].length).toBe(1);
    // çiftle açan seri seremez
    const s2 = setup([...pairs.flat(), T(0, 5), T(0, 5), T(2, 9), T(2, 10), T(2, 11), T(1, 1)]);
    K.open101(s2, 0, 'pairs', [...pairs, [s2.hands[0][8], s2.hands[0][9]]].map(ids));
    expect(() => K.layMeld101(s2, 0, ids(s2.hands[0].slice(0, 3)))).toThrow(/çift/);
  });

  it('açmadan işleme yapılamaz; açtıktan sonra uçlara işlenir', () => {
    const a = [T(0, 11), T(0, 12), T(0, 13)];
    const b = [T(1, 10), T(2, 10), T(3, 10)];
    const d = [T(0, 9), T(1, 9), T(2, 9)];
    const ten = T(0, 10);
    const nineBlack = T(3, 9);
    const e = [T(1, 3), T(1, 4), T(1, 5)];
    const s = setup([...a, ...b, ...d, ...e, ten, nineBlack, T(1, 1), T(2, 2)]);
    expect(() => K.addToMeld101(s, 0, ten.id, 1)).toThrow(/açmalısın/);
    K.open101(s, 0, 'melds', [ids(a), ids(b), ids(d), ids(e)]);
    const runId = s.table[0].id;
    K.addToMeld101(s, 0, ten.id, runId);
    expect(s.table[0].tiles.length).toBe(4);
    expect(s.table[0].slots[0].num).toBe(10);
    const groupId = s.table[2].id;
    K.addToMeld101(s, 0, nineBlack.id, groupId);
    expect(s.table[2].tiles.length).toBe(4);
    expect(() => K.addToMeld101(s, 0, s.hands[0][0].id, runId)).toThrow();
  });

  it('işlek taş ve okey atma cezası', () => {
    const a = [T(0, 11), T(0, 12), T(0, 13)];
    const b = [T(1, 10), T(2, 10), T(3, 10)];
    const d = [T(0, 9), T(1, 9), T(2, 9), T(3, 9)];
    const ten = T(0, 10);
    const s = setup([...a, ...b, ...d, ten, T(1, 1), T(2, 2)]);
    K.open101(s, 0, 'melds', [ids(a), ids(b), ids(d)]);
    expect(K.discardPenalty(s, 0, ten.id)).toBe(101);
    K.discard101(s, 0, ten.id);
    expect(s.penalties[0]).toBe(101);
    expect(s.current).toBe(1);
  });

  it('yerden alınan taş kullanılmadan atış yapılamaz, geri konabilir', () => {
    const s = setup([T(0, 1), T(1, 2), T(2, 3)]);
    K.discard101(s, 0, s.hands[0][0].id);
    expect(s.phase).toBe('draw');
    K.drawDiscard101(s, 1);
    expect(K.canDiscard101(s, 1)).toMatch(/açmalısın/);
    expect(() => K.discard101(s, 1, s.hands[1][0].id)).toThrow();
    K.returnDiscard101(s, 1);
    expect(s.phase).toBe('draw');
    expect(s.discards[0].length).toBe(1);
    K.drawDeck101(s, 1);
    expect(K.canDiscard101(s, 1)).toBeNull();
  });

  it('bitiş puanlaması: kazanan -101, açmamış +202, açmış el toplamı', () => {
    const a = [T(0, 11), T(0, 12), T(0, 13)];
    const b = [T(1, 10), T(2, 10), T(3, 10)];
    const d = [T(0, 9), T(1, 9), T(2, 9), T(3, 9)];
    const last = T(1, 1);
    const s = setup([...a, ...b, ...d, last], [[T(0, 5), T(1, 6)], [T(0, 2)], [T(2, 2)]]);
    s.opened[1] = 'melds';
    s.opened[2] = 'pairs';
    s.openedBeforeTurn = true; // önceden açmış say (elden değil)
    s.opened[0] = 'melds';
    K.layMeld101(s, 0, ids(a)); K.layMeld101(s, 0, ids(b)); K.layMeld101(s, 0, ids(d));
    const r = K.discard101(s, 0, last.id);
    expect(r.finished).toBe(true);
    expect(s.result!.points).toEqual([-101, 11, 4, 202]);
    expect(s.totals).toEqual([-101, 11, 4, 202]);
  });

  it('elden bitme ve okeyle bitme çarpanları', () => {
    const a = [T(0, 11), T(0, 12), T(0, 13)];
    const b = [T(1, 10), T(2, 10), T(3, 10)];
    const d = [T(0, 9), T(1, 9), T(2, 9), T(3, 9)];
    const okey = T(3, 7);
    const s = setup([...a, ...b, ...d, okey], [[T(0, 5)], [T(0, 2)], [T(2, 2)]]);
    K.open101(s, 0, 'melds', [ids(a), ids(b), ids(d)]);
    K.discard101(s, 0, okey.id);
    expect(s.result!.elden).toBe(true);
    expect(s.result!.okeyFinish).toBe(true);
    expect(s.result!.points[0]).toBe(-404);
    expect(s.result!.points[1]).toBe(808);
    expect(s.penalties[0]).toBe(0);
  });

  it('seri maç biter ve en düşük toplam kazanır; yeni el sıfırlanır', () => {
    const s = K.newMatch101(createRng(3), { hands: 2 }, 0);
    s.phase = 'ended'; s.totals = [10, -50, 30, 0];
    s.result = { winner: 1, elden: false, okeyFinish: false, points: [0, 0, 0, 0] };
    K.nextHand101(s, createRng(4));
    expect(s.handNo).toBe(2);
    expect(s.table.length).toBe(0);
    expect(s.starter).toBe(1);
    expect(s.hands[1].length).toBe(22);
    expect(K.matchWinner101(s)).toBe(1);
  });

  it('botlar tam el boyunca yalnızca geçerli hamle yapar', () => {
    let finished = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const rng = createRng(seed * 13);
      const s = K.newMatch101(rng, { hands: 1 }, seed % 4);
      let guard = 0;
      while (s.phase !== 'ended' && guard++ < 300) {
        const p = s.current;
        if (s.phase === 'draw') {
          const d = decideDraw101(K.view101(s, p));
          if (d === 'discard') K.drawDiscard101(s, p); else K.drawDeck101(s, p);
        }
        let plan = planTurn101(K.view101(s, p), rng);
        if (plan.length === 0) {
          K.returnDiscard101(s, p); K.drawDeck101(s, p);
          plan = planTurn101(K.view101(s, p), rng);
        }
        for (const a of plan) {
          if (a.type === 'open') K.open101(s, p, a.mode, a.groups);
          else if (a.type === 'lay') K.layMeld101(s, p, a.ids);
          else if (a.type === 'add') K.addToMeld101(s, p, a.tileId, a.meldId);
          else K.discard101(s, p, a.tileId);
        }
        const total = s.hands.flat().length + s.deck.length + s.discards.flat().length + s.table.flatMap((m) => m.tiles).length + 1;
        expect(total).toBe(106);
      }
      expect(s.phase).toBe('ended');
      if (s.result?.winner !== null || s.opened.some((o) => o !== 'none')) finished++;
      expect(s.penalties.every((x) => x === 0)).toBe(true);
    }
    expect(finished).toBeGreaterThan(3); // botlar el açabiliyor
  }, 120000);
});
