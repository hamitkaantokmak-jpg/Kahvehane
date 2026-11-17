/**
 * 101 OKEY kural motoru (grafikten bağımsız). Klasik Okey'den tamamen ayrı kurallar.
 *
 * UYGULANAN VARYANT (standart / katlamasız 101):
 * - 4 oyuncu, 106 taş. Başlayan 22, diğerleri 21 taş. Gösterge + okey + sahte okey klasikteki gibi.
 * - Seri: aynı renk ardışık ≥3 (13-1 bağlantısı YOK). Grup: aynı sayı farklı renk 3-4.
 * - El açma (seri): aynı turda masaya açılan perlerin toplam değeri ≥ 101 olmalı.
 *   Okey, temsil ettiği taşın değerini alır.
 * - Çift açma: aynı turda en az 5 çift. Çift = aynı renk aynı sayı iki taş (okey her taşla çift olur).
 * - Açan oyuncu sonraki turlarda: seriyle açtıysa yeni seri/grup, çiftle açtıysa yeni çift açabilir.
 *   Her iki tür de masadaki seri/gruplara taş işleyebilir. Çiftlere taş işlenmez.
 *   Taş işlemek için önce el açmış olmak gerekir (açtığı turda da işleyebilir).
 * - Soldan (bir önceki oyuncunun attığı) taş alınırsa o tur kullanılmalıdır (per veya işleme).
 *   Açmamış oyuncu yerden taş alırsa o tur açmak zorundadır. Kullanılmazsa atış yapılamaz;
 *   oyuncu "geri koy" ile taşı iade edebilir (bu uygulamada ceza yerine geri alma hakkı tanınır).
 * - Atış: her tur bir taş atılır. Masadaki perlere işlenebilecek bir taşı atmak +101 ceza,
 *   okey atmak (bitiş hariç) +101 cezadır.
 * - Bitiş: el boşalacak şekilde son taşı atmak. Elde taş kalmadan atış yapılamaz (son taş atılır).
 * - El sonu puanları (düşük puan iyidir):
 *     kazanan −101; elden bitme (aynı turda açıp bitme) ×2; okey atarak bitme ×2 (çarpanlar birikir).
 *     açmamış oyuncular: +202 × çarpan.
 *     açmış oyuncular: elde kalan taşların toplamı × çarpan (okey 101 sayılır); çiftle açanlar ×2.
 * - Deste biterse el biter: kazanan yok, açmamışlar +202, açmışlar elindeki toplam (çiftçi ×2).
 * - Seri maç: belirlenen el sayısı sonunda toplam puanı en düşük olan kazanır.
 * - Katlamalı 101 vb. varyantlar `Okey101Options` üzerinden eklenebilir (şu an kapalı).
 */
import { Rng, createRng } from '../common/rng';
import {
  MeldRules, OkeyCtx, Tile, isJoker, isPair, penaltyValue, shuffledWithIndicator, validateMeld, TileColor, identity,
} from '../common/tiles';

export const RULES_101: MeldRules = { allowWrap: false };
export const PLAYERS = 4;
export const OPEN_MIN = 101;
export const PAIR_MIN = 5;

export interface Okey101Options {
  hands: number;
  /**
   * Katlamalı (yükselen açış) 101: aynı elde her yeni seri açış, o ana kadarki en yüksek seri açıştan
   * en az 1 fazla olmalı; her yeni çift açış, en çok çiftle açılandan en az 1 çift fazla olmalı.
   */
  doubling?: boolean;
}

export type TableMeldKind = 'run' | 'group' | 'pair';

export interface TableMeld {
  id: number;
  owner: number;
  kind: TableMeldKind;
  /** Seri için sıralı (küçükten büyüğe), grup/çift için ekleme sırası. */
  tiles: Tile[];
  /** Taşların temsil ettiği değerler (okey için). */
  slots: { tileId: number; color: TileColor; num: number }[];
}

export type OpenType = 'none' | 'melds' | 'pairs';

