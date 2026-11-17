/**
 * Okey taşları ve per (meld) mantığı — Klasik Okey ve 101 Okey tarafından ortak kullanılır.
 *
 * - 4 renk × 1..13 × 2 kopya = 104 taş + 2 sahte okey = 106 taş.
 * - Gösterge taşının bir üstü (aynı renk) okeydir; 13'ün üstü 1'dir.
 * - Okey taşları joker gibi her taşın yerine geçer.
 * - Sahte okey, okey taşının kendisi (renk + sayı) yerine geçer; joker değildir.
 */
import { Rng, shuffle } from './rng';

export type TileColor = 0 | 1 | 2 | 3;
export const COLOR_NAMES = ['Kırmızı', 'Sarı', 'Mavi', 'Siyah'] as const;
export const COLOR_CSS = ['#d62828', '#e9a100', '#1d5fc4', '#222222'] as const;

export interface Tile {
  id: number;
  color: TileColor;
  num: number; // 1..13 (sahte okeyde 0)
  fake: boolean;
}

export interface OkeyCtx {
  okeyColor: TileColor;
  okeyNum: number;
}

export function createTileSet(): Tile[] {
  const tiles: Tile[] = [];
  let id = 0;
  for (let copy = 0; copy < 2; copy++)
    for (let c = 0; c < 4; c++)
      for (let n = 1; n <= 13; n++) tiles.push({ id: id++, color: c as TileColor, num: n, fake: false });
  tiles.push({ id: id++, color: 0, num: 0, fake: true });
  tiles.push({ id: id++, color: 0, num: 0, fake: true });
  return tiles;
}

/** Karıştırılmış set + gösterge (sahte okey gösterge olamaz). */
export function shuffledWithIndicator(rng: Rng): { tiles: Tile[]; indicator: Tile; ctx: OkeyCtx } {
  const tiles = shuffle(createTileSet(), rng);
  const idx = tiles.findIndex((t) => !t.fake);
  const indicator = tiles.splice(idx, 1)[0];
  const ctx: OkeyCtx = { okeyColor: indicator.color, okeyNum: indicator.num === 13 ? 1 : indicator.num + 1 };
  return { tiles, indicator, ctx };
}

export function isJoker(t: Tile, ctx: OkeyCtx): boolean {
  return !t.fake && t.color === ctx.okeyColor && t.num === ctx.okeyNum;
}

/** Joker olmayan bir taşın oyundaki kimliği (sahte okey → okeyin kimliği). */
export function identity(t: Tile, ctx: OkeyCtx): { color: TileColor; num: number } {
  return t.fake ? { color: ctx.okeyColor, num: ctx.okeyNum } : { color: t.color, num: t.num };
}

export function tileLabel(t: Tile, ctx?: OkeyCtx): string {
  if (t.fake) return 'Sahte Okey';
  const s = `${COLOR_NAMES[t.color]} ${t.num}`;
  return ctx && isJoker(t, ctx) ? `${s} (Okey)` : s;
}

// ---------------------------------------------------------------------------
// Per doğrulama
// ---------------------------------------------------------------------------

export interface MeldRules {
  /** 12-13-1 dizilimine izin ver (Klasik Okey: evet, 101: hayır). */
  allowWrap: boolean;
}

export type MeldKind = 'run' | 'group';

export interface MeldInfo {
  kind: MeldKind;
  /** Okeyler dahil per değeri (101 açma hesabı). */
  value: number;
  /** Seri: renk, başlangıç ve bitiş pozisyonu (14 = 13'ten sonra gelen 1). */
  color?: TileColor;
  start?: number;
  end?: number;
  /** Grup: sayı ve kullanılan renkler. */
  num?: number;
  /** Her taşın temsil ettiği değer, tiles ile aynı sırada (seri için sıralanmış konum). */
  slots: { tileId: number; color: TileColor; num: number }[];
}

/**
 * Bir taş listesinin geçerli bir seri ya da grup olup olmadığını kontrol eder.
 * Sıra önemsizdir; okeylerin yeri, per değerini en yükseğe çıkaracak şekilde seçilir.
 */
