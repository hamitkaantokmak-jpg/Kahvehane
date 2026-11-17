import { describe, it, expect } from 'vitest';
import { createRng } from '../src/games/common/rng';
import * as O from '../src/games/okey/okey';
import { decideOkey } from '../src/games/okey/okeyBot';
import { Tile, TileColor } from '../src/games/common/tiles';

let nid = 5000;
const T = (color: number, num: number): Tile => ({ id: nid++, color: color as TileColor, num, fake: false });

describe('Klasik Okey', () => {
  it('dağıtım: başlayan 15, diğerleri 14, deste 48', () => {
    const s = O.newMatch(createRng(1), 2);
    expect(s.hands.map((h) => h.length)).toEqual([14, 14, 15, 14]);
    expect(s.deck.length).toBe(48);
    expect(s.current).toBe(2);
    expect(s.phase).toBe('discard');
    const all = new Set([...s.hands.flat(), ...s.deck, s.indicator].map((t) => t.id));
    expect(all.size).toBe(106);
  });
  it('sıra yönetimi ve geçersiz hamleler', () => {
    const s = O.newMatch(createRng(2), 0);
    expect(() => O.drawFromDeck(s, 0)).toThrow();
    expect(() => O.discard(s, 1, s.hands[1][0].id)).toThrow();
    const t = s.hands[0][0];
    O.discard(s, 0, t.id);
    expect(s.current).toBe(1);
    expect(s.phase).toBe('draw');
    expect(() => O.discard(s, 1, s.hands[1][0].id)).toThrow();
    // 1 numaralı oyuncu 0'ın attığını alabilir
    expect(O.canTakeDiscard(s, 1)).toBe(true);
    const taken = O.drawFromDiscard(s, 1);
    expect(taken.id).toBe(t.id);
    expect(s.hands[1].length).toBe(15);
    expect(() => O.drawFromDeck(s, 1)).toThrow();
  });
  it('bitiş ve puanlama (normal / okey / çift)', () => {
    const s = O.newMatch(createRng(3), 0);
    s.ctx = { okeyColor: 3, okeyNum: 7 };
    const melds = [T(0, 1), T(0, 2), T(0, 3), T(1, 5), T(2, 5), T(3, 5), T(2, 10), T(2, 11), T(2, 12), T(2, 13), T(0, 9), T(1, 9), T(2, 9), T(3, 9)];
    const extra = T(1, 1);
    s.hands[0] = [...melds, extra];
    expect(O.canFinishWith(s, 0, melds[0].id)).toBeNull();
    expect(() => O.finish(s, 0, melds[0].id)).toThrow();
    const r = O.finish(s, 0, extra.id);
    expect(r.kind).toBe('normal');
    expect(s.scores).toEqual([20, 18, 18, 18]);
    expect(s.phase).toBe('ended');

    const s2 = O.newMatch(createRng(4), 0);
    s2.ctx = { okeyColor: 3, okeyNum: 7 };
    const okeyTile = T(3, 7);
    s2.hands[0] = [...melds, okeyTile];
    expect(O.finish(s2, 0, okeyTile.id).kind).toBe('okey');
    expect(s2.scores).toEqual([20, 16, 16, 16]);

    const s3 = O.newMatch(createRng(5), 0);
    s3.ctx = { okeyColor: 3, okeyNum: 7 };
    const pairs = [T(0, 1), T(0, 1), T(1, 2), T(1, 2), T(2, 3), T(2, 3), T(3, 4), T(3, 4), T(0, 5), T(0, 5), T(1, 6), T(1, 6), T(2, 8), T(2, 8)];
    const ok2 = T(3, 7);
    s3.hands[0] = [...pairs, ok2];
    expect(O.finish(s3, 0, ok2.id).kind).toBe('pairsOkey');
    expect(s3.scores).toEqual([20, 12, 12, 12]);
  });
  it('gösterge gösterme', () => {
    const s = O.newMatch(createRng(6), 0);
    const ind = s.indicator;
    s.hands[1].push({ ...ind, id: 9999 });
    expect(O.canShowIndicator(s, 1)).toBe(true);
    O.showIndicator(s, 1);
    expect(s.scores).toEqual([19, 20, 19, 19]);
    expect(O.canShowIndicator(s, 1)).toBe(false);
  });
  it('maç sonu ve yeni el sıfırlaması', () => {
    const s = O.newMatch(createRng(7), 0);
    s.scores = [2, 20, 20, 20];
    s.ctx = { okeyColor: 3, okeyNum: 7 };
    const melds = [T(0, 1), T(0, 2), T(0, 3), T(1, 5), T(2, 5), T(3, 5), T(2, 10), T(2, 11), T(2, 12), T(2, 13), T(0, 9), T(1, 9), T(2, 9), T(3, 9)];
    const extra = T(1, 1);
    s.hands[1] = [...melds, extra];
    s.current = 1; s.phase = 'discard';
    O.finish(s, 1, extra.id);
    expect(s.matchOver).toBe(true);
    expect(O.matchWinner(s)).toBe(1);
    const s2 = O.newMatch(createRng(8), 0);
    O.discard(s2, 0, s2.hands[0][0].id);
    s2.phase = 'ended'; s2.result = { winner: 3, kind: 'normal', deductions: [2, 2, 2, 0] };
    O.nextHand(s2, createRng(9));
    expect(s2.starter).toBe(3);
    expect(s2.hands[3].length).toBe(15);
    expect(s2.discards.flat().length).toBe(0);
    expect(s2.handNo).toBe(2);
  });
  it('botlar sadece geçerli hamle yapar ve el sonlanır', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const rng = createRng(seed);
      const s = O.newMatch(rng, seed % 4);
      let guard = 0;
      while (s.phase !== 'ended' && guard++ < 400) {
        const p = s.current;
        const a = decideOkey(O.viewFor(s, p), rng);
        if (a.type === 'drawDeck') O.drawFromDeck(s, p);
        else if (a.type === 'drawDiscard') O.drawFromDiscard(s, p);
        else if (a.type === 'discard') O.discard(s, p, a.tileId);
        else O.finish(s, p, a.tileId);
        const total = s.hands.flat().length + s.deck.length + s.discards.flat().length + 1 + (s.result?.finishTile ? 1 : 0);
        expect(total).toBe(106);
      }
      expect(s.phase).toBe('ended');
    }
  }, 60000);
  it('bot görünümü gizli bilgi içermez', () => {
    const s = O.newMatch(createRng(10), 0);
    const v = O.viewFor(s, 1) as unknown as Record<string, unknown>;
    expect(v.hands).toBeUndefined();
    expect(v.deck).toBeUndefined();
    expect((v.hand as Tile[]).length).toBe(14);
  });
});
