import { describe, it, expect } from 'vitest';
import { createRng } from '../src/games/common/rng';
import * as V from '../src/games/tavla/tavla';
import { chooseSequence, hitProbability } from '../src/games/tavla/tavlaBot';
import * as P from '../src/games/pisti/pisti';
import { choosePistiCard } from '../src/games/pisti/pistiBot';
import * as O from '../src/games/okey/okey';
import { decideOkey, feedDanger } from '../src/games/okey/okeyBot';
import * as K from '../src/games/okey101/okey101';
import { simulate101 } from './sim/sim101';
import type { Difficulty } from '../src/games/common/types';
import { Tile, TileColor } from '../src/games/common/tiles';

function tavlaMatch(d0: Difficulty, d1: Difficulty, seed: number): number {
  const rng = createRng(seed);
  const s = V.newTavla({ target: 1, katmerliMars: false });
  V.rollOpening(s, rng);
  let guard = 0;
  while (s.phase !== 'matchOver' && guard++ < 3000) {
    V.roll(s, rng);
    const seq = chooseSequence(s, s.current, [...s.remaining], rng, 0.5, s.current === 0 ? d0 : d1);
    for (const m of seq) V.move(s, m.from, m.to, m.die);
    if (s.phase === 'move') V.endTurn(s);
  }
  return s.score[0] > s.score[1] ? 0 : 1;
}

describe('Bot zorluk seviyeleri', () => {
  it('tavla: vurulma olasılığı doğru sayılır', () => {
    const pos: V.Position = { points: Array(24).fill(0), bar: [0, 0], off: [0, 0] };
    pos.points[10] = 1; // benim (0) açık pulum
    pos.points[4] = -1; // rakip (1) 6 geride → direkt 6: 11/36 + kombinasyonlar
    const p = hitProbability(pos, 0, 10);
    // 6 içeren 11 zar + (1,5)(5,1)(2,4)(4,2)(3,3)(2,2) = 17/36
    expect(p).toBeCloseTo(17 / 36, 5);
    pos.points[7] = -2; // rakip kendi... (benim için kapalı değil, rakibin kendi kapısı) ara durak engeli değil
    expect(hitProbability(pos, 0, 10)).toBeGreaterThan(17 / 36);
  });

  it('tavla: zor bot kolay bota karşı açık farkla kazanır', () => {
    let hardWins = 0;
    const N = 30;
    for (let i = 0; i < N; i++) hardWins += tavlaMatch(i % 2 ? 'hard' : 'easy', i % 2 ? 'easy' : 'hard', 100 + i) === (i % 2 ? 0 : 1) ? 1 : 0;
    expect(hardWins / N).toBeGreaterThan(0.6);
  }, 120000);

  it('pişti: zor bot kolay bota karşı daha çok puan toplar', () => {
    let hard = 0, easy = 0;
    for (let i = 0; i < 40; i++) {
      const rng = createRng(500 + i);
      const s = P.newPisti({ players: 2, target: 1000 }, rng);
      const hardSeat = i % 2;
      while (s.phase === 'play') P.playCard(s, s.current, choosePistiCard(P.viewPisti(s, s.current), rng, s.current === hardSeat ? 'hard' : 'easy'));
      hard += s.handScores![hardSeat];
      easy += s.handScores![1 - hardSeat];
    }
    expect(hard).toBeGreaterThan(easy);
  });

  it('okey: zor bot, sonraki oyuncunun yerden topladığı serilere yakın taşı tehlikeli sayar', () => {
    const s = O.newMatch(createRng(3), 0);
    const v = O.viewFor(s, 0);
    const T = (c: number, n: number): Tile => ({ id: 5000 + c * 20 + n, color: c as TileColor, num: n, fake: false });
    v.ctx = { okeyColor: 3, okeyNum: 13 };
    v.takes = [{ player: 1, tile: T(0, 6) }];
    expect(feedDanger(T(0, 7), v)).toBeGreaterThan(0);
    expect(feedDanger(T(2, 12), v)).toBe(0);
    // karar her seviyede geçerli
    for (const d of ['easy', 'medium', 'hard'] as Difficulty[]) {
      const a = decideOkey(O.viewFor(s, 0), createRng(1), d);
      expect(['discard', 'finish']).toContain(a.type);
    }
  });

  it('101: bot-bot el bitirme oranı ölçülür ve zor ≥ kolay', () => {
    const easy = simulate101(30, 'easy', 1);
    const hard = simulate101(30, 'hard', 1);
    expect(hard.finished).toBeGreaterThan(0);
    expect(hard.rate).toBeGreaterThanOrEqual(easy.rate);
    expect(hard.penalties).toBe(0);
  }, 120000);

  it('botlar gizli bilgiye erişmez: görünüm diğer ellerin ve destenin kimliklerini içermez', () => {
    const o = O.newMatch(createRng(9), 0);
    const ov = JSON.stringify(O.viewFor(o, 1));
    for (const t of [...o.hands[0], ...o.hands[2], ...o.deck]) expect(ov.includes(`"id":${t.id},`)).toBe(false);
    const k = K.newMatch101(createRng(9), { hands: 1 }, 0);
    const kv = JSON.stringify(K.view101(k, 2));
    for (const t of [...k.hands[0], ...k.hands[1], ...k.deck]) expect(kv.includes(`"id":${t.id},`)).toBe(false);
    const p = P.newPisti({ players: 4, target: 151 }, createRng(9));
    const pv = JSON.stringify(P.viewPisti(p, 1));
    const hidden = [...p.hands[0], ...p.hands[2], ...p.hands[3], ...p.deck, ...p.pile.slice(0, p.hiddenCount)];
    for (const c of hidden) expect(pv.includes(`"id":${c.id},`)).toBe(false);
  });

  it('botun kararı yalnızca görünüme bağlıdır: gizli durum değişse de karar aynı', () => {
    const s = O.newMatch(createRng(21), 1);
    const a1 = decideOkey(O.viewFor(s, 1), createRng(5), 'hard');
    // gizli bilgiyi karıştır: diğer eller ve deste
    const pool = [...s.hands[0], ...s.hands[2], ...s.deck].reverse();
    s.hands[0] = pool.splice(0, 14); s.hands[2] = pool.splice(0, 14); s.deck = pool;
    const a2 = decideOkey(O.viewFor(s, 1), createRng(5), 'hard');
    expect(a2).toEqual(a1);
  });
});
