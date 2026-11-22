/**
 * Kahvehane çevrimiçi oda sunucusu (Cloudflare Worker + Durable Object).
 * Her oda ayrı bir Durable Object'tir; oyun kuralları saf `Room` modülünde (src/online/room.ts) çalışır.
 * Durum her değişiklikte kaydedilir: nesne uyusa (hibernation) ya da yeniden başlasa da oda kaybolmaz.
 */
import { Room, Out } from '../src/online/room';
import { ROOM_KINDS, RoomKind, isCode, makeCode, parseClientMsg } from '../src/online/protocol';
import { Conn, PresenceClientMsg, PresenceServerMsg, cleanFriends, invite, isFriendCode, makeFriendCode, statusFor, updatesFor } from '../src/online/friends';

export interface Env {
  ROOMS: DurableObjectNamespace;
  PRESENCE: DurableObjectNamespace;
}

/** Bağlantı kabul edilen adresler: yayındaki site ve yerel geliştirme */
function originOk(origin: string | null): boolean {
  if (!origin) return false;
  if (origin === 'https://hamitkaantokmak-jpg.github.io') return true;
  return /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin);
}

function cors(origin: string | null): Record<string, string> {
  return originOk(origin) ? { 'Access-Control-Allow-Origin': origin!, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', Vary: 'Origin' } : {};
}

const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...cors(origin) } });

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (url.pathname === '/health') return json({ ok: true }, 200, origin);

    // arkadaş listesi / kim çevrimiçi (tek nesne)
    if (url.pathname === '/presence') {
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'websocket bekleniyor' }, 426, origin);
      if (!originOk(origin)) return json({ error: 'izin yok' }, 403, origin);
      return env.PRESENCE.get(env.PRESENCE.idFromName('global')).fetch(req);
    }

    // oda kur
    if (url.pathname === '/rooms' && req.method === 'POST') {
      if (!originOk(origin)) return json({ error: 'izin yok' }, 403, origin);
      const k = url.searchParams.get('kind') as RoomKind | null;
      const kind: RoomKind = k && ROOM_KINDS.includes(k) ? k : 'kart';
      const tb = url.searchParams.get('table');
      const table = tb && /^[a-z]+\d{1,2}$/.test(tb) ? tb : '';
      for (let i = 0; i < 8; i++) {
        const code = makeCode(random);
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const r = await stub.fetch(`https://room/init?code=${code}&seed=${randomSeed()}&kind=${kind}&table=${table}`, { method: 'POST' });
        if (r.status === 201) return json({ code }, 201, origin);
      }
      return json({ error: 'Oda kurulamadı, tekrar dene.' }, 503, origin);
    }

    const m = url.pathname.match(/^\/rooms\/([A-Z]{4})(\/ws)?$/);
    if (m && isCode(m[1])) {
      const stub = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
      if (m[2]) {
        if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'websocket bekleniyor' }, 426, origin);
        if (!originOk(origin)) return json({ error: 'izin yok' }, 403, origin);
        return stub.fetch(req);
      }
      const r = await stub.fetch('https://room/info');
      return json(await r.json(), r.status, origin);
    }
    return json({ error: 'bulunamadı' }, 404, origin);
  },
};

interface Attachment { pid: string | null }

/** Boş oda bu süre sonra silinir */
const EMPTY_TTL = 60 * 60 * 1000;

export class RoomDO implements DurableObject {
  private room: Room | null = null;
  private loaded = false;

  constructor(private ctx: DurableObjectState, _env: Env) {}

  private async load() {
    if (this.loaded) return;
    const d = await this.ctx.storage.get<Room['d']>('room');
    if (d) this.room = Room.from(d);
    this.loaded = true;
  }

  private async save() {
    if (this.room) await this.ctx.storage.put('room', this.room.toJSON());
  }

