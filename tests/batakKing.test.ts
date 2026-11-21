import { describe, it, expect } from 'vitest';
import * as B from '../src/games/batak/batak';
import * as K from '../src/games/king/king';
import { decideBid, decideTrump, chooseBatakCard } from '../src/games/batak/batakBot';
import { decideContract, decideKingTrump, chooseKingCard } from '../src/games/king/kingBot';
import { trickWinner, Card, Suit } from '../src/games/trick/trick';
import { createRng } from '../src/games/common/rng';
import type { Difficulty } from '../src/games/common/types';

const C = (suit: number, rank: number, id = suit * 13 + rank - 1): Card => ({ id, suit: suit as Suit, rank });

function playBatakMatch(seed: number, opts: B.BatakOptions, diffs: Difficulty[] = ['medium', 'medium', 'medium', 'medium']) {
  const rng = createRng(seed);
  const s = B.newBatak(opts, rng);
  let guard = 0;
  while (s.phase !== 'matchOver' && guard++ < 5000) {
    if (s.phase === 'handOver') { B.nextHand(s, rng); continue; }
    const p = s.current;
    const v = B.viewBatak(s, p);
    if (s.phase === 'bid') { const b = decideBid(v, rng, diffs[p]); expect(v.legalBids).toContain(b); B.bid(s, p, b as number | 'pass'); }
    else if (s.phase === 'trump') B.chooseTrump(s, p, decideTrump(v));
    else {
      const id = chooseBatakCard(v, rng, diffs[p]);
      expect(v.legal.map((c) => c.id)).toContain(id);
      B.playCard(s, p, id);
    }
  }
  return s;
}

function playKingMatch(seed: number, opts: K.KingOptions, diffs: Difficulty[] = ['medium', 'medium', 'medium', 'medium']) {
  const rng = createRng(seed);
  const s = K.newKing(opts, rng);
  let guard = 0;
  while (s.phase !== 'matchOver' && guard++ < 20000) {
    if (s.phase === 'handOver') { K.nextHand(s, rng); continue; }
    const p = s.current;
    const v = K.viewKing(s, s.phase === 'choose' || s.phase === 'trump' ? s.chooser : p);
    if (s.phase === 'choose') { const c = decideContract(v, rng, diffs[s.chooser]); expect(v.available).toContain(c); K.chooseContract(s, s.chooser, c); }
    else if (s.phase === 'trump') K.chooseTrump(s, s.chooser, decideKingTrump(v));
    else {
      const id = chooseKingCard(v, rng, diffs[p]);
      expect(v.legal.map((c) => c.id)).toContain(id);
      K.playCard(s, p, id);
    }
  }
  return s;
}

describe('El alma çekirdeği', () => {
  it('eli koz yoksa açılan rengin en büyüğü, varsa en büyük koz alır; renk dışı kart almaz', () => {
    const t = [{ player: 0, card: C(0, 10) }, { player: 1, card: C(0, 1) }, { player: 2, card: C(2, 13) }, { player: 3, card: C(0, 12) }];
    expect(trickWinner(t, null)).toBe(1); // as
    expect(trickWinner(t, 2)).toBe(2); // karo koz
    expect(trickWinner([{ player: 0, card: C(1, 2) }, { player: 1, card: C(0, 1) }, { player: 2, card: C(1, 3) }, { player: 3, card: C(3, 1) }], null)).toBe(2);
  });
});

