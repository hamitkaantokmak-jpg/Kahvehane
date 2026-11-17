/**
 * Zincirleme kavga — saf mantık. Görsel/animasyon katmanı (src/npc/BrawlController.ts) bunu okur.
 *
 * - Kavga iki taraf (A, B) arasında başlar. Taraflardan biri oyuncu olabilir ('player').
 * - Yakındaki her NPC kavga başına EN FAZLA BİR KEZ değerlendirilir (sonsuz bulaşma olmaz).
 * - Karar: ilişki (dost / rakip / tarafsız) × öfke (temper) × mesafe katsayısı → olasılık.
 *     dostuna yardım ('help'), dostunun rakibine dalma ('attack'), ayırmaya çalışma ('separate'),
 *     kaçma ('flee') ya da umursamama (null).
 * - Katılımcı sayısı sınırlıdır; kavga en geç `maxDuration` saniyede kendiliğinden söner.
 */
import type { Rng } from '../games/common/rng';

export type BrawlRole = 'fighter' | 'helper' | 'separator' | 'fleer';

export interface BrawlParticipant {
  id: string;
  /** 0: A tarafı, 1: B tarafı, -1: taraf yok (ayıran/kaçan) */
  side: 0 | 1 | -1;
  role: BrawlRole;
  /** Vurmaya çalıştığı kişi */
  target: string | null;
  hits: number;
}

export interface Relations {
  friends: string[];
  rivals: string[];
}

export interface Candidate extends Relations {
  id: string;
  temper: number; // 0..1
  /** Kavganın merkezine uzaklık (m) */
  distance: number;
}

export interface BrawlConfig {
  maxParticipants: number;
  maxDuration: number;
  joinRadius: number;
}

export const DEFAULT_BRAWL: BrawlConfig = { maxParticipants: 5, maxDuration: 14, joinRadius: 6 };

export interface BrawlState {
  a: string;
  b: string;
  participants: BrawlParticipant[];
  considered: string[];
  elapsed: number;
  ended: boolean;
  endReason: 'timeout' | 'calmed' | 'exhausted' | null;
}

/** Bir NPC'nin kavgaya katılma kararı ve olasılıkları (test edilebilir saf fonksiyon). */
export function joinChances(c: Candidate, a: string, b: string, cfg: BrawlConfig = DEFAULT_BRAWL) {
  const near = Math.max(0, 1 - c.distance / cfg.joinRadius);
  const temper = 0.5 + c.temper; // 0.5 .. 1.5
  const friendA = c.friends.includes(a), friendB = c.friends.includes(b);
  const rivalA = c.rivals.includes(a), rivalB = c.rivals.includes(b);
  let help = 0, attack = 0, separate = 0, flee = 0;
  let side: 0 | 1 = 0;
  if (friendA && !friendB) { help = 0.55; side = 0; }
  else if (friendB && !friendA) { help = 0.55; side = 1; }
  else if (rivalA && !rivalB) { attack = 0.45; side = 1; }
  else if (rivalB && !rivalA) { attack = 0.45; side = 0; }
  else { separate = 0.35 * (1.2 - c.temper); flee = 0.25 * (1 - c.temper * 0.5); }
  return {
    side,
    help: help * temper * near,
    attack: attack * temper * near,
    separate: separate * near,
    flee: flee * near,
  };
}

export class Brawl {
  state: BrawlState;
  constructor(a: string, b: string, readonly cfg: BrawlConfig = DEFAULT_BRAWL) {
    this.state = {
      a, b,
      participants: [
        { id: a, side: 0, role: 'fighter', target: b, hits: 0 },
        { id: b, side: 1, role: 'fighter', target: a, hits: 0 },
      ],
      considered: [a, b],
      elapsed: 0, ended: false, endReason: null,
    };
  }

  get active() { return !this.state.ended; }

  has(id: string) { return this.state.participants.some((p) => p.id === id); }
  get(id: string) { return this.state.participants.find((p) => p.id === id) ?? null; }

  /** Savaşan (vuran) katılımcı sayısı */
  fighters() { return this.state.participants.filter((p) => p.role === 'fighter' || p.role === 'helper'); }

  /**
   * Bir adayı değerlendir. Aynı aday ikinci kez değerlendirilmez. Dönüş: atanan rol ya da null.
   */
  consider(c: Candidate, rng: Rng): BrawlRole | null {
    const s = this.state;
    if (s.ended || s.considered.includes(c.id)) return null;
    s.considered.push(c.id);
    const ch = joinChances(c, s.a, s.b, this.cfg);
    const r = rng();
    const fullFight = this.fighters().length >= this.cfg.maxParticipants;
    if (!fullFight && r < ch.help + ch.attack) {
      const side = ch.side;
      const target = side === 0 ? s.b : s.a;
      s.participants.push({ id: c.id, side, role: 'helper', target, hits: 0 });
      return 'helper';
    }
    if (r < ch.help + ch.attack + ch.separate) {
      s.participants.push({ id: c.id, side: -1, role: 'separator', target: null, hits: 0 });
      return 'separator';
    }
    if (r < ch.help + ch.attack + ch.separate + ch.flee) {
      s.participants.push({ id: c.id, side: -1, role: 'fleer', target: null, hits: 0 });
      return 'fleer';
    }
    return null;
  }

  /** Bir vuruşu kaydet. Her savaşan en fazla 4 vuruş yapar, sonra yorulur. */
  registerHit(attacker: string): boolean {
    const p = this.get(attacker);
    if (!p || this.state.ended) return false;
    p.hits++;
    if (this.fighters().every((f) => f.hits >= 4)) this.end('exhausted');
    return true;
  }

  /** Katılımcıyı kavgadan çıkar (ör. bayıldı, masaya döndü) */
  leave(id: string) {
    const s = this.state;
    s.participants = s.participants.filter((p) => p.id !== id);
    if (!s.participants.some((p) => p.side === 0 && p.role !== 'separator') || !s.participants.some((p) => p.side === 1 && p.role !== 'separator')) this.end('exhausted');
  }

  update(dt: number): boolean {
    const s = this.state;
    if (s.ended) return true;
    s.elapsed += dt;
    if (s.elapsed >= this.cfg.maxDuration) this.end('timeout');
    return s.ended;
  }

  end(reason: 'timeout' | 'calmed' | 'exhausted') {
    if (this.state.ended) return;
    this.state.ended = true;
    this.state.endReason = reason;
  }

  toJSON(): BrawlState { return JSON.parse(JSON.stringify(this.state)); }
}