  private async schedule() {
    if (!this.room) return;
    const now = Date.now();
    const w = this.room.nextWake(now);
    const anyone = this.ctx.getWebSockets().length > 0;
    await this.ctx.storage.setAlarm(w ?? (anyone ? now + EMPTY_TTL : now + EMPTY_TTL));
  }

  private dispatch(out: Out[]) {
    if (!out.length) return;
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att?.pid) continue;
      for (const o of out) if (o.to === att.pid) { try { ws.send(JSON.stringify(o.msg)); } catch { /* kapanmış */ } }
    }
  }

  async fetch(req: Request): Promise<Response> {
    await this.load();
    const url = new URL(req.url);
    if (url.pathname === '/init') {
      if (this.room) return new Response('var', { status: 409 });
      const code = url.searchParams.get('code')!;
      this.room = new Room(code, Number(url.searchParams.get('seed')) >>> 0, (url.searchParams.get('kind') ?? 'kart') as RoomKind, url.searchParams.get('table') || undefined);
      await this.save();
      await this.ctx.storage.setAlarm(Date.now() + EMPTY_TTL);
      return new Response('ok', { status: 201 });
    }
    if (url.pathname === '/info') {
      if (!this.room) return Response.json({ exists: false }, { status: 404 });
      const v = this.room.view();
      return Response.json({ exists: true, phase: v.phase, kind: v.kind, table: v.table, game: v.game, humans: this.room.humans.length });
    }
    if (req.headers.get('Upgrade') === 'websocket') {
      if (!this.room) return new Response('oda yok', { status: 404 });
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ pid: null } satisfies Attachment);
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('bulunamadı', { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
    await this.load();
    if (!this.room || typeof data !== 'string') return;
    const m = parseClientMsg(data);
    if (!m) return;
    const now = Date.now();
    const att = (ws.deserializeAttachment() as Attachment | null) ?? { pid: null };
    if (!att.pid) {
      if (m.t !== 'hello') { ws.close(1008, 'önce hello'); return; }
      const r = this.room.join(m, now);
      if (!r.player) { ws.send(JSON.stringify({ t: 'error', msg: 'Oda dolu ya da sürüm eski. Sayfayı yenile.' })); ws.close(1008, 'dolu'); return; }
      att.pid = r.player;
      ws.serializeAttachment(att);
      this.dispatch(r.out);
    } else {
      this.dispatch(this.room.handle(att.pid, m, now));
      // konum mesajları sık gelir ve kalıcı değildir: depolamaya yazılmaz
      if (m.t === 'pos') return;
    }
    await this.save();
    await this.schedule();
  }

  private async closed(ws: WebSocket) {
    await this.load();
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!this.room || !att?.pid) return;
    // aynı oyuncunun başka açık bağlantısı varsa (yeniden bağlandıysa) kopmuş sayma
    const others = this.ctx.getWebSockets().filter((x) => x !== ws && (x.deserializeAttachment() as Attachment | null)?.pid === att.pid);
    if (!others.length) this.dispatch(this.room.disconnect(att.pid, Date.now()));
    await this.save();
    await this.schedule();
  }

  async webSocketClose(ws: WebSocket) { await this.closed(ws); }
  async webSocketError(ws: WebSocket) { await this.closed(ws); }

  async alarm() {
    await this.load();
    if (!this.room) return;
    const now = Date.now();
    if (this.ctx.getWebSockets().length === 0 && this.room.connectedCount === 0 && this.room.nextWake(now) === null) {
      // kimse yok ve iş yok: odayı sil
      await this.ctx.storage.deleteAll();
      this.room = null;
      return;
    }
    this.dispatch(this.room.tick(now));
    await this.save();
    await this.schedule();
  }
}

