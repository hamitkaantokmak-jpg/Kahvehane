/**
 * Çevrimiçi oda — saf mantık (ağ, zamanlayıcı, DOM yok). Sunucu (Durable Object) bunu sarar; testler doğrudan kullanır.
 * Zaman (`now`, ms) ve rastgelelik (kayıtlı tohum) dışarıdan gelir; tüm durum JSON'a çevrilebilir (uyuyup uyanan sunucu için).
 *
 * - En çok 4 kişi. Boş koltuklarda bot oynar. Bağlantısı kopan ya da uzun süre oynamayanın yerine bot oynar; geri gelince devam eder.
 * - Oda sahibi oyunu ve seçenekleri belirler, maçı başlatır. Sahip ayrılırsa sahiplik bağlı olan ilk kişiye geçer.
 * - Kaos yalnızca görsel/sosyaldir; kuralları burada: bekleme süreleri, "sakin" tercihine saygı, masa devirme maçta bir kez, susturma.
 */
import { sanitizeName, sanitizeSpec } from '../characters/creator';
import type { CharacterSpec } from '../characters/CharacterSpec';
import { ONLINE_ENGINES } from './games';
import { Presence, SALON_EMOTES, SALON_TIMING, SalonState, addTension, cleanPresence, newSalon, onSalonTea, requestRace, tensionNow } from './salon';
import {
  ChaosKind, ChaosPref, ClientMsg, DEFAULT_OPTIONS, GAMES_OF_KIND, GameAction, GameEvent, OnlineGameId, OnlineOptions, PROTOCOL_VERSION,
  ROOM_KINDS, RoomKind, RoomView, SEATS_OF, ServerMsg, TAUNTS,
} from './protocol';

export const MAX_SEATS = 4;
export const TIMING = {
  botDelay: 900,
  afterTrick: 1300,
  handOverWait: 15000,
  /** oynamayan insanın yerine bot oynar */
  idleTakeover: 60000,
  /** bağlantısı kopanın yerine bot oynamadan önce bekleme */
  disconnectGrace: 5000,
  chaosGap: 2500,
  teaSameTarget: 8000,
};
const RATE = { window: 5000, max: 25 };

export const BOT_SEATS = [
  { id: 'riza', name: 'Rıza Dayı' },
  { id: 'cemal', name: 'Cemal Reis' },
  { id: 'nihat', name: 'Nihat Çakal' },
  { id: 'kemal', name: 'Muhtar Kemal' },
];

export interface PlayerRec {
  id: string;
  token: string;
  name: string;
  spec: CharacterSpec;
  chaos: ChaosPref;
  connected: boolean;
  seat: number | null;
  muted: string[];
  lastSeen: number;
  lastChaos: number;
  teaAt: Record<number, number>;
  flipUsed: boolean;
  msgTimes: number[];
  /** ortak kahvehane: son konum (yalnızca bellekte; kaydedilmese de olur) */
  pos?: Presence;
  posAt?: number;
  emoteAt?: number;
  salonTeaAt?: number;
}

export interface Out { to: string; msg: ServerMsg }

export interface RoomData {
  code: string;
  rs: number;
  players: PlayerRec[];
  host: string | null;
  phase: 'lobby' | 'playing';
  /** masa türü (eski kayıtlarda yok → kart) */
  kind?: RoomKind;
  /** odanın kurulduğu masa kimliği (örn. okey2) */
  table?: string;
  /** ortak kahvehane durumu (eski kayıtlarda yok) */
  salon?: SalonState;
  game: OnlineGameId;
  options: OnlineOptions;
  state: unknown;
  seq: number;
  lastEvent: GameEvent | null;
  nextActAt: number;
  /** el toplanırken (son el gösterilirken) hamle beklenir */
  pauseUntil: number;
  turnSince: number;
  handOverAt: number | null;
  nextVotes: string[];
  lastResult: RoomView['lastResult'];
  idCounter: number;
}

const PREFS: ChaosPref[] = ['calm', 'normal', 'chaos'];

export class Room {
  d: RoomData;

  constructor(code: string, seed: number, kind: RoomKind = 'kart', table?: string) {
    if (!ROOM_KINDS.includes(kind)) kind = 'kart';
    if (table !== undefined && !/^[a-z]+\d{1,2}$/.test(table)) table = undefined;
    this.d = {
      code, rs: seed >>> 0, players: [], host: null, phase: 'lobby', kind, ...(table ? { table } : {}), game: GAMES_OF_KIND[kind][0], options: { ...DEFAULT_OPTIONS }, state: null, seq: 0,
      lastEvent: null, nextActAt: 0, pauseUntil: 0, turnSince: 0, handOverAt: null, nextVotes: [], lastResult: null, idCounter: 0,
    };
  }

