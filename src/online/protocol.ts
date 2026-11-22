/**
 * Çevrimiçi masa protokolü (istemci ↔ oda sunucusu). Saf tipler ve sabitler; tarayıcıda ve Cloudflare Worker'da aynı dosya.
 *
 * İlkeler:
 * - Sunucu yetkilidir: kurallar sunucuda çalışır, istemci yalnızca niyet (hamle) gönderir.
 * - Herkes yalnızca kendi elini görür: sunucu her oyuncuya ayrı, gizli bilgisi çıkarılmış durum yollar.
 * - Serbest yazışma yok: yalnızca hazır sataşma kalıpları. Kaos oyunun sonucunu asla etkilemez.
 * - Para tamamen oyun içi ve sanaldır; çevrimiçi masada bahis yoktur.
 */
import type { CharacterSpec } from '../characters/CharacterSpec';

export const PROTOCOL_VERSION = 1;

export type OnlineGameId = 'batak' | 'king' | 'pisti2' | 'pisti4' | 'okey' | 'okey101' | 'tavla';
export const ONLINE_GAMES: OnlineGameId[] = ['batak', 'king', 'pisti4', 'pisti2', 'okey', 'okey101', 'tavla'];
export const SEATS_OF: Record<OnlineGameId, number> = { batak: 4, king: 4, pisti4: 4, pisti2: 2, okey: 4, okey101: 4, tavla: 2 };

/** Oda bir masa türüne bağlıdır (kart, okey ya da tavla masası); oda sahibi yalnızca o masanın oyunlarını seçebilir */
export type RoomKind = 'kart' | 'okey' | 'tavla';
export const ROOM_KINDS: RoomKind[] = ['kart', 'okey', 'tavla'];
export const GAMES_OF_KIND: Record<RoomKind, OnlineGameId[]> = { kart: ['batak', 'king', 'pisti4', 'pisti2'], okey: ['okey', 'okey101'], tavla: ['tavla'] };
export const kindOfGame = (g: OnlineGameId): RoomKind => (ROOM_KINDS.find((k) => GAMES_OF_KIND[k].includes(g)) ?? 'kart');

export type ChaosPref = 'calm' | 'normal' | 'chaos';
export type ChaosKind = 'objection' | 'slam' | 'tea' | 'flip' | 'taunt';

/** Hazır sataşma kalıpları (serbest yazışma yerine) — sevimli, kimseyi aşağılamayan sözler */
export const TAUNTS = [
  'Hadi oyna, çay soğudu!',
  'Helal olsun, güzel oynadın!',
  'Bu ne şans be!',
  'Bu el benim, haberin olsun!',
  'Kartları kim karıştırdı?',
  'Bir dahakine görüşürüz!',
  'Şükrü, bu masaya çay!',
  'Ustalık konuşuyor!',
] as const;

export interface OnlineOptions {
  batakPartners: boolean;
  batakHands: number;
  batakZeroPenalty: boolean;
  kingShort: boolean;
  pistiTarget: number;
  okey101Hands: number;
  okey101Doubling: boolean;
  tavlaTarget: number;
  tavlaKatmerli: boolean;
  difficulty: 'easy' | 'medium' | 'hard';
}
export const DEFAULT_OPTIONS: OnlineOptions = { batakPartners: false, batakHands: 5, batakZeroPenalty: false, kingShort: true, pistiTarget: 101, okey101Hands: 3, okey101Doubling: false, tavlaTarget: 5, tavlaKatmerli: true, difficulty: 'medium' };

/** Oyun hamleleri (oyuna göre) */
export type GameAction =
  | { k: 'bid'; b: number | 'pass' }
  | { k: 'trump'; suit: 0 | 1 | 2 | 3 }
  | { k: 'contract'; c: string }
  | { k: 'play'; id: number }
  // okey / 101
  | { k: 'draw'; from: 'deck' | 'left' }
  | { k: 'discard'; id: number }
  | { k: 'finish'; id: number }
  | { k: 'indicator' }
  | { k: 'return' }
  | { k: 'returnDraw' }
  | { k: 'open'; mode: 'melds' | 'pairs'; groups: number[][] }
  | { k: 'lay'; ids: number[] }
  | { k: 'add'; id: number; meld: number }
  | { k: 'swap'; id: number; meld: number }
  // tavla
  | { k: 'opening' }
  | { k: 'roll' }
  | { k: 'move'; from: number | 'bar'; to: number | 'off' }
  | { k: 'undo' }
  | { k: 'end' };

export type ClientMsg =
  | { t: 'hello'; v: number; name: string; spec: unknown; chaos: ChaosPref; token?: string }
  | { t: 'seat'; seat: number }
  | { t: 'config'; game: OnlineGameId; options: Partial<OnlineOptions> }
  | { t: 'start' }
  | { t: 'act'; a: GameAction }
  | { t: 'next' }
  | { t: 'chaos'; kind: ChaosKind; target?: number; phrase?: number }
  | { t: 'pref'; chaos: ChaosPref }
  | { t: 'mute'; player: string; on: boolean }
  | { t: 'ping' };

export interface SeatView {
  occ: 'human' | 'bot' | 'empty';
  name: string;
  player?: string;
  spec?: CharacterSpec;
  connected?: boolean;
  chaos?: ChaosPref;
}

export interface RoomView {
  code: string;
  host: string | null;
  phase: 'lobby' | 'playing';
  kind: RoomKind;
  game: OnlineGameId;
  options: OnlineOptions;
  seats: SeatView[];
  /** son maçın sonucu (lobide gösterilir) */
  lastResult: { game: OnlineGameId; winners: number[]; names: string[]; totals: number[] } | null;
}

export type ServerMsg =
  | { t: 'welcome'; you: string; token: string; seat: number | null; room: RoomView }
  | { t: 'room'; room: RoomView; seat: number | null }
  | { t: 'state'; seq: number; game: OnlineGameId; seat: number; view: unknown; event: GameEvent | null }
  | { t: 'chaos'; from: number; kind: ChaosKind; target?: number; phrase?: number }
  | { t: 'error'; msg: string }
  | { t: 'pong' };

/** Son hamlenin özeti (istemci animasyon/tepki için) */
export interface GameEvent {
  seat: number;
  action: GameAction | { k: 'next' };
  trickDone?: boolean;
  winner?: number | null;
  handOver?: boolean;
  pisti?: number;
  /** 101: atışta yazılan ceza */
  penalty?: number;
  /** tavla: pul kırıldı */
  hit?: boolean;
}

/** Kısa oda kodu: karışabilecek harfler (I, O, 0, 1) yok */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LEN = 4;
export function makeCode(rng: () => number): string {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return s;
}
export const isCode = (s: unknown): s is string => typeof s === 'string' && s.length === CODE_LEN && [...s].every((c) => CODE_ALPHABET.includes(c));

/** Gelen mesajın kabaca şekil kontrolü (ayrıntılı doğrulama odada) */
export function parseClientMsg(raw: string): ClientMsg | null {
  if (typeof raw !== 'string' || raw.length > 8192) return null;
  try {
    const m = JSON.parse(raw) as ClientMsg;
    return m && typeof m === 'object' && typeof (m as { t?: unknown }).t === 'string' ? m : null;
  } catch { return null; }
}
