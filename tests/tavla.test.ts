import { describe, it, expect } from 'vitest';
import * as V from '../src/games/tavla/tavla';
import { chooseSequence } from '../src/games/tavla/tavlaBot';
import { createRng } from '../src/games/common/rng';

function emptyState(): V.TavlaState {
  const s = V.newTavla({ target: 5, katmerliMars: true });
  s.points = Array(24).fill(0);
  s.phase = 'roll';
  s.current = 0;
  return s;
}

describe('Tavla', () => {
  it('başlangıç dizilimi 15 er pul', () => {
    const s = V.newTavla();
    expect(V.totalCheckers(s, 0)).toBe(15);
    expect(V.totalCheckers(s, 1)).toBe(15);
    expect(V.pipCount(s, 0)).toBe(167);
    expect(V.pipCount(s, 1)).toBe(167);
  });
  it('açılış zarı eşit olamaz, büyük atan başlar', () => {
    for (let i = 1; i < 50; i++) {
      const s = V.newTavla();
      const [a, b] = V.rollOpening(s, createRng(i));
      expect(a).not.toBe(b);
      expect(s.current).toBe(a > b ? 0 : 1);
      expect(s.phase).toBe('roll');
    }
  });
  it('kapalı haneye gidilemez', () => {
    const s = V.newTavla();
    s.phase = 'roll'; s.current = 0;
    V.roll(s, undefined, [6, 5]);
    // 24 (index 23) - 5 = index 18: rakibin 5 pulu → kapalı
    expect(V.legalMoves(s).some((m) => m.from === 23 && m.to === 18)).toBe(false);
    expect(() => V.move(s, 23, 18)).toThrow();
    // 24-6 = index 17 açık
    expect(V.legalMoves(s).some((m) => m.from === 23 && m.to === 17)).toBe(true);
  });
  it('çift zar 4 hamle', () => {
    const s = V.newTavla();
    s.phase = 'roll'; s.current = 0;
    V.roll(s, undefined, [3, 3]);
    expect(s.remaining).toEqual([3, 3, 3, 3]);
    for (let i = 0; i < 4; i++) V.move(s, V.legalMoves(s)[0].from, V.legalMoves(s)[0].to);
    expect(s.remaining.length).toBe(0);
    V.endTurn(s);
    expect(s.current).toBe(1);
  });
  it('pul kırma ve bar → önce bardan giriş zorunlu', () => {
    const s = emptyState();
    s.points[10] = 1; s.points[7] = -1; s.points[20] = -14;
    V.roll(s, undefined, [3, 1]);
    const hit = V.move(s, 10, 7);
    expect(hit.hit).toBe(true);
    expect(s.bar[1]).toBe(1);
    expect(s.points[7]).toBe(1);
    V.move(s, 7, 6);
    V.endTurn(s);
    V.roll(s, undefined, [2, 5]);
    const lm = V.legalMoves(s);
    expect(lm.every((m) => m.from === 'bar')).toBe(true);
    // oyuncu 1 giriş: zar 2 → index 1, zar 5 → index 4
    expect(lm.map((m) => m.to).sort()).toEqual([1, 4]);
  });
  it('bar girişi kapalıysa hamle yok', () => {
    const s = emptyState();
    s.current = 1; s.bar[1] = 1;
    for (let i = 0; i < 6; i++) s.points[i] = 2;
    s.points[23] = 3;
    s.points[10] = -14;
    V.roll(s, undefined, [4, 2]);
    expect(V.legalMoves(s)).toEqual([]);
    V.endTurn(s);
    expect(s.current).toBe(0);
  });
  it('iki zar oynanabiliyorsa ikisi de oynanmalı', () => {
    const s = emptyState();
    // tek pul index 8; 6 sonra 1 → mümkün. 1 oynanınca 6 bloklanıyorsa yine de 6+1 dizisi zorunlu
    s.points[8] = 1; s.points[1] = -2; s.points[23] = -13;
    V.roll(s, undefined, [6, 1]);
    // önce 1: 8→7, sonra 6: 7→1 kapalı → tek zar; önce 6: 8→2, sonra 1: 2→1 kapalı... 
    // her iki sıralama da tek hamle: büyük zar oynanmalı
    const lm = V.legalMoves(s);
    expect(lm.every((m) => m.die === 6)).toBe(true);
  });
  it('toplama (pul çıkarma) kuralları', () => {
    const s = emptyState();
    s.points[2] = 2; s.points[0] = 13; s.points[23] = -15;
    V.roll(s, undefined, [6, 3]);
    const lm = V.legalMoves(s);
    // 6 ile en gerideki (index 2, mesafe 3) toplanır; 3 ile tam toplanır
    expect(lm.some((m) => m.from === 2 && m.to === 'off')).toBe(true);
    expect(lm.some((m) => m.from === 0 && m.to === 'off')).toBe(false); // daha geride pul var
  });
  it('evde olmayan pul varken toplama yok', () => {
    const s = emptyState();
    s.points[7] = 1; s.points[0] = 14; s.points[23] = -15;
    V.roll(s, undefined, [1, 2]);
    expect(V.legalMoves(s).some((m) => m.to === 'off')).toBe(false);
  });
  it('mars ve katmerli mars puanlama', () => {
    const s = emptyState();
    s.points[0] = 1; s.off[0] = 14; s.points[23] = -15;
    V.roll(s, undefined, [1, 2]);
    V.move(s, 0, 'off');
    expect(s.lastResult).toEqual({ winner: 0, points: 2, kind: 'mars' });
    const s2 = emptyState();
    s2.points[0] = 1; s2.off[0] = 14; s2.points[3] = -1; s2.points[23] = -14;
    V.roll(s2, undefined, [1, 2]);
    V.move(s2, 0, 'off');
    expect(s2.lastResult?.kind).toBe('katmerli');
    expect(s2.score[0]).toBe(3);
    const s3 = emptyState();
    s3.points[0] = 1; s3.off[0] = 14; s3.points[23] = -14; s3.off[1] = 1;
    V.roll(s3, undefined, [1, 2]);
    V.move(s3, 0, 'off');
    expect(s3.lastResult?.points).toBe(1);
    expect(s3.phase).toBe('gameOver');
    V.newGame(s3);
    expect(s3.phase).toBe('opening');
    expect(V.totalCheckers(s3, 0)).toBe(15);
    expect(s3.score[0]).toBe(1);
  });
  it('bot vs bot tam oyun geçerli hamlelerle biter', () => {
    const rng = createRng(77);
    for (let g = 0; g < 3; g++) {
      const s = V.newTavla({ target: 1, katmerliMars: true });
      V.rollOpening(s, rng);
      let guard = 0;
      while (s.phase !== 'matchOver' && guard++ < 2000) {
        V.roll(s, rng);
        const seq = chooseSequence(s, s.current, [...s.remaining], rng);
        for (const m of seq) V.move(s, m.from, m.to, m.die);
        if (s.phase === 'move') V.endTurn(s);
        expect(V.totalCheckers(s, 0)).toBe(15);
        expect(V.totalCheckers(s, 1)).toBe(15);
      }
      expect(s.phase).toBe('matchOver');
    }
  }, 60000);
});