describe('Batak', () => {
  it('ihale: en az 5 (eşli 7), yükseltme zorunlu; üç pas ihaleyi bitirir; herkes pas derse sonuncu pas diyemez', () => {
    const rng = createRng(1);
    const s = B.newBatak({ partners: false, hands: 1 }, rng, 3);
    expect(s.current).toBe(0);
    expect(B.legalBids(s, 0)).toEqual(['pass', 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    B.bid(s, 0, 'pass'); B.bid(s, 1, 'pass'); B.bid(s, 2, 'pass');
    expect(B.legalBids(s, 3)).not.toContain('pass');
    B.bid(s, 3, 5);
    expect(s.phase).toBe('trump');
    expect(s.bidder).toBe(3);
    const e = B.newBatak({ partners: true, hands: 1 }, rng, 3);
    expect(B.legalBids(e, 0)[1]).toBe(7);
    B.bid(e, 0, 8);
    expect(() => B.bid(e, 1, 8)).toThrow();
    B.bid(e, 1, 9); B.bid(e, 2, 'pass'); B.bid(e, 3, 'pass'); B.bid(e, 0, 'pass');
    expect(e.phase).toBe('trump');
    expect(e.bidder).toBe(1);
  });

  it('oynayış: renge uy + yükselt, renk yoksa koz (varsa büyük koz), koz açılmadan kozla açılmaz', () => {
    const rng = createRng(2);
    const s = B.newBatak({ partners: false, hands: 1 }, rng);
    s.phase = 'play'; s.trump = 1; s.bidder = 0; s.current = 0; s.trumpBroken = false;
    s.hands = [[C(1, 5), C(0, 3)], [C(0, 9), C(0, 1), C(3, 4)], [C(2, 2), C(1, 9), C(1, 12)], [C(3, 3), C(3, 9)]];
    expect(B.legalCards(s, 0).map((c) => c.id)).toEqual([C(0, 3).id]); // koz açılmadı
    B.playCard(s, 0, C(0, 3).id);
    expect(B.legalCards(s, 1).map((c) => c.id).sort()).toEqual([C(0, 9).id, C(0, 1).id].sort()); // ikisi de yükseltir
    B.playCard(s, 1, C(0, 9).id);
    expect(B.legalCards(s, 2).map((c) => c.id).sort()).toEqual([C(1, 9).id, C(1, 12).id].sort()); // renk yok → koz
    B.playCard(s, 2, C(1, 9).id);
    expect(B.legalCards(s, 3).length).toBe(2); // renk de koz da yok → serbest
    B.playCard(s, 3, C(3, 3).id);
    expect(s.tricksWon[2]).toBe(1);
    expect(s.trumpBroken).toBe(true);
    // ortada koz varken renk yoksa büyük koz zorunlu
    const t = B.newBatak({ partners: false, hands: 1 }, rng);
    t.phase = 'play'; t.trump = 1; t.bidder = 0; t.current = 2; t.trumpBroken = true;
    t.trick = [{ player: 0, card: C(0, 5) }, { player: 1, card: C(1, 10) }];
    t.hands = [[], [], [C(1, 4), C(1, 13), C(2, 2)], [C(0, 2)]];
    expect(B.legalCards(t, 2).map((c) => c.id)).toEqual([C(1, 13).id]);
    // renge uyarken ortaya koz düşmüşse yükseltme gerekmez
    t.current = 3;
    t.trick.push({ player: 2, card: C(1, 13) });
    expect(B.legalCards(t, 3).map((c) => c.id)).toEqual([C(0, 2).id]);
  });

  it('puan: tutan aldığı kadar, batan ihale kadar eksi; eşlide eller birlikte sayılır', () => {
    expect(B.scoreHand([6, 3, 2, 2], 0, 6, false)).toEqual({ scores: [6, 3, 2, 2], made: true });
    expect(B.scoreHand([4, 3, 4, 2], 0, 6, false)).toEqual({ scores: [-6, 3, 4, 2], made: false });
    expect(B.scoreHand([4, 3, 4, 2], 0, 7, true)).toEqual({ scores: [8, 5, 8, 5], made: true });
    expect(B.scoreHand([2, 5, 3, 3], 2, 7, true)).toEqual({ scores: [-7, 8, -7, 8], made: false });
  });

  it('el almayan cezalı: ihaleyi almayanlardan hiç el alamayan ihale kadar kaybeder; ihaleci tarafa ayrıca uygulanmaz', () => {
    expect(B.scoreHand([7, 6, 0, 0], 0, 6, false, true)).toEqual({ scores: [7, 6, -6, -6], made: true });
    expect(B.scoreHand([0, 7, 6, 0], 0, 5, false, true)).toEqual({ scores: [-5, 7, 6, -5], made: false });
    expect(B.scoreHand([7, 6, 0, 0], 0, 6, false, false).scores).toEqual([7, 6, 0, 0]); // seçenek kapalı
    // eşli: takım olarak hiç el almayan cezalı
    expect(B.scoreHand([7, 0, 6, 0], 0, 8, true, true)).toEqual({ scores: [13, -8, 13, -8], made: true });
    expect(B.scoreHand([7, 1, 5, 0], 0, 8, true, true)).toEqual({ scores: [12, 1, 12, 1], made: true });
  });

  it('el almayan cezalı açıkken botlar maçları geçerli hamlelerle bitirir', () => {
    for (let seed = 50; seed <= 70; seed++) {
      const s = playBatakMatch(seed, { partners: seed % 2 === 0, hands: 2, zeroPenalty: true });
      expect(s.phase).toBe('matchOver');
    }
  });

  it('botlar tekli ve eşli maçları yalnızca geçerli hamlelerle bitirir; her elde 13 el dağıtılır', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const partners = seed % 2 === 0;
      const s = playBatakMatch(seed, { partners, hands: 3 }, seed % 3 === 0 ? ['easy', 'hard', 'medium', 'hard'] : undefined);
      expect(s.phase).toBe('matchOver');
      expect(s.tricksWon.reduce((a, b) => a + b, 0)).toBe(13);
      expect(B.matchWinners(s).length).toBeGreaterThan(0);
      if (partners) { expect(s.totals[0]).toBe(s.totals[2]); expect(s.totals[1]).toBe(s.totals[3]); }
    }
  });

  it('bot görünümü gizli bilgi içermez (başkalarının eli yok)', () => {
    const s = B.newBatak({ partners: false, hands: 1 }, createRng(5));
    const v = B.viewBatak(s, 2) as unknown as Record<string, unknown>;
    expect(v.hands).toBeUndefined();
    expect((v.hand as Card[]).map((c) => c.id)).toEqual(s.hands[2].map((c) => c.id));
  });
});

