import { describe, it, expect } from 'vitest';
import { Tile, TileColor, OkeyCtx, validateMeld, toCounts, canPartitionAll, isSevenPairs, createTileSet, shuffledWithIndicator, bestPartition, isPair } from '../src/games/common/tiles';
import { createRng } from '../src/games/common/rng';

let nid = 1000;
export const T = (color: number, num: number): Tile => ({ id: nid++, color: color as TileColor, num, fake: false });
export const FAKE = (): Tile => ({ id: nid++, color: 0, num: 0, fake: true });
const ctx: OkeyCtx = { okeyColor: 3, okeyNum: 7 }; // siyah 7 okey
const J = () => T(3, 7);
const WRAP = { allowWrap: true };
const NOWRAP = { allowWrap: false };

describe('taş seti', () => {
  it('106 taş, 2 sahte okey', () => {
    const s = createTileSet();
    expect(s.length).toBe(106);
    expect(s.filter((t) => t.fake).length).toBe(2);
    expect(new Set(s.map((t) => t.id)).size).toBe(106);
  });
  it('gösterge sahte okey olamaz, okey bir üstüdür (13→1)', () => {
    for (let seed = 1; seed < 200; seed++) {
      const { indicator, ctx, tiles } = shuffledWithIndicator(createRng(seed));
      expect(indicator.fake).toBe(false);
      expect(tiles.length).toBe(105);
      expect(ctx.okeyColor).toBe(indicator.color);
      expect(ctx.okeyNum).toBe(indicator.num === 13 ? 1 : indicator.num + 1);
    }
  });
});

describe('per doğrulama', () => {
  it('geçerli seri', () => {
    const m = validateMeld([T(0, 3), T(0, 4), T(0, 5)], ctx, WRAP);
    expect(m?.kind).toBe('run');
    expect(m?.value).toBe(12);
  });
  it('renk karışık seri geçersiz', () => {
    expect(validateMeld([T(0, 3), T(1, 4), T(0, 5)], ctx, WRAP)).toBeNull();
  });
  it('boşluklu seri geçersiz, okeyle geçerli', () => {
    expect(validateMeld([T(0, 3), T(0, 5), T(0, 6)], ctx, WRAP)).toBeNull();
    const m = validateMeld([T(0, 3), J(), T(0, 5), T(0, 6)], ctx, WRAP);
    expect(m?.kind).toBe('run');
    expect(m?.value).toBe(18);
  });
  it('12-13-1 klasikte geçerli, 101de geçersiz; 13-1-2 her zaman geçersiz', () => {
    expect(validateMeld([T(1, 12), T(1, 13), T(1, 1)], ctx, WRAP)?.kind).toBe('run');
    expect(validateMeld([T(1, 12), T(1, 13), T(1, 1)], ctx, NOWRAP)).toBeNull();
    expect(validateMeld([T(1, 13), T(1, 1), T(1, 2)], ctx, WRAP)).toBeNull();
  });
  it('grup: farklı renk aynı sayı', () => {
    expect(validateMeld([T(0, 9), T(1, 9), T(2, 9)], ctx, WRAP)?.kind).toBe('group');
    expect(validateMeld([T(0, 9), T(1, 9), T(2, 9), T(3, 9)], ctx, WRAP)?.value).toBe(36);
    expect(validateMeld([T(0, 9), T(0, 9), T(2, 9)], ctx, WRAP)).toBeNull();
    expect(validateMeld([T(0, 9), T(1, 9), T(2, 9), T(3, 9), J()], ctx, WRAP)).toBeNull();
  });
  it('okeyli grup ve seri değeri en yüksek yerleşimle', () => {
    expect(validateMeld([T(0, 9), T(1, 9), J()], ctx, WRAP)?.value).toBe(27);
    // 5,6,J → 5-6-7 (18) tercih edilir
    expect(validateMeld([T(2, 5), T(2, 6), J()], ctx, NOWRAP)?.value).toBe(18);
    // 12,13,J → 101'de 11-12-13 (36)
    expect(validateMeld([T(2, 12), T(2, 13), J()], ctx, NOWRAP)?.value).toBe(36);
  });
  it('sahte okey okeyin yerine geçer (siyah 7)', () => {
    expect(validateMeld([T(3, 5), T(3, 6), FAKE()], ctx, WRAP)?.kind).toBe('run');
    expect(validateMeld([T(0, 7), T(1, 7), FAKE()], ctx, WRAP)?.kind).toBe('group');
    expect(validateMeld([T(0, 5), T(0, 6), FAKE()], ctx, WRAP)).toBeNull();
  });
  it('çift', () => {
    expect(isPair(T(0, 4), T(0, 4), ctx)).toBe(true);
    expect(isPair(T(0, 4), T(1, 4), ctx)).toBe(false);
    expect(isPair(T(0, 4), J(), ctx)).toBe(true);
  });
});

describe('el çözümleyici', () => {
  const part = (tiles: Tile[]) => { const { counts, jokers } = toCounts(tiles, ctx); return canPartitionAll(counts, jokers, WRAP); };
  it('14 taş perlere bölünür', () => {
    const hand = [T(0, 1), T(0, 2), T(0, 3), T(1, 5), T(2, 5), T(3, 5), T(2, 10), T(2, 11), T(2, 12), T(2, 13), T(0, 9), T(1, 9), T(2, 9), T(3, 9)];
    expect(part(hand)).toBe(true);
  });
  it('bir taş fazla/eksik bölünmez', () => {
    const hand = [T(0, 1), T(0, 2), T(0, 3), T(1, 5), T(2, 5), T(3, 5), T(2, 10), T(2, 11), T(2, 12), T(2, 13), T(0, 9), T(1, 9), T(2, 9), T(3, 1)];
    expect(part(hand)).toBe(false);
  });
  it('okey boşluğu doldurur', () => {
    const hand = [T(0, 1), J(), T(0, 3), T(1, 5), T(2, 5), T(3, 5), T(2, 10), T(2, 11), T(2, 12), T(2, 13), T(0, 9), T(1, 9), T(2, 9), J()];
    expect(part(hand)).toBe(true);
  });
  it('12-13-1 ile bitiş', () => {
    const hand = [T(0, 12), T(0, 13), T(0, 1), T(1, 5), T(2, 5), T(3, 5), T(2, 10), T(2, 11), T(2, 12), T(2, 13), T(0, 9), T(1, 9), T(2, 9), T(3, 9)];
    expect(part(hand)).toBe(true);
  });
  it('7 çift', () => {
    const hand = [T(0, 1), T(0, 1), T(1, 2), T(1, 2), T(2, 3), T(2, 3), T(3, 4), T(3, 4), T(0, 5), T(0, 5), T(1, 6), T(1, 6), T(2, 8), J()];
    const { counts, jokers } = toCounts(hand, ctx);
    expect(isSevenPairs(counts, jokers)).toBe(true);
    hand[13] = T(2, 9);
    const c2 = toCounts(hand, ctx);
    expect(isSevenPairs(c2.counts, c2.jokers)).toBe(false);
  });
  it('bestPartition açma değeri hesaplar', () => {
    const hand = [T(0, 11), T(0, 12), T(0, 13), T(1, 10), T(2, 10), T(3, 10), T(1, 1)];
    const { counts, jokers } = toCounts(hand, ctx);
    const r = bestPartition(counts, jokers, NOWRAP, (m) => m.value);
    expect(r.score).toBe(36 + 30);
  });
});
