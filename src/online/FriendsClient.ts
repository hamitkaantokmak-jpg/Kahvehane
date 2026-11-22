/**
 * Arkadaş listesi istemcisi: arkadaş kodu (tarayıcıda saklanır), arkadaşlar ve kim çevrimiçi, masaya çağırma.
 * İlk kez arkadaş paneli açılınca bağlanır; kimlik oluştuktan sonra oyun her açıldığında kendiliğinden bağlanır.
 */
import { serverUrl } from './OnlineClient';
import type { FriendStatus, PresenceClientMsg, PresenceServerMsg } from './friends';
import { cleanFriends, isFriendCode } from './friends';

const ME_KEY = 'kahvehane.me.v1';
const LIST_KEY = 'kahvehane.friends.v1';
const INVIS_KEY = 'kahvehane.invisible.v1';

export interface FriendEntry { code: string; name: string }

const load = <T>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* yok */ } };

export class FriendsClient {
  me: { code: string; secret: string } | null = load(ME_KEY, null);
  list: FriendEntry[] = load<FriendEntry[]>(LIST_KEY, []).filter((f) => isFriendCode(f.code));
  invisible: boolean = load(INVIS_KEY, false);
  status = new Map<string, FriendStatus>();
  connected = false;
  private ws: WebSocket | null = null;
  private retry = 0;
  private wantOpen = false;
  private room: { code: string; kind: string } | null = null;
  /** değişince (panel yeniden çizilir) */
  onChange: () => void = () => {};
  onInvite: (from: { code: string; name: string }, room: { code: string; kind: string }) => void = () => {};
  onError: (msg: string) => void = () => {};

  constructor(private nameOf: () => string) {}

  /** Kimliği olan (daha önce paneli açmış) oyuncu için oyun açılışında bağlan */
  autoStart() { if (this.me) this.start(); }

  start() {
    if (this.wantOpen) return;
    this.wantOpen = true;
    this.connect();
  }

  private connect() {
    let ws: WebSocket;
    try { ws = new WebSocket(serverUrl().replace(/^http/, 'ws') + '/presence'); } catch { return; }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.connected = true;
      this.send({ t: 'hello', v: 1, code: this.me?.code, secret: this.me?.secret, name: this.nameOf(), friends: this.list.map((f) => f.code), invisible: this.invisible });
      if (this.room) this.send({ t: 'status', room: this.room });
      this.onChange();
    };
    ws.onmessage = (e) => {
      let m: PresenceServerMsg;
      try { m = JSON.parse(String(e.data)); } catch { return; }
      if (m.t === 'me') { this.me = { code: m.code, secret: m.secret }; save(ME_KEY, this.me); }
      else if (m.t === 'friends') { this.status.clear(); for (const s of m.list) this.status.set(s.code, s); }
      else if (m.t === 'friend') this.status.set(m.status.code, m.status);
      else if (m.t === 'invited') this.onInvite(m.from, m.room);
      else if (m.t === 'error') this.onError(m.msg);
      this.onChange();
    };
    ws.onclose = () => {
      this.connected = false;
      this.onChange();
      if (!this.wantOpen) return;
      setTimeout(() => this.wantOpen && this.connect(), Math.min(15000, 1000 * 2 ** this.retry++));
    };
  }

  private send(m: PresenceClientMsg) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }

  private saveList() {
    save(LIST_KEY, this.list);
    this.send({ t: 'friends', list: this.list.map((f) => f.code) });
    this.onChange();
  }

  add(code: string, name: string): string | null {
    code = code.trim().toUpperCase();
    if (!isFriendCode(code)) return 'Arkadaş kodu 6 harf olmalı (I ve O yok).';
    if (code === this.me?.code) return 'Bu senin kendi kodun 🙂';
    if (this.list.some((f) => f.code === code)) return 'Bu arkadaş zaten listende.';
    if (cleanFriends([...this.list.map((f) => f.code), code]).length > 50) return 'En çok 50 arkadaş eklenebilir.';
    this.list.push({ code, name: name.replace(/[<>&"']/g, '').trim().slice(0, 16) || code });
    this.saveList();
    return null;
  }

  remove(code: string) {
    this.list = this.list.filter((f) => f.code !== code);
    this.status.delete(code);
    this.saveList();
  }

  setInvisible(v: boolean) {
    this.invisible = v;
    save(INVIS_KEY, v);
    this.send({ t: 'status', room: this.room, invisible: v });
  }

  /** Şu anki çevrimiçi oda (yoksa null) — arkadaşlar "Katıl" diyebilsin */
  setRoom(room: { code: string; kind: string } | null) {
    if (this.room?.code === room?.code && this.room?.kind === room?.kind) return;
    this.room = room;
    this.send({ t: 'status', room, name: this.nameOf() });
  }

  get inRoom() { return this.room; }

  invite(code: string) { this.send({ t: 'invite', to: code }); }
}
