/**
 * 101 Okey botu. Yalnızca Okey101View (kendi eli + masa + açık taşlar) kullanır.
 * Karar iki aşamalıdır: çekme kararı ve oynama planı (açma, serme, işleme, atma).
 */
import { Tile, toCounts, bestPartition, candidatesToTiles, isJoker, identity, isPair, MeldCandidate, OkeyCtx } from '../common/tiles';
import type { Difficulty } from '../common/types';
import { Okey101View, RULES_101, OPEN_MIN, PAIR_MIN, tryExtend, TableMeld, checkMeld } from './okey101';

export type Bot101Action =
  | { type: 'open'; mode: 'melds' | 'pairs'; groups: number[][] }
  | { type: 'lay'; ids: number[] }
  | { type: 'add'; tileId: number; meldId: number }
  | { type: 'discard'; tileId: number };

function bestMelds(hand: Tile[], ctx: OkeyCtx, by: 'value' | 'cover') {
  const { counts, jokers } = toCounts(hand, ctx);
  const score = by === 'value' ? (m: MeldCandidate) => m.value : (m: MeldCandidate) => (m.concrete.length + m.jokers) * 100 + m.value;
  const r = bestPartition(counts, jokers, RULES_101, score);
  const value = r.melds.reduce((a, m) => a + m.value, 0);
  return { melds: r.melds, value };
}