export interface Hand101Result {
  winner: number | null;
  elden: boolean;
  okeyFinish: boolean;
  points: number[];
}

export interface Okey101State {
  options: Okey101Options;
  hands: Tile[][];
  deck: Tile[];
  discards: Tile[][];
  indicator: Tile;
  ctx: OkeyCtx;
  current: number;
  starter: number;
  phase: 'draw' | 'play' | 'ended';
  table: TableMeld[];
  opened: OpenType[];
  /** Bu tur yerden alınan ve henüz kullanılmamış taş. */
  takenDiscard: number | null;
  /** Bu tur açtı mı (elden bitme için). */
  openedThisTurn: boolean;
  /** El başından beri açmışlık (bu tur öncesi). */
  openedBeforeTurn: boolean;
  /** Bu tur yapılan hamle var mı (geri koy için). */
  actedThisTurn: boolean;
  penalties: number[];
  /** Bu eldeki en yüksek seri açış değeri ve en çok çift sayısı (katlamalı için) */
  maxOpen: number;
  maxPairs: number;
  totals: number[];
  handNo: number;
  result: Hand101Result | null;
  matchOver: boolean;
  nextMeldId: number;
  log: string[];
}

export class Okey101Error extends Error {}

export function newMatch101(rng: Rng = createRng(), options: Okey101Options = { hands: 5 }, starter = 0): Okey101State {
  const s = {
    options, totals: Array(PLAYERS).fill(0), handNo: 0, log: [], nextMeldId: 1, matchOver: false,
  } as unknown as Okey101State;
  deal101(s, rng, starter);
  return s;
}

export function deal101(s: Okey101State, rng: Rng, starter: number) {
  const { tiles, indicator, ctx } = shuffledWithIndicator(rng);
  s.indicator = indicator;
  s.ctx = ctx;
  s.hands = [];
  for (let p = 0; p < PLAYERS; p++) s.hands.push(tiles.splice(0, p === starter ? 22 : 21));
  s.deck = tiles;
  s.discards = Array.from({ length: PLAYERS }, () => []);
  s.current = starter;
  s.starter = starter;
  s.phase = 'play';
  s.table = [];
  s.opened = Array(PLAYERS).fill('none');
  s.maxOpen = 0;
  s.maxPairs = 0;
  s.takenDiscard = null;
  s.openedThisTurn = false;
  s.openedBeforeTurn = false;
  s.actedThisTurn = false;
  s.penalties = Array(PLAYERS).fill(0);
  s.result = null;
  s.handNo++;
}

const leftOf = (p: number) => (p + PLAYERS - 1) % PLAYERS;

function assertPlayer(s: Okey101State, p: number) {
  if (s.phase === 'ended') throw new Okey101Error('El bitti.');
  if (s.current !== p) throw new Okey101Error('Sıra sende değil.');
}

function takeFromHand(s: Okey101State, p: number, ids: number[]): Tile[] {
  const hand = s.hands[p];
  const out: Tile[] = [];
  for (const id of ids) {
    const t = hand.find((x) => x.id === id);
    if (!t || out.includes(t)) throw new Okey101Error('Taş elinde değil.');
    out.push(t);
  }
  return out;
}

function removeFromHand(s: Okey101State, p: number, tiles: Tile[]) {
  s.hands[p] = s.hands[p].filter((t) => !tiles.includes(t));
  if (s.takenDiscard !== null && tiles.some((t) => t.id === s.takenDiscard)) s.takenDiscard = null;
}

export function drawDeck101(s: Okey101State, p: number): Tile {
  assertPlayer(s, p);
  if (s.phase !== 'draw') throw new Okey101Error('Zaten taş çektin.');
  const t = s.deck.pop();
  if (!t) throw new Okey101Error('Deste boş.');
  s.hands[p].push(t);
  s.phase = 'play';
  return t;
}

export function drawDiscard101(s: Okey101State, p: number): Tile {
  assertPlayer(s, p);
  if (s.phase !== 'draw') throw new Okey101Error('Zaten taş çektin.');
  const t = s.discards[leftOf(p)].pop();
  if (!t) throw new Okey101Error('Alınacak taş yok.');
  s.hands[p].push(t);
  s.phase = 'play';
  s.takenDiscard = t.id;
  return t;
}

