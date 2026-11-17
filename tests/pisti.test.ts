import { describe, it, expect } from 'vitest';
import * as P from '../src/games/pisti/pisti';
import { choosePistiCard } from '../src/games/pisti/pistiBot';
import { createRng } from '../src/games/common/rng';

const C = (suit: number, rank: number, id = Math.floor(Math.random() * 1e6) + 100): P.Card => ({ id, suit: suit as P.Suit, rank });

describe('Pişti', () => {
  it('2 kişilik dağıtım: yerde 4, elde 4er, deste 40', () => {
    const s = P.newPisti({ players: 2, target: 151 }, createRng(1));
    expect(s.pile.length).toBe(4);
    expect(s.hands.map((h) => h.length)).toEqual([4, 4]);
    expect(s.deck.length).toBe(40);
    expect(s.pile[3].rank).not.toBe(P.JACK);
  });
  it('4 kişilik dağıtım: deste 32, takımlar karşılıklı', () => {
    const s = P.newPisti({ players: 4, target: 151 }, createRng(2));
    expect(s.hands.map((h) => h.length)).toEqual([4, 4, 4, 4]);
    expect(s.deck.length).toBe(32);
    expect(P.sideOf(s, 0)).toBe(P.sideOf(s, 2));
    expect(P.sideOf(s, 1)).toBe(P.sideOf(s, 3));
    expect(P.sideOf(s, 0)).not.toBe(P.sideOf(s, 1));
  });
  it('aynı değerle alma, valeyle alma, pişti ve çift pişti', () => {
    const s = P.newPisti({ players: 2, target: 151 }, createRng(3));
    s.current = 0;
    s.pile = [C(0, 5)];
    s.hands[0] = [C(1, 5, 1), C(0, 9, 2)];
    s.hands[1] = [C(2, 9, 3), C(3, 11, 4)];
    const ev = P.playCard(s, 0, 1);
    expect(ev?.pisti).toBe(10);
    expect(s.pistis[0]).toBe(10);
    expect(s.pile.length).toBe(0);
    // boş yığına kart → alma yok
    expect(P.playCard(s, 1, 3)).toBeNull();
    expect(s.pile.length).toBe(1);
    // sıra hatası
    expect(() => P.playCard(s, 1, 4)).toThrow();
    P.playCard(s, 0, 2); // 9 üstüne 9 → pişti
    expect(s.pistis[0]).toBe(20);

    const s2 = P.newPisti({ players: 2, target: 151 }, createRng(4));
    s2.current = 0;
    s2.pile = [C(0, 11)];
    s2.hands[0] = [C(1, 11, 10), C(1, 2, 11)];
    expect(P.playCard(s2, 0, 10)?.pisti).toBe(20);

    const s3 = P.newPisti({ players: 2, target: 151 }, createRng(5));
    s3.current = 0;
    s3.pile = [C(0, 7)];
    s3.hands[0] = [C(1, 11, 20), C(1, 2, 21)];
    const e3 = P.playCard(s3, 0, 20);
    expect(e3?.pisti).toBe(0);
    expect(e3?.cards.length).toBe(2);

    const s4 = P.newPisti({ players: 2, target: 151 }, createRng(6));
    s4.current = 0;
    s4.pile = [C(0, 7), C(1, 3)];
    s4.hands[0] = [C(1, 3, 30), C(1, 2, 31)];
    const e4 = P.playCard(s4, 0, 30);
    expect(e4?.pisti).toBe(0);
    expect(e4?.cards.length).toBe(3);
  });
  it('kart puanları', () => {
    expect(P.cardPoints(C(2, 10))).toBe(3);
    expect(P.cardPoints(C(3, 2))).toBe(2);
    expect(P.cardPoints(C(0, 1))).toBe(1);
    expect(P.cardPoints(C(0, 11))).toBe(1);
    expect(P.cardPoints(C(0, 10))).toBe(0);
    const total = P.createDeck().reduce((a, c) => a + P.cardPoints(c), 0);
    expect(total).toBe(4 + 4 + 3 + 2);
  });
  for (const players of [2, 4] as const) {
    it(`${players} kişilik tam el: botlar, puanlama, 52 kart korunumu`, () => {
      const rng = createRng(players * 7);
      const s = P.newPisti({ players, target: 151 }, rng);
      let guard = 0;
      while (s.phase === 'play' && guard++ < 200) {
        const p = s.current;
        P.playCard(s, p, choosePistiCard(P.viewPisti(s, p), rng));
        const n = s.deck.length + s.pile.length + s.hands.flat().length + s.captured.flat().length;
        expect(n).toBe(52);
      }
      expect(s.phase).not.toBe('play');
      expect(s.captured.flat().length).toBe(52);
      const t = P.tally(s);
      const majority = t[0].cards === t[1].cards ? 0 : 3;
      expect(s.handScores![0] + s.handScores![1]).toBe(13 + majority + s.pistis[0] + s.pistis[1]);
      if (s.phase === 'handOver') {
        P.nextHand(s, rng);
        expect(s.handNo).toBe(2);
        expect(s.captured.flat().length).toBe(0);
      }
    });
  }
  it('maç hedefe ulaşınca biter', () => {
    const rng = createRng(99);
    const s = P.newPisti({ players: 4, target: 60 }, rng);
    let guard = 0;
    while (s.phase !== 'matchOver' && guard++ < 2000) {
      if (s.phase === 'handOver') P.nextHand(s, rng);
      else P.playCard(s, s.current, choosePistiCard(P.viewPisti(s, s.current), rng));
    }
    expect(s.phase).toBe('matchOver');
    expect(Math.max(...s.totals)).toBeGreaterThanOrEqual(60);
  });
  it('bot alabiliyorsa pişti yapar', () => {
    const v: P.PistiView = { me: 0, players: 2, hand: [C(0, 4, 1), C(1, 8, 2)], top: C(2, 8), pileSize: 1, played: [], deckCount: 20, handSizes: [2, 2] };
    expect(choosePistiCard(v, () => 0)).toBe(2);
  });
});