export function validateMeld(tiles: Tile[], ctx: OkeyCtx, rules: MeldRules): MeldInfo | null {
  if (tiles.length < 3) return null;
  return validateGroup(tiles, ctx) ?? validateRun(tiles, ctx, rules);
}

function validateGroup(tiles: Tile[], ctx: OkeyCtx): MeldInfo | null {
  if (tiles.length > 4) return null;
  const jokers = tiles.filter((t) => isJoker(t, ctx));
  const real = tiles.filter((t) => !isJoker(t, ctx)).map((t) => ({ t, id: identity(t, ctx) }));
  if (real.length === 0) {
    // sadece okeylerden oluşan grup — teorik (en fazla 2 okey var) — geçersiz
    return null;
  }
  const num = real[0].id.num;
  if (!real.every((r) => r.id.num === num)) return null;
  const colors = new Set(real.map((r) => r.id.color));
  if (colors.size !== real.length) return null;
  const missing = ([0, 1, 2, 3] as TileColor[]).filter((c) => !colors.has(c));
  const slots = real.map((r) => ({ tileId: r.t.id, color: r.id.color, num }));
  jokers.forEach((j, i) => slots.push({ tileId: j.id, color: missing[i], num }));
  return { kind: 'group', value: num * tiles.length, num, slots };
}

function validateRun(tiles: Tile[], ctx: OkeyCtx, rules: MeldRules): MeldInfo | null {
  const len = tiles.length;
  if (len > 13) return null;
  const jokers = tiles.filter((t) => isJoker(t, ctx));
  const real = tiles.filter((t) => !isJoker(t, ctx)).map((t) => ({ t, id: identity(t, ctx) }));
  if (real.length === 0) return null;
  const color = real[0].id.color;
  if (!real.every((r) => r.id.color === color)) return null;
  const maxPos = rules.allowWrap ? 14 : 13;
  let best: MeldInfo | null = null;
  // başlangıç pozisyonunu yukarıdan aşağı dene → en yüksek değerli yerleşim ilk bulunur
  for (let start = maxPos - len + 1; start >= 1; start--) {
    const end = start + len - 1;
    if (end === 14 && start < 2) continue;
    const used = new Map<number, { t: Tile }>();
    let ok = true;
    for (const r of real) {
      let pos = r.id.num;
      if (pos === 1 && end === 14 && start > 1) pos = 14;
      if (pos < start || pos > end || used.has(pos)) { ok = false; break; }
      used.set(pos, { t: r.t });
    }
    if (!ok) continue;
    const slots: MeldInfo['slots'] = [];
    let ji = 0;
    let value = 0;
    for (let p = start; p <= end; p++) {
      const n = p === 14 ? 1 : p;
      const u = used.get(p);
      const tileId = u ? u.t.id : jokers[ji++].id;
      slots.push({ tileId, color, num: n });
      value += n;
    }
    best = { kind: 'run', value, color, start, end, slots };
    break;
  }
  return best;
}

/** İki taş geçerli bir çift mi? (aynı renk aynı sayı; okey her taşla çift olur) */
export function isPair(a: Tile, b: Tile, ctx: OkeyCtx): boolean {
  if (isJoker(a, ctx) || isJoker(b, ctx)) return true;
  const ia = identity(a, ctx);
  const ib = identity(b, ctx);
  return ia.color === ib.color && ia.num === ib.num;
}

/** 101 ceza hesabı için taşın değeri (okey: 101). */
export function penaltyValue(t: Tile, ctx: OkeyCtx): number {
  if (isJoker(t, ctx)) return 101;
  return identity(t, ctx).num;
}

// ---------------------------------------------------------------------------
// El çözümleyici: sayım tabanlı (renk × sayı) temsil üzerinde geri izleme
// ---------------------------------------------------------------------------

/** counts[color*14 + num] */
export type Counts = Int8Array;