/** Yerden alınan taş henüz kullanılmadıysa iade et (bu tur başka hamle yapılmadıysa). */
export function returnDiscard101(s: Okey101State, p: number): void {
  assertPlayer(s, p);
  if (s.takenDiscard === null || s.actedThisTurn) throw new Okey101Error('Geri koyulamaz.');
  const id = s.takenDiscard;
  const i = s.hands[p].findIndex((t) => t.id === id);
  const [t] = s.hands[p].splice(i, 1);
  s.discards[leftOf(p)].push(t);
  s.takenDiscard = null;
  s.phase = 'draw';
}

/** Per adayını doğrula (açma ve sonraki serme için). */
export function checkMeld(tiles: Tile[], ctx: OkeyCtx): { kind: 'run' | 'group'; value: number; slots: TableMeld['slots'] } | null {
  const m = validateMeld(tiles, ctx, RULES_101);
  if (!m) return null;
  return { kind: m.kind, value: m.value, slots: m.slots };
}

export function pairValue(a: Tile, b: Tile, ctx: OkeyCtx): number {
  const real = [a, b].find((t) => !isJoker(t, ctx));
  return real ? identity(real, ctx).num * 2 : 0;
}

/**
 * El açma. `groups` her biri taş id listesi. Seri açmada her grup bir per, çift açmada her grup 2 taş.
 */
/** Bu elde seriyle açmak için gereken en düşük değer. */
export function openMin(s: Pick<Okey101State, 'options' | 'maxOpen'>): number {
  return s.options.doubling ? Math.max(OPEN_MIN, s.maxOpen + 1) : OPEN_MIN;
}
/** Bu elde çiftle açmak için gereken en az çift sayısı. */
export function pairMin(s: Pick<Okey101State, 'options' | 'maxPairs'>): number {
  return s.options.doubling ? Math.max(PAIR_MIN, s.maxPairs + 1) : PAIR_MIN;
}

export function open101(s: Okey101State, p: number, type: 'melds' | 'pairs', groups: number[][]): number {
  assertPlayer(s, p);
  if (s.phase !== 'play') throw new Okey101Error('Önce taş çek.');
  if (s.opened[p] !== 'none') throw new Okey101Error('Zaten açtın.');
  const all = groups.flat();
  if (new Set(all).size !== all.length) throw new Okey101Error('Aynı taş iki kez kullanılamaz.');
  const tileGroups = groups.map((g) => takeFromHand(s, p, g));
  if (s.hands[p].length - all.length < 1) throw new Okey101Error('Atmak için en az bir taş kalmalı.');
  let total = 0;
  const newMelds: TableMeld[] = [];
  if (type === 'melds') {
    for (const g of tileGroups) {
      const m = checkMeld(g, s.ctx);
      if (!m) throw new Okey101Error('Geçersiz per.');
      total += m.value;
      newMelds.push({ id: 0, owner: p, kind: m.kind, tiles: orderTiles(g, m.slots), slots: m.slots });
    }
    const need = openMin(s);
    if (total < need) throw new Okey101Error(`Açmak için en az ${need} gerekli (şu an ${total}).`);
  } else {
    for (const g of tileGroups) {
      if (g.length !== 2 || !isPair(g[0], g[1], s.ctx)) throw new Okey101Error('Geçersiz çift.');
      total++;
      newMelds.push({ id: 0, owner: p, kind: 'pair', tiles: g, slots: pairSlots(g, s.ctx) });
    }
    const needP = pairMin(s);
    if (total < needP) throw new Okey101Error(`Çift açmak için en az ${needP} çift gerekli.`);
  }
  for (const m of newMelds) { m.id = s.nextMeldId++; s.table.push(m); }
  removeFromHand(s, p, tileGroups.flat());
  s.opened[p] = type;
  if (type === 'melds') s.maxOpen = Math.max(s.maxOpen, total); else s.maxPairs = Math.max(s.maxPairs, total);
  s.openedThisTurn = true;
  s.actedThisTurn = true;
  s.log.push(`Oyuncu ${p} ${type === 'pairs' ? 'çift' : total} ile açtı.`);
  return total;
}