  static from(d: RoomData) { const r = new Room(d.code, 0); r.d = d; return r; }
  toJSON() { return this.d; }

  /** Tohumlu rastgele (mulberry32, durumu kayıtlı) */
  private rng = () => {
    this.d.rs = (this.d.rs + 0x6d2b79f5) >>> 0;
    let t = this.d.rs;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  private get engine() { return ONLINE_ENGINES[this.d.game]; }
  get kind(): RoomKind { return this.d.kind ?? 'kart'; }
  /** Masadaki koltuk sayısı (tavla masası 2 kişilik) */
  get salon(): SalonState { return (this.d.salon ??= newSalon()); }
  get capacity() { return this.kind === 'tavla' ? 2 : MAX_SEATS; }
  private get seatCount() { return SEATS_OF[this.d.game]; }
  player(id: string) { return this.d.players.find((p) => p.id === id) ?? null; }
  private bySeat(seat: number) { return this.d.players.find((p) => p.seat === seat) ?? null; }
  get humans() { return this.d.players.filter((p) => p.seat !== null); }
  get connectedCount() { return this.d.players.filter((p) => p.connected).length; }

  // ------------------------------------------------------------------ katılma / ayrılma
  /** hello mesajıyla katılma ya da (token ile) geri dönme */
  join(m: Extract<ClientMsg, { t: 'hello' }>, now: number): { player: string | null; out: Out[] } {
    if (m.v !== PROTOCOL_VERSION) return { player: null, out: [] };
    let p = m.token ? this.d.players.find((x) => x.token === m.token) ?? null : null;
    if (p) {
      p.connected = true;
      p.lastSeen = now;
      p.name = sanitizeName(m.name);
      p.spec = { ...sanitizeSpec(m.spec), name: p.name };
      if (PREFS.includes(m.chaos)) p.chaos = m.chaos;
    } else {
      if (this.humans.length >= this.capacity) return { player: null, out: [] };
      const seat = this.freeSeatFor();
      if (seat === null) return { player: null, out: [] };
      const id = `p${++this.d.idCounter}`;
      const token = Math.floor(this.rng() * 2 ** 32).toString(36) + Math.floor(this.rng() * 2 ** 32).toString(36) + this.d.idCounter.toString(36);
      const name = sanitizeName(m.name);
      p = {
        id, token, name, spec: { ...sanitizeSpec(m.spec), name }, chaos: PREFS.includes(m.chaos) ? m.chaos : 'normal', connected: true, seat,
        muted: [], lastSeen: now, lastChaos: -1e9, teaAt: {}, flipUsed: false, msgTimes: [],
      };
      this.d.players.push(p);
    }
    if (!this.d.host || !this.player(this.d.host)?.connected) this.d.host = p.id;
    const out: Out[] = [{ to: p.id, msg: { t: 'welcome', you: p.id, token: p.token, seat: p.seat, room: this.view() } }];
    out.push(...this.roomToAll(p.id));
    if (this.d.phase === 'playing') out.push(...this.stateTo([p]));
    // ortak kahvehane: diğerlerinin konumu, gerginlik, yaklaşan maç gecesi
    for (const o of this.d.players) if (o !== p && o.connected && o.pos) out.push({ to: p.id, msg: { t: 'pos', p: o.id, ...o.pos } });
    out.push({ to: p.id, msg: { t: 'tension', v: Math.round(tensionNow(this.salon, now)) } });
    const race = this.salon.race;
    if (race && race.startAt > now) out.push({ to: p.id, msg: { t: 'race', seed: race.seed, in: race.startAt - now } });
    return { player: p.id, out };
  }

  /** Lobide ilk boş koltuk; oyun sürüyorsa bir botun koltuğu */
  private freeSeatFor(): number | null {
    const limit = this.d.phase === 'playing' ? this.seatCount : this.capacity;
    for (let s = 0; s < limit; s++) if (!this.bySeat(s)) return s;
    return null;
  }

  disconnect(id: string, now: number): Out[] {
    const p = this.player(id);
    if (!p) return [];
    p.connected = false;
    p.lastSeen = now;
    if (this.d.phase === 'lobby') {
      // lobide kopan koltuğunu bırakır
      this.d.players = this.d.players.filter((x) => x !== p);
    }
    if (this.d.host === id) this.d.host = this.d.players.find((x) => x.connected)?.id ?? null;
    return this.roomToAll(null);
  }

  // ------------------------------------------------------------------ mesajlar
  handle(id: string, m: ClientMsg, now: number): Out[] {
    const p = this.player(id);
    if (!p) return [];
    p.lastSeen = now;
    if (m.t === 'pos') return this.onPos(p, m, now);
    p.msgTimes = p.msgTimes.filter((t) => now - t < RATE.window);
    if (p.msgTimes.length >= RATE.max) return [this.err(id, 'Çok hızlı! Biraz yavaş.')];
    p.msgTimes.push(now);
    try {
      switch (m.t) {
        case 'ping': return [{ to: id, msg: { t: 'pong' } }];
        case 'seat': return this.onSeat(p, m.seat);
        case 'config': return this.onConfig(p, m.game, m.options);
        case 'start': return this.onStart(p, now);
        case 'act': return this.onAct(p, m.a, now);
        case 'next': return this.onNext(p, now);
        case 'chaos': return this.onChaos(p, m.kind, m.target, m.phrase, now);
        case 'emote': return this.onEmote(p, m.id, now);
        case 'salonTea': return this.onSalonTea(p, m.target, now);
        case 'race': return this.onRace(p, now);
        case 'pref': if (PREFS.includes(m.chaos)) p.chaos = m.chaos; return this.roomToAll(null);
        case 'mute': {
          if (typeof m.player !== 'string') return [];
          p.muted = p.muted.filter((x) => x !== m.player);
          if (m.on) p.muted.push(m.player);
          return [];
        }
        default: return [this.err(id, 'Bilinmeyen mesaj.')];
      }
    } catch (e) {
      return [this.err(id, (e as Error).message || 'Hata.')];
    }
  }

  private onSeat(p: PlayerRec, seat: number): Out[] {
    if (this.d.phase !== 'lobby') return [this.err(p.id, 'Oyun sürerken yer değiştirilemez.')];
    if (!Number.isInteger(seat) || seat < 0 || seat >= this.capacity) return [this.err(p.id, 'Geçersiz koltuk.')];
    if (this.bySeat(seat)) return [this.err(p.id, 'Bu koltuk dolu.')];
    p.seat = seat;
    return this.roomToAll(null);
  }

  private onConfig(p: PlayerRec, game: OnlineGameId, o: Partial<OnlineOptions>): Out[] {
    if (p.id !== this.d.host) return [this.err(p.id, 'Oyunu oda sahibi seçer.')];
    if (this.d.phase !== 'lobby') return [this.err(p.id, 'Oyun sürüyor.')];
    if (!GAMES_OF_KIND[this.kind].includes(game)) return [this.err(p.id, 'Bu oyun bu masada oynanmaz.')];
    this.d.game = game;
    const cur = { ...DEFAULT_OPTIONS, ...this.d.options };
    const pick = <T>(v: unknown, allowed: readonly T[], d: T) => (allowed.includes(v as T) ? (v as T) : d);
    this.d.options = {
      batakPartners: typeof o.batakPartners === 'boolean' ? o.batakPartners : cur.batakPartners,
      batakHands: pick(o.batakHands, [3, 5, 7, 11], cur.batakHands),
      batakZeroPenalty: typeof o.batakZeroPenalty === 'boolean' ? o.batakZeroPenalty : cur.batakZeroPenalty,
      kingShort: typeof o.kingShort === 'boolean' ? o.kingShort : cur.kingShort,
      pistiTarget: pick(o.pistiTarget, [51, 101, 151], cur.pistiTarget),
      okey101Hands: pick(o.okey101Hands, [1, 3, 5, 7], cur.okey101Hands),
      okey101Doubling: typeof o.okey101Doubling === 'boolean' ? o.okey101Doubling : cur.okey101Doubling,
      tavlaTarget: pick(o.tavlaTarget, [1, 3, 5, 7], cur.tavlaTarget),
      tavlaKatmerli: typeof o.tavlaKatmerli === 'boolean' ? o.tavlaKatmerli : cur.tavlaKatmerli,
      difficulty: pick(o.difficulty, ['easy', 'medium', 'hard'] as const, cur.difficulty),
    };
    return this.roomToAll(null);
  }

  private onStart(p: PlayerRec, now: number): Out[] {
    if (p.id !== this.d.host) return [this.err(p.id, 'Oyunu oda sahibi başlatır.')];
    if (this.d.phase !== 'lobby') return [this.err(p.id, 'Oyun zaten sürüyor.')];
    const n = this.seatCount;
    const humans = this.humans;
    if (humans.length > n) return [this.err(p.id, `Bu oyun ${n} kişilik; masada ${humans.length} kişi var.`)];
    // kullanılmayan koltuklardakileri boş koltuklara al
    for (const h of humans) if (h.seat! >= n) h.seat = [...Array(n).keys()].find((s) => !this.bySeat(s))!;
    this.d.state = this.engine.create({ ...DEFAULT_OPTIONS, ...this.d.options }, this.rng);
    this.d.phase = 'playing';
    this.d.seq++;
    this.d.lastEvent = null;
    this.d.lastResult = null;
    this.d.handOverAt = null;
    this.d.nextVotes = [];
    this.d.nextActAt = now + TIMING.botDelay;
    this.d.turnSince = now;
    for (const h of this.d.players) h.flipUsed = false;
    return [...this.roomToAll(null), ...this.stateTo(this.humans)];
  }

  private onAct(p: PlayerRec, a: GameAction, now: number): Out[] {
    if (this.d.phase !== 'playing' || p.seat === null) return [this.err(p.id, 'Oyun yok.')];
    if (!a || typeof a !== 'object') return [this.err(p.id, 'Geçersiz hamle.')];
    const actor = this.engine.actor(this.d.state);
    if (actor !== p.seat) return [this.err(p.id, 'Sıra sende değil.')];
    if (now < this.d.pauseUntil) return [this.err(p.id, 'Bir saniye, el toplanıyor.')];
    return this.applyAction(p.seat, a, now);
  }

  private applyAction(seat: number, a: GameAction, now: number): Out[] {
    const ev = this.engine.apply(this.d.state, seat, a, this.rng);
    this.d.seq++;
    this.d.lastEvent = { seat, action: a, ...ev };
    this.d.turnSince = now;
    this.d.nextActAt = now + (ev.trickDone ? TIMING.afterTrick + TIMING.botDelay : TIMING.botDelay);
    this.d.pauseUntil = ev.trickDone ? now + TIMING.afterTrick : 0;
    const out = this.stateTo(this.humans);
    if (this.engine.handOver(this.d.state)) {
      this.d.handOverAt = now;
      this.d.nextVotes = [];
      if (this.engine.matchOver(this.d.state)) out.push(...this.finishMatch());
    }
    return out;
  }

  private onNext(p: PlayerRec, now: number): Out[] {
    if (this.d.phase !== 'playing' || this.d.handOverAt === null) return [];
    if (!this.d.nextVotes.includes(p.id)) this.d.nextVotes.push(p.id);
    const waiting = this.humans.filter((h) => h.connected && !this.d.nextVotes.includes(h.id));
    return waiting.length ? [] : this.startNextHand(now);
  }

  private startNextHand(now: number): Out[] {
    this.engine.nextHand(this.d.state, this.rng);
    this.d.handOverAt = null;
    this.d.nextVotes = [];
    this.d.seq++;
    this.d.lastEvent = null;
    this.d.nextActAt = now + TIMING.botDelay;
    this.d.turnSince = now;
    return this.stateTo(this.humans);
  }

  private finishMatch(): Out[] {
    const r = this.engine.result(this.d.state);
    this.d.lastResult = { game: this.d.game, winners: r.winners, totals: r.totals, names: [...Array(this.seatCount).keys()].map((s) => this.seatName(s)) };
    this.d.phase = 'lobby';
    this.d.handOverAt = null;
    return this.roomToAll(null);
  }

  // ------------------------------------------------------------------ kaos (yalnızca görsel/sosyal)
  private onChaos(p: PlayerRec, kind: ChaosKind, target: number | undefined, phrase: number | undefined, now: number): Out[] {
    if (p.seat === null) return [];
    if (now - p.lastChaos < TIMING.chaosGap) return [this.err(p.id, 'Biraz bekle, daha yeni yaptın.')];
    const needsTarget = kind === 'tea' || kind === 'objection';
    const aggressive = kind === 'tea' || kind === 'flip';
    if (!['objection', 'slam', 'tea', 'flip', 'taunt'].includes(kind)) return [this.err(p.id, 'Bilinmeyen hareket.')];
    if (aggressive && p.chaos === 'calm') return [this.err(p.id, 'Sakin moddasın: çay fırlatma ve masa devirme kapalı.')];
    if (needsTarget) {
      if (!Number.isInteger(target) || target! < 0 || target! >= this.seatCount || target === p.seat) return [this.err(p.id, 'Geçersiz hedef.')];
      const t = this.bySeat(target!);
      if (t && t.chaos === 'calm' && kind === 'tea') return [this.err(p.id, `${t.name} sakin modda, çay atılamaz.`)];
      if (kind === 'tea' && now - (p.teaAt[target!] ?? -1e9) < TIMING.teaSameTarget) return [this.err(p.id, 'Aynı kişiye bu kadar sık çay atılmaz!')];
      if (kind === 'tea') p.teaAt[target!] = now;
    }
    if (kind === 'flip') {
      if (this.d.phase !== 'playing') return [this.err(p.id, 'Devrilecek oyun yok.')];
      if (p.flipUsed) return [this.err(p.id, 'Masayı bu maçta zaten devirdin.')];
      p.flipUsed = true;
    }
    if (kind === 'taunt' && (!Number.isInteger(phrase) || phrase! < 0 || phrase! >= TAUNTS.length)) return [this.err(p.id, 'Geçersiz söz.')];
    p.lastChaos = now;
    const tension = this.tension(kind, now);
    const msg: ServerMsg = { t: 'chaos', from: p.seat, kind, ...(needsTarget ? { target } : {}), ...(kind === 'taunt' ? { phrase } : {}) };
    // susturanlara gitmez
    return [...this.d.players.filter((x) => x.connected && !x.muted.includes(p.id)).map((x) => ({ to: x.id, msg })), ...tension];
  }

  // ------------------------------------------------------------------ ortak kahvehane (yalnızca görsel/sosyal)
  private toAll(msg: ServerMsg, except: string | null = null, from: string | null = null): Out[] {
    return this.d.players.filter((x) => x.connected && x.id !== except && !(from && x.muted.includes(from))).map((x) => ({ to: x.id, msg }));
  }

  /** Gerginlik ekle; herkese yeni değer, dolduysa ortak olay */
  private tension(kind: string, now: number): Out[] {
    const r = addTension(this.salon, kind, now, this.rng);
    const out = this.toAll({ t: 'tension', v: Math.round(r.value) });
    if (r.event) out.push(...this.toAll({ t: 'event', id: r.event }));
    return out;
  }

  private onPos(p: PlayerRec, m: Extract<ClientMsg, { t: 'pos' }>, now: number): Out[] {
    if (now - (p.posAt ?? -1e9) < SALON_TIMING.posGap) return [];
    const pos = cleanPresence(m);
    if (!pos) return [];
    const roamChanged = !!p.pos?.roam !== pos.roam;
    p.pos = pos;
    p.posAt = now;
    const out = this.toAll({ t: 'pos', p: p.id, ...pos }, p.id);
    if (roamChanged) out.push(...this.roomToAll(null));
    return out;
  }

  private onEmote(p: PlayerRec, id: string, now: number): Out[] {
    if (!(SALON_EMOTES as readonly string[]).includes(id)) return [this.err(p.id, 'Bilinmeyen hareket.')];
    if (now - (p.emoteAt ?? -1e9) < SALON_TIMING.emoteGap) return [];
    p.emoteAt = now;
    return [...this.toAll({ t: 'emote', p: p.id, id: id as Extract<ServerMsg, { t: 'emote' }>['id'] }, p.id, p.id), ...this.tension(id === 'laf' ? 'laf' : 'emote', now)];
  }

  private onSalonTea(p: PlayerRec, target: string, now: number): Out[] {
    const t = typeof target === 'string' ? this.player(target) : null;
    if (!t || t === p || !t.connected) return [this.err(p.id, 'Çay atacak kimse yok.')];
    if (p.chaos === 'calm') return [this.err(p.id, 'Sakin moddasın: çay fırlatma kapalı.')];
    if (t.chaos === 'calm') return [this.err(p.id, `${t.name} sakin modda, çay atılamaz.`)];
    if (now - (p.salonTeaAt ?? -1e9) < SALON_TIMING.salonTeaGap) return [this.err(p.id, 'Biraz bekle, daha yeni attın.')];
    p.salonTeaAt = now;
    const out = this.toAll({ t: 'salonTea', from: p.id, to: t.id });
    const brawl = onSalonTea(this.salon, p.id, t.id, now);
    out.push(...this.tension('salonTea', now));
    if (brawl) { out.push(...this.toAll({ t: 'brawl', ids: brawl, ms: SALON_TIMING.brawlDuration })); out.push(...this.tension('brawl', now)); }
    return out;
  }

  private onRace(p: PlayerRec, now: number): Out[] {
    const r = requestRace(this.salon, now, this.rng);
    if (!r) return [this.err(p.id, 'Maç gecesi daha yeni yapıldı; biraz sonra tekrar.')];
    return this.toAll({ t: 'race', seed: r.seed, in: r.startAt - now });
  }

  // ------------------------------------------------------------------ zaman
  /** Sırası gelen bot (ya da kopmuş/oynamayan insan yerine bot) oynar; el sonu beklemesi dolarsa yeni el başlar */
  tick(now: number): Out[] {
    if (this.d.phase !== 'playing') return [];
    if (this.d.handOverAt !== null) return now - this.d.handOverAt >= TIMING.handOverWait ? this.startNextHand(now) : [];
    const seat = this.engine.actor(this.d.state);
    if (seat === null || now < this.d.nextActAt) return [];
    const h = this.bySeat(seat);
    if (h) {
      const away = !h.connected && now - h.lastSeen >= TIMING.disconnectGrace;
      const idle = h.connected && now - this.d.turnSince >= TIMING.idleTakeover;
      if (!away && !idle) return [];
    }
    const a = this.engine.bot(this.d.state, seat, this.rng, this.d.options.difficulty);
    try {
      return this.applyAction(seat, a, now);
    } catch (e) {
      // bot yanıldıysa oyun kilitlenmesin: en basit geçerli hamle
      const safe = this.engine.safe?.(this.d.state, seat);
      if (!safe) throw e;
      return this.applyAction(seat, safe, now);
    }
  }

  /** Bir sonraki tick ne zaman gerekli (ms, mutlak); gerekmiyorsa null */
  nextWake(now: number): number | null {
    if (this.d.phase !== 'playing') return null;
    if (this.d.handOverAt !== null) return this.d.handOverAt + TIMING.handOverWait;
    const seat = this.engine.actor(this.d.state);
    if (seat === null) return null;
    const h = this.bySeat(seat);
    if (!h) return Math.max(now, this.d.nextActAt);
    if (!h.connected) return Math.max(now, this.d.nextActAt, h.lastSeen + TIMING.disconnectGrace);
    return Math.max(now, this.d.nextActAt, this.d.turnSince + TIMING.idleTakeover);
  }

  // ------------------------------------------------------------------ görünümler
  private seatName(s: number) { return this.bySeat(s)?.name ?? BOT_SEATS[s].name; }

  view(): RoomView {
    const n = this.d.phase === 'playing' ? this.seatCount : this.capacity;
    return {
      code: this.d.code, host: this.d.host, phase: this.d.phase, kind: this.kind, ...(this.d.table ? { table: this.d.table } : {}), game: this.d.game, options: { ...this.d.options }, lastResult: this.d.lastResult,
      seats: [...Array(n).keys()].map((s) => {
        const p = this.bySeat(s);
        return p ? { occ: 'human', name: p.name, player: p.id, spec: p.spec, connected: p.connected, chaos: p.chaos, ...(p.pos?.roam ? { roam: true } : {}) } : { occ: 'bot', name: BOT_SEATS[s].name };
      }),
    };
  }

  private roomToAll(except: string | null): Out[] {
    const room = this.view();
    return this.d.players.filter((p) => p.connected && p.id !== except).map((p) => ({ to: p.id, msg: { t: 'room', room, seat: p.seat } }));
  }

  private stateTo(ps: PlayerRec[]): Out[] {
    if (this.d.state === null) return [];
    return ps.filter((p) => p.connected && p.seat !== null).map((p) => ({
      to: p.id,
      msg: { t: 'state', seq: this.d.seq, game: this.d.game, seat: p.seat!, view: this.engine.view(this.d.state, p.seat!), event: this.d.lastEvent },
    }));
  }

  private err(to: string, msg: string): Out { return { to, msg: { t: 'error', msg } }; }
}