export function toCounts(tiles: Tile[], ctx: OkeyCtx): { counts: Counts; jokers: number } {
  const counts = new Int8Array(56);
  let jokers = 0;
  for (const t of tiles) {
    if (isJoker(t, ctx)) jokers++;
    else {
      const id = identity(t, ctx);
      counts[id.color * 14 + id.num]++;
    }
  }
  return { counts, jokers };
}

/** Bir per adayı: kullanılan somut taşlar (renk,sayı) ve joker sayısı. */
export interface MeldCandidate {
  kind: MeldKind;
  concrete: [TileColor, number][];
  jokers: number;
  value: number;
  /** Okeylerin temsil ettiği (renk,sayı) değerleri. */
  jokerAs: [TileColor, number][];
}

/** Verilen (renk,sayı) taşını içeren tüm per adaylarını üretir. */
export function meldsContaining(
  counts: Counts,
  jokers: number,
  color: TileColor,
  num: number,
  rules: MeldRules,
  maxLen = 13,
): MeldCandidate[] {
  const out: MeldCandidate[] = [];
  // Gruplar
  const others = ([0, 1, 2, 3] as TileColor[]).filter((c) => c !== color);
  const availOthers = others.filter((c) => counts[c * 14 + num] > 0);
  const subsets = 1 << availOthers.length;
  for (let m = 0; m < subsets; m++) {
    const chosen = availOthers.filter((_, i) => m & (1 << i));
    for (let j = 0; j <= jokers; j++) {
      const size = 1 + chosen.length + j;
      if (size < 3 || size > 4) continue;
      const missing = others.filter((c) => !chosen.includes(c)).slice(0, j);
      out.push({
        kind: 'group',
        concrete: [[color, num], ...chosen.map((c) => [c, num] as [TileColor, number])],
        jokers: j,
        value: num * size,
        jokerAs: missing.map((c) => [c, num] as [TileColor, number]),
      });
    }
  }
  // Seriler
  const positions = num === 1 && rules.allowWrap ? [1, 14] : [num];
  for (const pos of positions) {
    for (let start = Math.max(1, pos - maxLen + 1); start <= pos; start++) {
      const maxEnd = rules.allowWrap ? 14 : 13;
      for (let end = Math.max(pos, start + 2); end <= Math.min(maxEnd, start + maxLen - 1); end++) {
        if (end === 14 && start < 2) continue;
        // her pozisyon için somut ya da joker
        const need: number[] = [];
        for (let p = start; p <= end; p++) if (p !== pos) need.push(p);
        // geri izleme ile somut/joker seçimleri
        const rec = (i: number, jUsed: number, conc: [TileColor, number][], jAs: [TileColor, number][], used: Map<number, number>) => {
          if (jUsed > jokers) return;
          if (i === need.length) {
            let value = 0;
            for (let p = start; p <= end; p++) value += p === 14 ? 1 : p;
            out.push({ kind: 'run', concrete: [[color, num], ...conc], jokers: jUsed, value, jokerAs: jAs });
            return;
          }
          const p = need[i];
          const n = p === 14 ? 1 : p;
          const key = color * 14 + n;
          const have = counts[key] - (used.get(key) ?? 0) - (n === num ? 1 : 0);
          if (have > 0) {
            used.set(key, (used.get(key) ?? 0) + 1);
            rec(i + 1, jUsed, [...conc, [color, n]], jAs, used);
            used.set(key, used.get(key)! - 1);
          }
          if (jUsed < jokers) rec(i + 1, jUsed + 1, conc, [...jAs, [color, n]], used);
        };
        rec(0, 0, [], [], new Map());
      }
    }
  }
  return out;
}

function firstConcrete(counts: Counts): number {
  for (let i = 0; i < 56; i++) if (counts[i] > 0) return i;
  return -1;
}

function countsKey(counts: Counts, jokers: number): string {
  return String.fromCharCode(...counts) + jokers;
}