describe('King', () => {
  it('kotalar: tam King 20 el, herkes 2 koz + 3 ceza, her ceza tam 2 kez; kısa King 8 el', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const s = playKingMatch(seed, { short: false });
      expect(s.phase).toBe('matchOver');
      expect(s.history.length).toBe(20);
      expect(s.kozChosen).toEqual([2, 2, 2, 2]);
      expect(s.cezaChosen).toEqual([3, 3, 3, 3]);
      for (const p of K.PENALTIES) expect(s.penaltyUses[p]).toBe(2);
      expect(s.totals.reduce((a, b) => a + b, 0)).toBe(s.history.reduce((a, h) => a + h.scores.reduce((x, y) => x + y, 0), 0));
    }
    const sh = playKingMatch(99, { short: true });
    expect(sh.history.length).toBe(8);
    expect(sh.kozChosen).toEqual([1, 1, 1, 1]);
    for (const p of K.PENALTIES) expect(sh.penaltyUses[p]).toBeLessThanOrEqual(1);
  });

  it('ceza toplamları sabit: kupa −390, erkek −480, kız −400, rıfkı −320, el −650, son iki −360; koz +650', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const s = playKingMatch(seed * 7, { short: false }, ['hard', 'easy', 'medium', 'hard']);
      const want: Record<K.Contract, number> = { kupa: -390, erkek: -480, kiz: -400, rifki: -320, el: -650, sonIki: -360, koz: 650 };
      for (const h of s.history) expect(h.scores.reduce((a, b) => a + b, 0)).toBe(want[h.contract]);
    }
  });

  it('kurallar: kupa açılmadan kupayla açılmaz; rıfkıda rengin yoksa papaz zorunlu; kozda rengin yoksa koz zorunlu', () => {
    const rng = createRng(3);
    const s = K.newKing({ short: true }, rng);
    K.chooseContract(s, 0, 'rifki');
    s.hands = [[C(1, 2), C(0, 4)], [C(1, 13), C(2, 2), C(1, 3)], [C(0, 9)], [C(0, 10)]];
    expect(K.legalCards(s, 0).map((c) => c.id)).toEqual([C(0, 4).id]);
    K.playCard(s, 0, C(0, 4).id);
    expect(K.legalCards(s, 1).map((c) => c.id)).toEqual([C(1, 13).id]); // maça yok → rıfkı zorunlu
    const k = K.newKing({ short: true }, rng);
    K.chooseContract(k, 0, 'koz');
    expect(k.phase).toBe('trump');
    K.chooseTrump(k, 0, 3);
    k.hands = [[C(0, 4)], [C(3, 2), C(2, 2)], [C(0, 9)], [C(0, 10)]];
    K.playCard(k, 0, C(0, 4).id);
    expect(K.legalCards(k, 1).map((c) => c.id)).toEqual([C(3, 2).id]);
    // seçilemeyen sözleşme
    expect(() => K.chooseContract(K.newKing({ short: true }, rng), 1, 'kupa')).toThrow();
  });

  it('rıfkı papaz alınınca, kız almaz dört kız alınınca el erken biter', () => {
    const s = K.newKing({ short: true }, createRng(4));
    K.chooseContract(s, 0, 'rifki');
    s.hands = [[C(1, 1), C(0, 2)], [C(1, 13), C(0, 3)], [C(1, 2), C(0, 4)], [C(1, 3), C(0, 5)]];
    s.broken = true;
    K.playCard(s, 0, C(1, 1).id); K.playCard(s, 1, C(1, 13).id); K.playCard(s, 2, C(1, 2).id); K.playCard(s, 3, C(1, 3).id);
    expect(s.phase).toBe('handOver');
    expect(s.handScores).toEqual([-320, 0, 0, 0]);
  });

  it('bot görünümü gizli bilgi içermez', () => {
    const s = K.newKing({ short: false }, createRng(6));
    const v = K.viewKing(s, 1) as unknown as Record<string, unknown>;
    expect(v.hands).toBeUndefined();
    expect(v.taken).toBeUndefined();
  });
});
