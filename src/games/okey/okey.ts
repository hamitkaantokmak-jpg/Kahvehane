/**
 * KLASİK OKEY kural motoru (grafikten bağımsız).
 *
 * Uygulanan varyant (kahvehanelerde en yaygın "20'den düşmeli" okey):
 * - 4 oyuncu, 106 taş. Başlayan oyuncu 15, diğerleri 14 taş alır.
 * - Gösterge açılır; göstergenin bir üstü (aynı renk, 13 → 1) okeydir. Sahte okey okeyin yerine geçer.
 * - Sıra saat yönünün tersine değil, oturma sırasına göre (0 → 1 → 2 → 3) ilerler.
 *   Oyuncu i'nin solundaki oyuncu (bir önceki) i-1'dir; yalnızca onun attığı son taş alınabilir.
 * - Sıra: (ortadan veya soldan) taş çek → bir taş at. Başlayan oyuncu çekmeden atar.
 * - Bitiş: 15 taşla bir taşı ortaya kapalı atıp kalan 14 taşı perlere ayırmak.
 *   Seri: aynı renk ardışık ≥3 (12-13-1 geçerli, 13-1-2 geçersiz). Grup: aynı sayı farklı renk 3-4.
 *   Çift bitiş: 7 çift. Okeyler her taşın yerine geçer.
 * - Puanlama: herkes 20 ile başlar. Normal bitişte diğer oyunculardan 2,
 *   okey atarak bitişte 4, çift bitişte 4, çift + okey atarak bitişte 8 puan düşülür.
 *   İlk turda elindeki gösterge taşını gösteren oyuncu dışındaki herkesten 1 puan düşülür.
 *   Puanı 0 veya altına inen oyuncu olunca maç biter; en yüksek puanlı oyuncu kazanır.
 * - Deste biterse el berabere biter, puan değişmez.
 */
import { Rng, createRng } from '../common/rng';
import {
  MeldRules, OkeyCtx, Tile, canPartitionAll, isJoker, isSevenPairs, shuffledWithIndicator, toCounts, identity,
} from '../common/tiles';

export const OKEY_RULES: MeldRules = { allowWrap: true };
export const START_POINTS = 20;

export type OkeyPhase = 'draw' | 'discard' | 'ended';
export type FinishKind = 'normal' | 'okey' | 'pairs' | 'pairsOkey';

export interface HandResult {
  winner: number | null;
  kind: FinishKind | 'deckEmpty';
  deductions: number[];
  finishTile?: Tile;
}

export interface OkeyState {
  hands: Tile[][];
  deck: Tile[];
  discards: Tile[][];
  indicator: Tile;
  ctx: OkeyCtx;
  current: number;
  starter: number;
  phase: OkeyPhase;
  turn: number;
  /** Her oyuncunun ilk atışını yapıp yapmadığı (gösterge göstermek için). */
  hasDiscarded: boolean[];
  indicatorShownBy: number | null;
  scores: number[];
  handNo: number;
  result: HandResult | null;
  matchOver: boolean;
  /** Son çekilen taş (UI vurgusu için). */
  lastDrawn: number | null;
  log: string[];
}

export const PLAYER_COUNT = 4;

export function newMatch(rng: Rng = createRng(), starter = 0): OkeyState {
  const s: OkeyState = {
    hands: [], deck: [], discards: [], indicator: null as unknown as Tile, ctx: { okeyColor: 0, okeyNum: 1 },
    current: starter, starter, phase: 'discard', turn: 0, hasDiscarded: [], indicatorShownBy: null,
    scores: Array(PLAYER_COUNT).fill(START_POINTS), handNo: 0, result: null, matchOver: false, lastDrawn: null, log: [],
  };
  dealHand(s, rng, starter);
  return s;
}

export function dealHand(s: OkeyState, rng: Rng, starter: number): void {
  const { tiles, indicator, ctx } = shuffledWithIndicator(rng);
  s.indicator = indicator;
  s.ctx = ctx;
  s.hands = [];
  for (let p = 0; p < PLAYER_COUNT; p++) s.hands.push(tiles.splice(0, p === starter ? 15 : 14));
  s.deck = tiles;
  s.discards = Array.from({ length: PLAYER_COUNT }, () => []);
  s.current = starter;
  s.starter = starter;
  s.phase = 'discard';
  s.turn = 0;
  s.hasDiscarded = Array(PLAYER_COUNT).fill(false);
  s.indicatorShownBy = null;
  s.result = null;
  s.lastDrawn = null;
  s.handNo++;
  s.log.push(`El ${s.handNo}: gösterge ${indicator.num} — oyuncu ${starter} başlar.`);
}

export function leftOf(p: number): number {
  return (p + PLAYER_COUNT - 1) % PLAYER_COUNT;
}

export class OkeyError extends Error {}

function assertTurn(s: OkeyState, p: number, phase: OkeyPhase) {
  if (s.phase === 'ended') throw new OkeyError('El bitti.');
  if (s.current !== p) throw new OkeyError('Sıra sende değil.');
  if (s.phase !== phase) throw new OkeyError(phase === 'draw' ? 'Önce taş atmalısın.' : 'Önce taş çekmelisin.');
}

export function drawFromDeck(s: OkeyState, p: number): Tile {
  assertTurn(s, p, 'draw');
  const t = s.deck.pop();
  if (!t) throw new OkeyError('Deste boş.');
  s.hands[p].push(t);
  s.phase = 'discard';
  s.lastDrawn = t.id;
  return t;
}

export function canTakeDiscard(s: OkeyState, p: number): boolean {
  return s.phase === 'draw' && s.current === p && s.discards[leftOf(p)].length > 0;
}

