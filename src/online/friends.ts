/**
 * Arkadaş listesi ve "kim çevrimiçi" — saf kurallar ve mesajlar (tarayıcı + Cloudflare Worker ortak).
 *
 * - Hesap yok: her oyuncuya rastgele 6 harflik bir ARKADAŞ KODU verilir; yanında tarayıcıda saklanan gizli bir anahtar
 *   vardır (kodu başkası sahiplenemez). Sunucuya ad/e-posta gitmez; yalnızca kod ve masada görünen takma ad.
 * - KARŞILIKLI: birinin çevrimiçi olduğunu ancak o da seni eklediyse görürsün; masaya çağırma da yalnızca karşılıklı.
 * - "Görünmez" olan herkese çevrimdışı görünür.
 */
import { CODE_ALPHABET } from './protocol';

export const FRIEND_CODE_LEN = 6;
export const MAX_FRIENDS = 50;
export const INVITE_GAP = 5000;

export const isFriendCode = (s: unknown): s is string => typeof s === 'string' && s.length === FRIEND_CODE_LEN && [...s].every((c) => CODE_ALPHABET.includes(c));

export function makeFriendCode(rng: () => number): string {
  let s = '';
  for (let i = 0; i < FRIEND_CODE_LEN; i++) s += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return s;
}

/** Bir bağlantının (sekmenin) durumu — sunucuda WebSocket ekinde saklanır */
export interface Conn {
  code: string;
  name: string;
  friends: string[];
  invisible: boolean;
  room: { code: string; kind: string } | null;
  inviteAt?: Record<string, number>;
}

export type FriendState = 'online' | 'offline' | 'pending';
export interface FriendStatus { code: string; state: FriendState; name?: string; room?: { code: string; kind: string } | null }

export type PresenceClientMsg =
  | { t: 'hello'; v: 1; code?: string; secret?: string; name: string; friends: string[]; invisible: boolean }
  | { t: 'friends'; list: string[] }
  | { t: 'status'; room: { code: string; kind: string } | null; name?: string; invisible?: boolean }
  | { t: 'invite'; to: string };

export type PresenceServerMsg =
  | { t: 'me'; code: string; secret: string }
  | { t: 'friends'; list: FriendStatus[] }
  | { t: 'friend'; status: FriendStatus }
  | { t: 'invited'; from: { code: string; name: string }; room: { code: string; kind: string } }
  | { t: 'error'; msg: string };

/** Arkadaş listesini temizle: geçerli kodlar, tekrarsız, en çok 50 */
export const cleanFriends = (x: unknown): string[] => (Array.isArray(x) ? [...new Set(x.filter(isFriendCode))].slice(0, MAX_FRIENDS) : []);

/** `viewer` için `target` kodlu oyuncunun durumu (tüm açık bağlantılar arasından) */
export function statusFor(conns: Conn[], target: string, viewer: string): FriendStatus {
  const mine = conns.filter((c) => c.code === target);
  if (!mine.length) return { code: target, state: 'offline' };
  // karşılıklı değilse çevrimiçi olup olmadığı söylenmez
  if (!mine.some((c) => c.friends.includes(viewer))) return { code: target, state: 'pending' };
  if (mine.every((c) => c.invisible)) return { code: target, state: 'offline' };
  const best = mine.find((c) => c.room && !c.invisible) ?? mine.find((c) => !c.invisible)!;
  return { code: target, state: 'online', name: best.name, room: best.room };
}

/** `changed` kodunun durumu değişti: onu listesinde tutan her bağlantıya güncel durum */
export function updatesFor(conns: Conn[], changed: string): { to: number; msg: PresenceServerMsg }[] {
  const out: { to: number; msg: PresenceServerMsg }[] = [];
  conns.forEach((c, i) => {
    if (c.code !== changed && c.friends.includes(changed)) out.push({ to: i, msg: { t: 'friend', status: statusFor(conns, changed, c.code) } });
  });
  return out;
}

/** Masaya çağır: yalnızca karşılıklı arkadaşlar, gönderen bir odadaysa; aynı kişiye 5 sn'de bir */
export function invite(conns: Conn[], from: number, to: string, now: number): { to: number; msg: PresenceServerMsg }[] {
  const me = conns[from];
  if (!me.room) return [{ to: from, msg: { t: 'error', msg: 'Önce bir odaya gir, sonra çağır.' } }];
  if (!isFriendCode(to) || !me.friends.includes(to)) return [{ to: from, msg: { t: 'error', msg: 'Bu kod arkadaş listende yok.' } }];
  me.inviteAt ??= {};
  if (now - (me.inviteAt[to] ?? -1e12) < INVITE_GAP) return [{ to: from, msg: { t: 'error', msg: 'Az önce çağırdın, biraz bekle.' } }];
  const targets = conns.map((c, i) => ({ c, i })).filter(({ c }) => c.code === to && c.friends.includes(me.code));
  if (!targets.length) return [{ to: from, msg: { t: 'error', msg: 'Arkadaşın çevrimiçi değil ya da seni henüz eklemedi.' } }];
  me.inviteAt[to] = now;
  return targets.map(({ i }) => ({ to: i, msg: { t: 'invited', from: { code: me.code, name: me.name }, room: me.room! } }));
}