function pairSlots(g: Tile[], ctx: OkeyCtx): TableMeld['slots'] {
  const real = g.find((t) => !isJoker(t, ctx));
  const id = real ? identity(real, ctx) : { color: 0 as TileColor, num: 0 };
  return g.map((t) => ({ tileId: t.id, color: id.color, num: id.num }));
}

function orderTiles(g: Tile[], slots: TableMeld['slots']): Tile[] {
  return slots.map((sl) => g.find((t) => t.id === sl.tileId)!);
}

/** Açtıktan sonra yeni per / çift sermek. */
export function layMeld101(s: Okey101State, p: number, ids: number[]): TableMeld {
  assertPlayer(s, p);
  if (s.phase !== 'play') throw new Okey101Error('Önce taş çek.');
  if (s.opened[p] === 'none') throw new Okey101Error('Önce el açmalısın.');
  const tiles = takeFromHand(s, p, ids);
  if (s.hands[p].length - tiles.length < 1) throw new Okey101Error('Atmak için en az bir taş kalmalı.');
  let meld: TableMeld;
  if (s.opened[p] === 'pairs') {
    if (tiles.length !== 2 || !isPair(tiles[0], tiles[1], s.ctx)) throw new Okey101Error('Çiftle açtığın için yalnızca çift serebilirsin.');
    meld = { id: s.nextMeldId++, owner: p, kind: 'pair', tiles, slots: pairSlots(tiles, s.ctx) };
  } else {
    const m = checkMeld(tiles, s.ctx);
    if (!m) throw new Okey101Error('Geçersiz per.');
    meld = { id: s.nextMeldId++, owner: p, kind: m.kind, tiles: orderTiles(tiles, m.slots), slots: m.slots };
  }
  s.table.push(meld);
  removeFromHand(s, p, tiles);
  s.actedThisTurn = true;
  return meld;
}

/**
 * Okey değiştirme: masadaki bir perde okeyin temsil ettiği taş elde varsa, okey alınıp yerine o taş konur.
 * Seride tam kimlik (renk+sayı) gerekir; grupta aynı sayıdan, grupta olmayan renkte bir taş yeter.
 * Bu uygulamada yalnızca el açmış oyuncu okey alabilir. Sonuç: değiştirilecek slot indeksi ya da -1.
 */
export function jokerSwapSlot(meld: TableMeld, tile: Tile, ctx: OkeyCtx): number {
  if (meld.kind === 'pair' || isJoker(tile, ctx)) return -1;
  const id = identity(tile, ctx);
  for (let i = 0; i < meld.slots.length; i++) {
    const sl = meld.slots[i];
    const t = meld.tiles.find((x) => x.id === sl.tileId)!;
    if (!isJoker(t, ctx)) continue;
    if (meld.kind === 'run' && sl.color === id.color && sl.num === id.num) return i;
    if (meld.kind === 'group' && sl.num === id.num) {
      const colors = meld.tiles.filter((x) => !isJoker(x, ctx)).map((x) => identity(x, ctx).color);
      if (!colors.includes(id.color)) return i;
    }
  }
  return -1;
}

export function swapJoker101(s: Okey101State, p: number, tileId: number, meldId: number): Tile {
  assertPlayer(s, p);
  if (s.phase !== 'play') throw new Okey101Error('Önce taş çek.');
  if (s.opened[p] === 'none') throw new Okey101Error('Okey almak için önce el açmalısın.');
  const [tile] = takeFromHand(s, p, [tileId]);
  const meld = s.table.find((m) => m.id === meldId);
  if (!meld) throw new Okey101Error('Per bulunamadı.');
  const i = jokerSwapSlot(meld, tile, s.ctx);
  if (i < 0) throw new Okey101Error('Bu taşla bu perdeki okey alınamaz.');
  const sl = meld.slots[i];
  const joker = meld.tiles.find((x) => x.id === sl.tileId)!;
  const id = identity(tile, s.ctx);
  meld.slots[i] = { tileId: tile.id, color: id.color, num: id.num };
  meld.tiles = meld.tiles.map((x) => (x.id === joker.id ? tile : x));
  removeFromHand(s, p, [tile]);
  s.hands[p].push(joker);
  s.actedThisTurn = true;
  s.log.push(`Oyuncu ${p} masadan okeyi aldı.`);
  return joker;
}