/** Eldeki çiftleri bul (önce gerçek çiftler, sonra okeyle tamamlananlar). */
export function findPairs(hand: Tile[], ctx: OkeyCtx, preferId: number | null = null): Tile[][] {
  const jokers = hand.filter((t) => isJoker(t, ctx));
  const rest = hand.filter((t) => !isJoker(t, ctx));
  const byKey = new Map<string, Tile[]>();
  for (const t of rest) {
    const id = identity(t, ctx);
    const k = `${id.color}-${id.num}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(t);
  }
  const pairs: Tile[][] = [];
  const singles: Tile[] = [];
  for (const arr of byKey.values()) {
    // tercih edilen (yerden alınan) taş önce kullanılsın
    arr.sort((a, b) => (b.id === preferId ? 1 : 0) - (a.id === preferId ? 1 : 0));
    while (arr.length >= 2) pairs.push(arr.splice(0, 2));
    singles.push(...arr);
  }
  singles.sort((a, b) => identity(b, ctx).num - identity(a, ctx).num);
  for (const j of jokers) {
    const s = singles.find((x) => x.id === preferId) ?? singles.shift();
    if (s) { singles.splice(singles.indexOf(s), 1); pairs.push([s, j]); }
  }
  return pairs;
}

function processableTarget(table: TableMeld[], tile: Tile, ctx: OkeyCtx): TableMeld | null {
  for (const m of table) if (tryExtend(m, tile, ctx)) return m;
  return null;
}

export function decideDraw101(v: Okey101View, diff: Difficulty = 'medium'): 'deck' | 'discard' {
  const top = v.discardTops[(v.me + 3) % 4];
  if (!top || v.deckCount === 0 || diff === 'easy') return 'deck';
  const hand = v.hand;
  if (v.opened[v.me] === 'none') {
    const without = bestMelds(hand, v.ctx, 'value').value;
    const withTop = bestMelds([...hand, top], v.ctx, 'value').value;
    if (without < OPEN_MIN && withTop >= OPEN_MIN && withTop > without) return 'discard';
    const pw = findPairs(hand, v.ctx).length;
    const pt = findPairs([...hand, top], v.ctx, top.id);
    if (pw < PAIR_MIN && pt.length >= PAIR_MIN && pt.some((p) => p.includes(top))) return 'discard';
    return 'deck';
  }
  if (v.opened[v.me] === 'melds') {
    if (!isJoker(top, v.ctx) && processableTarget(v.table, top, v.ctx)) return 'discard';
    const without = bestMelds(hand, v.ctx, 'cover').melds.reduce((a, m) => a + m.concrete.length + m.jokers, 0);
    const withT = bestMelds([...hand, top], v.ctx, 'cover').melds.reduce((a, m) => a + m.concrete.length + m.jokers, 0);
    if (withT > without + (diff === 'hard' ? 0 : 1)) return 'discard';
  }
  if (v.opened[v.me] === 'pairs') {
    if (!isJoker(top, v.ctx) && processableTarget(v.table, top, v.ctx)) return 'discard';
    if (hand.some((t) => !isJoker(t, v.ctx) && isPair(t, top, v.ctx))) return 'discard';
  }
  return 'deck';
}

/** Bu tur için eylem planı (çekme yapılmış olmalı). */
export function planTurn101(v: Okey101View, rng: () => number = Math.random, diff: Difficulty = 'medium'): Bot101Action[] {
  const endgame = v.deckCount <= 6;
  const ctx = v.ctx;
  let hand = [...v.hand];
  // yerden alınan taş, aday listesinde önce kullanılsın
  if (v.takenDiscard !== null) hand.sort((a, b) => (b.id === v.takenDiscard ? 1 : 0) - (a.id === v.takenDiscard ? 1 : 0));
  const table: TableMeld[] = v.table.map((m) => ({ ...m, tiles: [...m.tiles], slots: [...m.slots] }));
  const actions: Bot101Action[] = [];
  let opened = v.opened[v.me];
  const remove = (tiles: Tile[]) => { hand = hand.filter((t) => !tiles.includes(t)); };
  let fakeId = -1;

  if (opened === 'none') {
    // zor: 101'i geçen en çok taşlı bölümlemeyi tercih et (açınca elde az taş kalsın)
    let best = bestMelds(hand, ctx, 'value');
    if (diff === 'hard') {
      const cover = bestMelds(hand, ctx, 'cover');
      if (cover.value >= OPEN_MIN) best = cover;
    }
    let groups = candidatesToTiles(best.melds, hand, ctx);
    // en az bir taş kalmalı
    if (groups.flat().length >= hand.length) {
      groups.sort((a, b) => a.length - b.length);
      const alt = groups.slice(1);
      const altVal = alt.reduce((a, g) => a + (checkMeld(g, ctx)?.value ?? 0), 0);
      groups = altVal >= OPEN_MIN ? alt : [];
    }
    const total = groups.reduce((a, g) => a + (checkMeld(g, ctx)?.value ?? 0), 0);
    const pairs = findPairs(hand, ctx, v.takenDiscard);
    const pairsOk = pairs.length >= PAIR_MIN && pairs.flat().length < hand.length;
    if (total >= OPEN_MIN && !(pairsOk && pairs.length >= 6 && total < 130)) {
      actions.push({ type: 'open', mode: 'melds', groups: groups.map((g) => g.map((t) => t.id)) });
      groups.forEach((g) => { const m = checkMeld(g, ctx)!; table.push({ id: fakeId--, owner: v.me, kind: m.kind, tiles: g, slots: m.slots }); });
      remove(groups.flat());
      opened = 'melds';
    } else if (pairsOk) {
      actions.push({ type: 'open', mode: 'pairs', groups: pairs.map((g) => g.map((t) => t.id)) });
      remove(pairs.flat());
      opened = 'pairs';
    }
  } else if (opened === 'melds') {
    const best = bestMelds(hand, ctx, 'cover');
    for (const g of candidatesToTiles(best.melds, hand, ctx)) {
      if (hand.length - g.length < 1) break;
      const m = checkMeld(g, ctx);
      if (!m) continue;
      actions.push({ type: 'lay', ids: g.map((t) => t.id) });
      table.push({ id: fakeId--, owner: v.me, kind: m.kind, tiles: g, slots: m.slots });
      remove(g);
    }
  } else if (opened === 'pairs') {
    for (const g of findPairs(hand, ctx, v.takenDiscard)) {
      if (hand.length - 2 < 1) break;
      if (g.some((t) => isJoker(t, ctx)) && hand.length > 4) continue; // okeyi erken harcama
      actions.push({ type: 'lay', ids: g.map((t) => t.id) });
      remove(g);
    }
  }

  // işleme (yalnızca masadaki gerçek perlere; yeni serilen perlere işleme planı id bilinmediği için atlanır)
  if (opened !== 'none') {
    let changed = true;
    while (changed && hand.length > 1) {
      changed = false;
      for (const t of [...hand]) {
        if (hand.length <= 1) break;
        if (isJoker(t, ctx) && (diff === 'easy' || (hand.length > 3 && diff !== 'hard'))) continue;
        const target = table.find((m) => m.id > 0 && tryExtend(m, t, ctx));
        if (!target) continue;
        const slots = tryExtend(target, t, ctx)!;
        target.slots = slots;
        target.tiles = [...target.tiles, t];
        actions.push({ type: 'add', tileId: t.id, meldId: target.id });
        remove([t]);
        changed = true;
      }
    }
  }

  // yerden alınan taş kullanılmadıysa plan geçersiz → atış yok (denetleyici geri koyar)
  if (v.takenDiscard !== null && hand.some((t) => t.id === v.takenDiscard)) {
    return [];
  }

  // atış
  const safe = hand.filter((t) => !isJoker(t, ctx) && !table.some((m) => tryExtend(m, t, ctx)));
  const pool = hand.length === 1 ? hand : safe.length ? safe : hand.filter((t) => !isJoker(t, ctx)).length ? hand.filter((t) => !isJoker(t, ctx)) : hand;
  let bestTile = pool[0];
  let bestScore = -Infinity;
  for (const t of pool) {
    const rest = hand.filter((x) => x !== t);
    const potential = bestMelds(rest, ctx, opened === 'none' ? 'value' : 'cover');
    const covered = potential.melds.reduce((a, m) => a + m.concrete.length + m.jokers, 0);
    const n = identity(t, ctx).num;
    const dump = opened !== 'none' && diff === 'hard' && endgame ? n * 3 : n;
    const near = opened !== 'none' && diff === 'hard' ? rest.reduce((acc, x) => acc + nearTable(table, x, ctx), 0) * 6 : 0;
    const score = (opened === 'none' ? potential.value : covered * 20 + dump) + connectivity(rest, ctx) + near + rng() * (diff === 'easy' ? 25 : 0.3);
    if (score > bestScore) { bestScore = score; bestTile = t; }
  }
  actions.push({ type: 'discard', tileId: bestTile.id });
  return actions;
}

function connectivity(hand: Tile[], ctx: OkeyCtx): number {
  let c = 0;
  const ids = hand.filter((t) => !isJoker(t, ctx)).map((t) => identity(t, ctx));
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j];
      if (a.color === b.color && Math.abs(a.num - b.num) <= 2 && a.num !== b.num) c += 1;
      else if (a.num === b.num && a.color !== b.color) c += 1;
      else if (a.num === b.num && a.color === b.color) c += 0.7;
    }
  return c;
}

/** Tek adımlık karar: her eylemden sonra yeniden planlanır (yeni serilen perlere de işleme yapılabilir). */
export function stepTurn101(v: Okey101View, rng: () => number = Math.random, diff: Difficulty = 'medium'): Bot101Action | null {
  const plan = planTurn101(v, rng, diff);
  return plan.length ? plan[0] : null;
}

/** Taş, masadaki bir perin ucuna 2 adım uzaklıkta mı (bir sonraki işlemeyle işlenebilir hale gelir)? */
function nearTable(table: TableMeld[], t: Tile, ctx: OkeyCtx): number {
  if (isJoker(t, ctx)) return 1;
  const id = identity(t, ctx);
  let k = 0;
  for (const m of table) {
    if (m.kind !== 'run') continue;
    const c = m.slots[0].color;
    if (c !== id.color) continue;
    const lo = m.slots[0].num, hi = m.slots[m.slots.length - 1].num;
    if (id.num === hi + 2 || id.num === lo - 2) k++;
  }
  return k;
}