/** Tüm taşlar (eksiksiz) perlere ayrılabiliyor mu? */
export function canPartitionAll(counts: Counts, jokers: number, rules: MeldRules, memo = new Map<string, boolean>()): boolean {
  const idx = firstConcrete(counts);
  if (idx < 0) return jokers === 0; // tek başına kalan okeyler per oluşturamaz
  const key = countsKey(counts, jokers);
  const cached = memo.get(key);
  if (cached !== undefined) return cached;
  const color = Math.floor(idx / 14) as TileColor;
  const num = idx % 14;
  let result = false;
  for (const m of meldsContaining(counts, jokers, color, num, rules)) {
    for (const [c, n] of m.concrete) counts[c * 14 + n]--;
    const ok = canPartitionAll(counts, jokers - m.jokers, rules, memo);
    for (const [c, n] of m.concrete) counts[c * 14 + n]++;
    if (ok) { result = true; break; }
  }
  memo.set(key, result);
  return result;
}

/** Çift bitiş: 14 taştan 7 çift. */
export function isSevenPairs(counts: Counts, jokers: number): boolean {
  let singles = 0;
  let pairs = 0;
  for (let i = 0; i < 56; i++) {
    pairs += Math.floor(counts[i] / 2);
    singles += counts[i] % 2;
  }
  if (singles > jokers) return false;
  pairs += singles + Math.floor((jokers - singles) / 2);
  return pairs === 7 && (jokers - singles) % 2 === 0;
}

export interface PartitionResult {
  score: number;
  melds: MeldCandidate[];
}

/**
 * Taşları ayrık perlere bölerek `scoreOf` toplamını en yükseğe çıkarır (taşlar artabilir).
 * Bot değerlendirmesi ve 101 açma hesabı için kullanılır.
 */
export function bestPartition(
  counts: Counts,
  jokers: number,
  rules: MeldRules,
  scoreOf: (m: MeldCandidate) => number,
  memo = new Map<string, PartitionResult>(),
): PartitionResult {
  const idx = firstConcrete(counts);
  if (idx < 0) return { score: 0, melds: [] };
  const key = countsKey(counts, jokers);
  const cached = memo.get(key);
  if (cached) return cached;
  const color = Math.floor(idx / 14) as TileColor;
  const num = idx % 14;
  // seçenek 1: bu taşı kullanma
  counts[idx]--;
  const skip = bestPartition(counts, jokers, rules, scoreOf, memo);
  counts[idx]++;
  let best: PartitionResult = skip;
  for (const m of meldsContaining(counts, jokers, color, num, rules, 13)) {
    for (const [c, n] of m.concrete) counts[c * 14 + n]--;
    const rest = bestPartition(counts, jokers - m.jokers, rules, scoreOf, memo);
    for (const [c, n] of m.concrete) counts[c * 14 + n]++;
    const s = rest.score + scoreOf(m);
    if (s > best.score) best = { score: s, melds: [m, ...rest.melds] };
  }
  memo.set(key, best);
  return best;
}

/** Aday perleri gerçek taş id listelerine çevirir. */
export function candidatesToTiles(cands: MeldCandidate[], hand: Tile[], ctx: OkeyCtx): Tile[][] {
  const pool = [...hand];
  const take = (pred: (t: Tile) => boolean): Tile => {
    const i = pool.findIndex(pred);
    if (i < 0) throw new Error('candidate tile missing');
    return pool.splice(i, 1)[0];
  };
  return cands.map((m) => {
    const tiles: Tile[] = [];
    for (const [c, n] of m.concrete) tiles.push(take((t) => !isJoker(t, ctx) && identity(t, ctx).color === c && identity(t, ctx).num === n));
    for (let i = 0; i < m.jokers; i++) tiles.push(take((t) => isJoker(t, ctx)));
    return tiles;
  });
}

/** Görüntüleme için taşları renk/sayı sırasına diz. */
export function sortTiles(tiles: Tile[], ctx: OkeyCtx): Tile[] {
  return [...tiles].sort((a, b) => {
    const ja = isJoker(a, ctx) ? 1 : 0;
    const jb = isJoker(b, ctx) ? 1 : 0;
    if (ja !== jb) return ja - jb;
    const ia = identity(a, ctx);
    const ib = identity(b, ctx);
    return ia.color - ib.color || ia.num - ib.num;
  });
}