export function drawFromDiscard(s: OkeyState, p: number): Tile {
  assertTurn(s, p, 'draw');
  const pile = s.discards[leftOf(p)];
  const t = pile.pop();
  if (!t) throw new OkeyError('Solundaki oyuncunun attığı taş yok.');
  s.hands[p].push(t);
  s.phase = 'discard';
  s.lastDrawn = t.id;
  return t;
}

export function canShowIndicator(s: OkeyState, p: number): boolean {
  if (s.phase === 'ended' || s.indicatorShownBy !== null || s.hasDiscarded[p]) return false;
  return s.hands[p].some((t) => !t.fake && t.color === s.indicator.color && t.num === s.indicator.num);
}

export function showIndicator(s: OkeyState, p: number): void {
  if (!canShowIndicator(s, p)) throw new OkeyError('Gösterge gösterilemez.');
  s.indicatorShownBy = p;
  for (let i = 0; i < PLAYER_COUNT; i++) if (i !== p) s.scores[i] -= 1;
  s.log.push(`Oyuncu ${p} göstergeyi gösterdi.`);
  checkMatchOver(s);
}

export function discard(s: OkeyState, p: number, tileId: number): Tile {
  assertTurn(s, p, 'discard');
  const hand = s.hands[p];
  const i = hand.findIndex((t) => t.id === tileId);
  if (i < 0) throw new OkeyError('Bu taş elinde değil.');
  const [t] = hand.splice(i, 1);
  s.discards[p].push(t);
  s.hasDiscarded[p] = true;
  s.lastDrawn = null;
  advance(s);
  return t;
}

function advance(s: OkeyState) {
  s.turn++;
  s.current = (s.current + 1) % PLAYER_COUNT;
  s.phase = 'draw';
  if (s.deck.length === 0) {
    s.phase = 'ended';
    s.result = { winner: null, kind: 'deckEmpty', deductions: Array(PLAYER_COUNT).fill(0) };
    s.log.push('Deste bitti, el berabere.');
  }
}

/** 14 taşlık el bitmeye uygun mu? Uygunsa bitiş türünü (perler/çift) verir. */
export function evaluateFinish(tiles: Tile[], ctx: OkeyCtx): 'melds' | 'pairs' | null {
  if (tiles.length !== 14) return null;
  const { counts, jokers } = toCounts(tiles, ctx);
  if (isSevenPairs(counts, jokers)) return 'pairs';
  if (canPartitionAll(counts, jokers, OKEY_RULES)) return 'melds';
  return null;
}

/** Bu taş atılarak bitilebilir mi? */
export function canFinishWith(s: OkeyState, p: number, tileId: number): 'melds' | 'pairs' | null {
  if (s.phase !== 'discard' || s.current !== p) return null;
  const rest = s.hands[p].filter((t) => t.id !== tileId);
  if (rest.length !== 14) return null;
  return evaluateFinish(rest, s.ctx);
}

export function finish(s: OkeyState, p: number, tileId: number): HandResult {
  assertTurn(s, p, 'discard');
  const how = canFinishWith(s, p, tileId);
  if (!how) throw new OkeyError('Bu el bitmeye uygun değil.');
  const hand = s.hands[p];
  const t = hand.splice(hand.findIndex((x) => x.id === tileId), 1)[0];
  const okeyFinish = isJoker(t, s.ctx);
  const kind: FinishKind = how === 'pairs' ? (okeyFinish ? 'pairsOkey' : 'pairs') : okeyFinish ? 'okey' : 'normal';
  const pts = { normal: 2, okey: 4, pairs: 4, pairsOkey: 8 }[kind];
  const deductions = Array(PLAYER_COUNT).fill(0).map((_, i) => (i === p ? 0 : pts));
  deductions.forEach((d, i) => (s.scores[i] -= d));
  s.phase = 'ended';
  s.result = { winner: p, kind, deductions, finishTile: t };
  s.log.push(`Oyuncu ${p} bitti (${kind}).`);
  checkMatchOver(s);
  return s.result;
}

function checkMatchOver(s: OkeyState) {
  if (s.scores.some((x) => x <= 0)) {
    s.matchOver = true;
    s.phase = 'ended';
    if (!s.result) s.result = { winner: null, kind: 'deckEmpty', deductions: Array(PLAYER_COUNT).fill(0) };
  }
}

export function matchWinner(s: OkeyState): number {
  let best = 0;
  for (let i = 1; i < PLAYER_COUNT; i++) if (s.scores[i] > s.scores[best]) best = i;
  return best;
}

export function nextHand(s: OkeyState, rng: Rng = createRng()): void {
  if (s.matchOver) throw new OkeyError('Maç bitti.');
  const starter = s.result?.winner ?? (s.starter + 1) % PLAYER_COUNT;
  dealHand(s, rng, starter);
}

/** Botların görebileceği bilgi: kendi eli + açık bilgiler. Gizli taşlar yok. */
export interface OkeyView {
  me: number;
  hand: Tile[];
  discardTops: (Tile | null)[];
  discardHistory: Tile[][];
  indicator: Tile;
  ctx: OkeyCtx;
  deckCount: number;
  phase: OkeyPhase;
  current: number;
  canShowIndicator: boolean;
}

export function viewFor(s: OkeyState, p: number): OkeyView {
  return {
    me: p,
    hand: s.hands[p].map((t) => ({ ...t })),
    discardTops: s.discards.map((d) => (d.length ? { ...d[d.length - 1] } : null)),
    discardHistory: s.discards.map((d) => d.map((t) => ({ ...t }))),
    indicator: { ...s.indicator },
    ctx: { ...s.ctx },
    deckCount: s.deck.length,
    phase: s.phase,
    current: s.current,
    canShowIndicator: canShowIndicator(s, p),
  };
}

export { identity };
