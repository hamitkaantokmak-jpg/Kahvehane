import { createRng } from '../../src/games/common/rng';
import * as K from '../../src/games/okey101/okey101';
import { decideDraw101, stepTurn101 } from '../../src/games/okey101/okey101Bot';
import type { Difficulty } from '../../src/games/common/types';

/** Bot-bot 101 simülasyonu: el bitirme oranını ölçer. */
export function simulate101(n: number, diff: Difficulty, seed0 = 1) {
  let fin = 0, opens = 0, pairsOpen = 0, penalties = 0;
  for (let seed = seed0; seed < seed0 + n; seed++) {
    const rng = createRng(seed * 13);
    const s = K.newMatch101(rng, { hands: 1 }, seed % 4);
    let guard = 0;
    while (s.phase !== 'ended' && guard++ < 2000) {
      const p = s.current;
      if (s.phase === 'draw') { if (decideDraw101(K.view101(s, p), diff) === 'discard') K.drawDiscard101(s, p); else K.drawDeck101(s, p); }
      for (let k = 0; k < 40 && s.current === p && s.phase === 'play'; k++) {
        const a = stepTurn101(K.view101(s, p), rng, diff);
        if (!a) { K.returnDiscard101(s, p); K.drawDeck101(s, p); continue; }
        if (a.type === 'open') K.open101(s, p, a.mode, a.groups);
        else if (a.type === 'lay') K.layMeld101(s, p, a.ids);
        else if (a.type === 'add') K.addToMeld101(s, p, a.tileId, a.meldId);
        else if (a.type === 'swap') K.swapJoker101(s, p, a.tileId, a.meldId);
        else K.discard101(s, p, a.tileId);
      }
    }
    if (s.result!.winner !== null) fin++;
    penalties += s.penalties.filter((x) => x > 0).length;
    opens += s.opened.filter((o) => o === 'melds').length; pairsOpen += s.opened.filter((o) => o === 'pairs').length;
  }
  return { hands: n, finished: fin, rate: fin / n, opens, pairsOpen, penalties };
}

const g = globalThis as any;
if ((g.process?.argv ?? []).join(' ').includes('sim101')) {
  for (const d of ['easy', 'medium', 'hard'] as Difficulty[]) console.log(d, JSON.stringify(simulate101(Number(g.process.env.N ?? 40), d)));
}
