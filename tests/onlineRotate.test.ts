import { describe, it, expect } from 'vitest';
import * as B from '../src/games/batak/batak';
import * as K from '../src/games/king/king';
import * as P from '../src/games/pisti/pisti';
import { decideBid, decideTrump, chooseBatakCard } from '../src/games/batak/batakBot';
import { decideContract, decideKingTrump, chooseKingCard } from '../src/games/king/kingBot';
import { choosePistiCard } from '../src/games/pisti/pistiBot';
import { rotateBatak, rotateKing, rotatePisti, rotArr, toRel, toAbs } from '../src/online/rotate';
import { createRng } from '../src/games/common/rng';

const ids = (cs: { id: number }[]) => cs.map((c) => c.id).sort((a, b) => a - b);

describe('Çevrimiçi görünüm döndürme (ben = 0)', () => {
  it('koltuk eşlemesi tersinir; dizi döndürme', () => {
    for (let me = 0; me < 4; me++) for (let p = 0; p < 4; p++) expect(toAbs(toRel(p, me, 4), me, 4)).toBe(p);
    expect(rotArr(['a', 'b', 'c', 'd'], 1)).toEqual(['b', 'c', 'd', 'a']);
    expect(rotArr(['a', 'b', 'c', 'd'], 3)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('batak: döndürülmüş durumda 0. koltuğun yasal hamleleri gerçek koltuğunkilerle aynı; puanlar ve eşlik korunur', () => {
    const rng = createRng(4);
    for (const partners of [false, true]) {
      const s = B.newBatak({ partners, hands: 1 }, rng);
      for (let step = 0; step < 60 && s.phase !== 'matchOver'; step++) {
        const p = s.phase === 'trump' ? s.bidder! : s.current;
        const r = rotateBatak(JSON.parse(JSON.stringify(s)), p);
        expect(r.current === 0 || r.bidder === 0).toBe(true);
        if (s.phase === 'play') expect(ids(B.legalCards(r, 0))).toEqual(ids(B.legalCards(s, p)));
        if (s.phase === 'bid') expect(B.legalBids(r, 0)).toEqual(B.legalBids(s, p));
        if (partners) expect(B.teamOf(r, 2)).toBe(B.teamOf(r, 0)); // eşlide ortak hep karşıda
        expect(r.totals[0]).toBe(s.totals[p]);
        const v = B.viewBatak(s, p);
        if (s.phase === 'bid') B.bid(s, p, decideBid(v, rng) as number | 'pass');
        else if (s.phase === 'trump') B.chooseTrump(s, p, decideTrump(v));
        else B.playCard(s, p, chooseBatakCard(v, rng));
      }
    }
  });

  it('king: döndürülmüş durumda yasal kartlar ve seçilebilir oyunlar aynı', () => {
    const rng = createRng(5);
    const s = K.newKing({ short: true }, rng, 2);
    for (let step = 0; step < 120 && s.phase !== 'matchOver'; step++) {
      if (s.phase === 'handOver') { K.nextHand(s, rng); continue; }
      const p = s.phase === 'play' ? s.current : s.chooser;
      const r = rotateKing(JSON.parse(JSON.stringify(s)), p);
      if (s.phase === 'play') expect(ids(K.legalCards(r, 0))).toEqual(ids(K.legalCards(s, p)));
      else expect(K.availableContracts(r, 0)).toEqual(K.availableContracts(s, p));
      expect(r.totals[0]).toBe(s.totals[p]);
      const v = K.viewKing(s, p);
      if (s.phase === 'choose') K.chooseContract(s, p, decideContract(v, rng));
      else if (s.phase === 'trump') K.chooseTrump(s, p, decideKingTrump(v));
      else K.playCard(s, p, chooseKingCard(v, rng));
    }
  });

  it('pişti: taraf dizileri tek sayıda döndürmede yer değiştirir; benim tarafım hep 0', () => {
    const rng = createRng(6);
    for (const players of [2, 4] as const) {
      const s = P.newPisti({ players, target: 51 }, rng);
      for (let step = 0; step < 40 && s.phase === 'play'; step++) {
        const p = s.current;
        s.totals = [11, 22];
        const r = rotatePisti(JSON.parse(JSON.stringify(s)), p);
        expect(r.current).toBe(0);
        expect(r.totals[0]).toBe(s.totals[P.sideOf(s, p)]);
        expect(ids(r.hands[0])).toEqual(ids(s.hands[p]));
        P.playCard(s, p, choosePistiCard(P.viewPisti(s, p), rng));
      }
    }
  });
});
