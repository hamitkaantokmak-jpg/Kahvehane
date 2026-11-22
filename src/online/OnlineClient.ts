/**
 * Çevrimiçi oda istemcisi (tarayıcı). WebSocket bağlantısı, kopunca yeniden bağlanma (aynı koltuğa dönüş için
 * oda başına token saklanır), basit olay yayıcı. Sunucu adresi ?server= ile değiştirilebilir (yerel geliştirme).
 */
import { ClientMsg, PROTOCOL_VERSION, ServerMsg, isCode } from './protocol';
import type { CharacterSpec } from '../characters/CharacterSpec';
import type { ChaosPref, RoomKind } from './protocol';

export const DEFAULT_SERVER = 'https://kahvehane.hamitkaantokmak.workers.dev';

export function serverUrl(): string {
  try {
    const q = new URLSearchParams(location.search).get('server');
    if (q && /^https?:\/\/[\w.:-]+$/.test(q)) return q;
  } catch { /* yok */ }
  return DEFAULT_SERVER;
}

const TOKEN_KEY = (code: string) => `kahvehane.online.${code}`;
const tokenOf = (code: string) => { try { return sessionStorage.getItem(TOKEN_KEY(code)) ?? undefined; } catch { return undefined; } };
const saveToken = (code: string, t: string) => { try { sessionStorage.setItem(TOKEN_KEY(code), t); } catch { /* yok */ } };

/** Yeni oda kur → oda kodu */
export async function createRoom(kind: RoomKind = 'kart'): Promise<string> {
  const r = await fetch(`${serverUrl()}/rooms?kind=${kind}`, { method: 'POST' });
  const j = (await r.json()) as { code?: string; error?: string };
  if (!r.ok || !j.code) throw new Error(j.error ?? 'Oda kurulamadı.');
  return j.code;
}

export interface RoomInfo { exists: boolean; kind: RoomKind; phase?: string; game?: string; humans?: number }

/** Oda bilgisi (yoksa null). Eski sunucu masa türü yollamazsa kart masası sayılır. */
export async function roomInfo(code: string): Promise<RoomInfo | null> {
  if (!isCode(code)) return null;
  try {
    const r = await fetch(`${serverUrl()}/rooms/${code}`);
    if (!r.ok) return null;
    const j = (await r.json()) as Partial<RoomInfo>;
    return j.exists ? { ...j, exists: true, kind: j.kind ?? 'kart' } : null;
  } catch { return null; }
}

/** Oda var mı */
export async function roomExists(code: string): Promise<boolean> {
  return (await roomInfo(code)) !== null;
}

type Listener = (m: ServerMsg) => void;

export interface Identity { name: string; spec: CharacterSpec; chaos: ChaosPref }

export class OnlineClient {
  private ws: WebSocket | null = null;
  private listeners: Listener[] = [];
  private closedByUser = false;
  private retry = 0;
  private pingT = 0;
  status: 'connecting' | 'open' | 'reconnecting' | 'closed' = 'connecting';
  onStatus: (s: OnlineClient['status']) => void = () => {};
  you: string | null = null;

  constructor(readonly code: string, private id: Identity) { this.connect(); }

  on(fn: Listener) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((x) => x !== fn); }; }

  private setStatus(s: OnlineClient['status']) { this.status = s; this.onStatus(s); }

  private connect() {
    const url = serverUrl().replace(/^http/, 'ws') + `/rooms/${this.code}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.setStatus('open');
      this.send({ t: 'hello', v: PROTOCOL_VERSION, name: this.id.name, spec: this.id.spec, chaos: this.id.chaos, token: tokenOf(this.code) });
      clearInterval(this.pingT);
      this.pingT = window.setInterval(() => this.send({ t: 'ping' }), 25000);
    };
    ws.onmessage = (e) => {
      let m: ServerMsg;
      try { m = JSON.parse(String(e.data)) as ServerMsg; } catch { return; }
      if (m.t === 'welcome') { this.you = m.you; saveToken(this.code, m.token); }
      for (const l of [...this.listeners]) l(m);
    };
    ws.onclose = () => {
      clearInterval(this.pingT);
      if (this.closedByUser) { this.setStatus('closed'); return; }
      this.setStatus('reconnecting');
      const wait = Math.min(8000, 500 * 2 ** this.retry++);
      setTimeout(() => !this.closedByUser && this.connect(), wait);
    };
  }

  send(m: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  close() {
    this.closedByUser = true;
    clearInterval(this.pingT);
    this.ws?.close();
  }
}
