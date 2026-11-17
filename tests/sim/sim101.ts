import { createRng } from '../../src/games/common/rng';
import * as K from '../../src/games/okey101/okey101';
import { decideDraw101, planTurn101 } from '../../src/games/okey101/okey101Bot';
let fin = 0, opens = 0, pairsOpen = 0, deckOut = 0;
const t0 = Date.now();
const N = Number((globalThis as any).process?.env?.N ?? 8);
for (let seed = 1; seed <= N; seed++) {
  const rng = createRng(seed * 13);
  const s = K.newMatch101(rng, { hands: 1 }, seed % 4);
  while (s.phase !== 'ended') {
    const p = s.current;
    if (s.phase === 'draw') { if (decideDraw101(K.view101(s, p)) === 'discard') K.drawDiscard101(s, p); else K.drawDeck101(s, p); }
    let plan = planTurn101(K.view101(s, p), rng);
    if (!plan.length) { K.returnDiscard101(s, p); K.drawDeck101(s, p); plan = planTurn101(K.view101(s, p), rng); }
    for (const a of plan) {
      if (a.type === 'open') K.open101(s, p, a.mode, a.groups);
      else if (a.type === 'lay') K.layMeld101(s, p, a.ids);
      else if (a.type === 'add') K.addToMeld101(s, p, a.tileId, a.meldId);
      else K.discard101(s, p, a.tileId);
    }
  }
  if (s.result!.winner !== null) fin++; else deckOut++;
  console.log(s.opened.join(","), s.hands.map((h) => h.length).join(","));
  opens += s.opened.filter((o) => o === 'melds').length; pairsOpen += s.opened.filter((o) => o === 'pairs').length;
}
console.log({ fin, deckOut, opens, pairsOpen, ms: Date.now() - t0 });