// ====================================================================== arkadaş listesi
const sha256 = async (t: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const randHex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Arkadaş kodlarını (gizli anahtarın özetiyle) saklar; kimin çevrimiçi olduğunu açık bağlantılardan bilir. */
export class PresenceDO implements DurableObject {
  constructor(private ctx: DurableObjectState, _env: Env) {}

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('websocket bekleniyor', { status: 426 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment(null);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  /** Açık bağlantılar ve durumları (merhaba demiş olanlar) */
  private conns(): { ws: WebSocket; c: Conn }[] {
    return this.ctx.getWebSockets().map((ws) => ({ ws, c: ws.deserializeAttachment() as Conn | null })).filter((x): x is { ws: WebSocket; c: Conn } => !!x.c);
  }

  private send(ws: WebSocket, m: PresenceServerMsg) { try { ws.send(JSON.stringify(m)); } catch { /* kapanmış */ } }

  private dispatch(list: { ws: WebSocket; c: Conn }[], out: { to: number; msg: PresenceServerMsg }[]) {
    for (const o of out) this.send(list[o.to].ws, o.msg);
  }

  private notify(code: string) {
    const list = this.conns();
    this.dispatch(list, updatesFor(list.map((x) => x.c), code));
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
    if (typeof data !== 'string' || data.length > 8192) return;
    let m: PresenceClientMsg;
    try { m = JSON.parse(data); } catch { return; }
    const name = (x: unknown) => String(x ?? '').replace(/[<>&"']/g, '').trim().slice(0, 16) || 'Misafir';
    let c = ws.deserializeAttachment() as Conn | null;
    if (!c) {
      if (m.t !== 'hello') { ws.close(1008, 'önce hello'); return; }
      let code = m.code, secret = m.secret;
      const known = isFriendCode(code) && typeof secret === 'string' ? await this.ctx.storage.get<string>(`c:${code}`) : undefined;
      if (!known || known !== (await sha256(secret!))) {
        // yeni kimlik (ya da anahtar tutmadı): yeni kod ver
        for (let i = 0; i < 10; i++) { code = makeFriendCode(() => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32); if (!(await this.ctx.storage.get(`c:${code}`))) break; }
        secret = randHex(16);
        await this.ctx.storage.put(`c:${code}`, await sha256(secret));
        this.send(ws, { t: 'me', code: code!, secret });
      }
      c = { code: code!, name: name(m.name), friends: cleanFriends(m.friends), invisible: !!m.invisible, room: null };
      ws.serializeAttachment(c);
      const list = this.conns().map((x) => x.c);
      this.send(ws, { t: 'friends', list: c.friends.map((f) => statusFor(list, f, c!.code)) });
      this.notify(c.code);
      return;
    }
    if (m.t === 'friends') {
      c.friends = cleanFriends(m.list);
      ws.serializeAttachment(c);
      const list = this.conns().map((x) => x.c);
      this.send(ws, { t: 'friends', list: c.friends.map((f) => statusFor(list, f, c!.code)) });
      // listesine eklediklerim artık beni görebilir
      this.notify(c.code);
      return;
    }
    if (m.t === 'status') {
      const r = m.room;
      c.room = r && isCode(r.code) && ROOM_KINDS.includes(r.kind as RoomKind) ? { code: r.code, kind: r.kind } : null;
      if (m.name !== undefined) c.name = name(m.name);
      if (m.invisible !== undefined) c.invisible = !!m.invisible;
      ws.serializeAttachment(c);
      this.notify(c.code);
      return;
    }
    if (m.t === 'invite') {
      const list = this.conns();
      const i = list.findIndex((x) => x.ws === ws);
      const out = invite(list.map((x) => x.c), i, m.to, Date.now());
      ws.serializeAttachment(list[i].c);
      this.dispatch(list, out);
    }
  }

  private closed(ws: WebSocket) {
    const c = ws.deserializeAttachment() as Conn | null;
    ws.serializeAttachment(null);
    if (c) this.notify(c.code);
  }

  async webSocketClose(ws: WebSocket) { this.closed(ws); }
  async webSocketError(ws: WebSocket) { this.closed(ws); }
}