/** Bir taşın masadaki bir pere işlenip işlenemeyeceği. Sonuç: yeni slot listesi. */
export function tryExtend(meld: TableMeld, tile: Tile, ctx: OkeyCtx): TableMeld['slots'] | null {
  if (meld.kind === 'pair') return null;
  const tiles = [...meld.tiles, tile];
  if (meld.kind === 'group') {
    const m = validateMeld(tiles, ctx, RULES_101);
    return m && m.kind === 'group' ? m.slots : null;
  }
  // seri: mevcut slotların sabit kalması gerekir; uçlara eklenir
  const color = meld.slots[0].color;
  const first = meld.slots[0].num;
  const last = meld.slots[meld.slots.length - 1].num;
  const fits = (n: number) => {
    if (n < 1 || n > 13) return false;
    if (isJoker(tile, ctx)) return true;
    const id = identity(tile, ctx);
    return id.color === color && id.num === n;
  };
  if (fits(last + 1)) return [...meld.slots, { tileId: tile.id, color, num: last + 1 }];
  if (fits(first - 1)) return [{ tileId: tile.id, color, num: first - 1 }, ...meld.slots];
  return null;
}

export function addToMeld101(s: Okey101State, p: number, tileId: number, meldId: number): void {
  assertPlayer(s, p);
  if (s.phase !== 'play') throw new Okey101Error('Önce taş çek.');
  if (s.opened[p] === 'none') throw new Okey101Error('İşlemek için önce el açmalısın.');
  const [tile] = takeFromHand(s, p, [tileId]);
  if (s.hands[p].length - 1 < 1) throw new Okey101Error('Atmak için en az bir taş kalmalı.');
  const meld = s.table.find((m) => m.id === meldId);
  if (!meld) throw new Okey101Error('Per bulunamadı.');
  const slots = tryExtend(meld, tile, s.ctx);
  if (!slots) throw new Okey101Error('Bu taş bu pere işlenemez.');
  meld.slots = slots;
  meld.tiles = slots.map((sl) => (sl.tileId === tile.id ? tile : meld.tiles.find((t) => t.id === sl.tileId)!));
  removeFromHand(s, p, [tile]);
  s.actedThisTurn = true;
}

/** Taş masadaki herhangi bir pere işlenebilir mi? */
export function isProcessable(s: Okey101State, tile: Tile): boolean {
  if (isJoker(tile, s.ctx)) return false; // okey cezası ayrı hesaplanır
  return s.table.some((m) => tryExtend(m, tile, s.ctx) !== null);
}

export function discardPenalty(s: Okey101State, p: number, tileId: number): number {
  const tile = s.hands[p].find((t) => t.id === tileId);
  if (!tile) return 0;
  const finishing = s.hands[p].length === 1;
  if (finishing) return 0;
  if (isJoker(tile, s.ctx)) return 101;
  if (isProcessable(s, tile)) return 101;
  return 0;
}

export function canDiscard101(s: Okey101State, p: number): string | null {
  if (s.phase === 'ended') return 'El bitti.';
  if (s.current !== p) return 'Sıra sende değil.';
  if (s.phase !== 'play') return 'Önce taş çek.';
  if (s.takenDiscard !== null) {
    return s.opened[p] === 'none'
      ? 'Yerden aldığın taşla bu tur açmalısın (ya da geri koy).'
      : 'Yerden aldığın taşı bu tur kullanmalısın (ya da geri koy).';
  }
  return null;
}

export function discard101(s: Okey101State, p: number, tileId: number): { penalty: number; finished: boolean } {
  const err = canDiscard101(s, p);
  if (err) throw new Okey101Error(err);
  const [tile] = takeFromHand(s, p, [tileId]);
  const penalty = discardPenalty(s, p, tileId);
  if (penalty) {
    s.penalties[p] += penalty;
    s.log.push(`Oyuncu ${p} ${isJoker(tile, s.ctx) ? 'okey attı' : 'işlek taş attı'}: +${penalty} ceza.`);
  }
  removeFromHand(s, p, [tile]);
  s.discards[p].push(tile);
  if (s.hands[p].length === 0) {
    finishHand(s, p, isJoker(tile, s.ctx));
    return { penalty, finished: true };
  }
  s.current = (p + 1) % PLAYERS;
  s.phase = 'draw';
  s.takenDiscard = null;
  s.openedBeforeTurn = s.opened[s.current] !== 'none';
  s.openedThisTurn = false;
  s.actedThisTurn = false;
  if (s.deck.length === 0) finishHand(s, null, false);
  return { penalty, finished: false };
}

export function handValue(tiles: Tile[], ctx: OkeyCtx): number {
  return tiles.reduce((a, t) => a + penaltyValue(t, ctx), 0);
}

function finishHand(s: Okey101State, winner: number | null, okeyFinish: boolean) {
  const elden = winner !== null && !s.openedBeforeTurn && s.openedThisTurn;
  let mult = 1;
  if (elden) mult *= 2;
  if (okeyFinish) mult *= 2;
  const points = Array(PLAYERS).fill(0);
  for (let i = 0; i < PLAYERS; i++) {
    if (i === winner) points[i] = -101 * mult;
    else if (s.opened[i] === 'none') points[i] = 202 * mult;
    else points[i] = handValue(s.hands[i], s.ctx) * mult * (s.opened[i] === 'pairs' ? 2 : 1);
    points[i] += s.penalties[i];
    s.totals[i] += points[i];
  }
  s.phase = 'ended';
  s.result = { winner, elden, okeyFinish, points };
  if (s.handNo >= s.options.hands) s.matchOver = true;
  s.log.push(winner === null ? 'Deste bitti.' : `Oyuncu ${winner} bitti${elden ? ' (elden)' : ''}${okeyFinish ? ' (okeyle)' : ''}.`);
}

export function nextHand101(s: Okey101State, rng: Rng = createRng()) {
  if (s.matchOver) throw new Okey101Error('Maç bitti.');
  deal101(s, rng, (s.starter + 1) % PLAYERS);
}

export function matchWinner101(s: Okey101State): number {
  let best = 0;
  for (let i = 1; i < PLAYERS; i++) if (s.totals[i] < s.totals[best]) best = i;
  return best;
}

export interface Okey101View {
  me: number;
  hand: Tile[];
  ctx: OkeyCtx;
  indicator: Tile;
  table: TableMeld[];
  opened: OpenType[];
  discardTops: (Tile | null)[];
  deckCount: number;
  phase: Okey101State['phase'];
  current: number;
  takenDiscard: number | null;
  handSizes: number[];
  openMin: number;
  pairMin: number;
}

export function view101(s: Okey101State, p: number): Okey101View {
  const clone = (t: Tile) => ({ ...t });
  return {
    me: p,
    hand: s.hands[p].map(clone),
    ctx: { ...s.ctx },
    indicator: clone(s.indicator),
    table: s.table.map((m) => ({ ...m, tiles: m.tiles.map(clone), slots: m.slots.map((x) => ({ ...x })) })),
    opened: [...s.opened],
    discardTops: s.discards.map((d) => (d.length ? clone(d[d.length - 1]) : null)),
    deckCount: s.deck.length,
    phase: s.phase,
    current: s.current,
    takenDiscard: s.takenDiscard,
    handSizes: s.hands.map((h) => h.length),
    openMin: openMin(s),
    pairMin: pairMin(s),
  };
}
