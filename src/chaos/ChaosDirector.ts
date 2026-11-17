/**
 * Kaos Direktörü — saf mantık (three.js/DOM yok, Math.random/Date.now yok).
 * Gerginlik (0-100) tutar; olaylar puan ekler, puan zamanla düşer. Belirli aralıklarla, gerginlik
 * seviyesine uygun, bekleme süresi dolmuş ve bir önceki olaydan farklı bir olayı ağırlıklı seçer.
 * Durum JSON'a çevrilebilir (ileride sunucuya taşınabilir).
 */
import type { Rng } from '../games/common/rng';
import { ChaosEventDef, ChaosEventId, ChaosRegistry, TENSION_POINTS, TensionSource } from './events';

export type ChaosIntensity = 'calm' | 'normal' | 'chaos';
export type TensionLevel = 'calm' | 'lively' | 'tense' | 'explosive';

export const LEVEL_TR: Record<TensionLevel, string> = { calm: 'Sakin', lively: 'Hareketli', tense: 'Gergin', explosive: 'Patlamak üzere' };

export const INTENSITY: Record<ChaosIntensity, { tensionMult: number; frequencyMult: number }> = {
  calm: { tensionMult: 0.6, frequencyMult: 0.5 },
  normal: { tensionMult: 1, frequencyMult: 1 },
  chaos: { tensionMult: 1.6, frequencyMult: 2 },
};

export function levelOf(t: number): TensionLevel {
  if (t >= 75) return 'explosive';
  if (t >= 50) return 'tense';
  if (t >= 25) return 'lively';
  return 'calm';
}

export interface ChaosState {
  tension: number;
  cooldowns: Partial<Record<ChaosEventId, number>>;
  lastEvent: ChaosEventId | null;
  /** Bir sonraki olay denemesine kalan süre (sn) */
  nextRoll: number;
  intensity: ChaosIntensity;
}

export interface ChaosUpdate {
  event: ChaosEventDef | null;
  levelChanged: TensionLevel | null;
  /** Gerginlik bu karede tavana (≥ 95) ulaştı mı */
  overflow: boolean;
}

export const DECAY_PER_SEC = 0.6;
export const ROLL_INTERVAL = 20;
/** Her denemede (gerginliğe göre artan) bir olay çıkma olasılığı */
export function fireChance(tension: number, freq: number): number {
  return Math.min(0.95, (0.25 + tension / 140) * freq);
}

export class ChaosDirector {
  state: ChaosState;
  readonly registry: ChaosRegistry;
  /** Oyun katmanında işleyicisi olan olaylar; yalnızca bunlar seçilir */
  available = new Set<ChaosEventId>();

  constructor(private rng: Rng, intensity: ChaosIntensity = 'normal', registry = new ChaosRegistry()) {
    this.registry = registry;
    this.state = { tension: 0, cooldowns: {}, lastEvent: null, nextRoll: ROLL_INTERVAL, intensity };
  }

  get tension() { return this.state.tension; }
  get level(): TensionLevel { return levelOf(this.state.tension); }

  setIntensity(i: ChaosIntensity) { this.state.intensity = i; }

  /** Gerginlik ekle (kaynak adı ya da sayı). Pozitif puanlar yoğunluk çarpanıyla ölçeklenir. */
  add(source: TensionSource | number): number {
    const raw = typeof source === 'number' ? source : TENSION_POINTS[source];
    const pts = raw > 0 ? raw * INTENSITY[this.state.intensity].tensionMult : raw;
    this.state.tension = clamp(this.state.tension + pts, 0, 100);
    return this.state.tension;
  }

  /** Şu an seçilebilir olaylar */
  eligible(): ChaosEventDef[] {
    const t = this.state.tension;
    return this.registry.all().filter((d) =>
      d.weight > 0 && this.available.has(d.id) && t >= d.minTension && t <= d.maxTension && (this.state.cooldowns[d.id] ?? 0) <= 0 && d.id !== this.state.lastEvent);
  }

  /** Ağırlıklı seçim (deterministik: enjekte edilen rng) */
  pick(): ChaosEventDef | null {
    const list = this.eligible();
    if (!list.length) return null;
    const total = list.reduce((a, d) => a + d.weight, 0);
    let r = this.rng() * total;
    for (const d of list) { r -= d.weight; if (r < 0) return d; }
    return list[list.length - 1];
  }

  /** Olayı dışarıdan zorla başlat (ör. oyuncu kaynaklı kavga): bekleme ve gerginlik işlenir */
  trigger(id: ChaosEventId): ChaosEventDef | null {
    const d = this.registry.get(id);
    if (!d) return null;
    this.state.cooldowns[id] = d.cooldown;
    this.state.lastEvent = id;
    this.add(d.tension);
    return d;
  }

  update(dt: number): ChaosUpdate {
    const before = this.level;
    const s = this.state;
    s.tension = clamp(s.tension - DECAY_PER_SEC * dt, 0, 100);
    for (const k of Object.keys(s.cooldowns) as ChaosEventId[]) s.cooldowns[k] = Math.max(0, (s.cooldowns[k] ?? 0) - dt);
    let event: ChaosEventDef | null = null;
    s.nextRoll -= dt * INTENSITY[s.intensity].frequencyMult;
    if (s.nextRoll <= 0) {
      s.nextRoll = ROLL_INTERVAL * (0.75 + this.rng() * 0.5);
      if (this.rng() < fireChance(s.tension, 1)) {
        const d = this.pick();
        if (d) event = this.trigger(d.id);
      }
    }
    const after = this.level;
    return { event, levelChanged: after !== before ? after : null, overflow: s.tension >= 95 };
  }

  toJSON(): ChaosState { return JSON.parse(JSON.stringify(this.state)); }
  load(state: ChaosState) { this.state = JSON.parse(JSON.stringify(state)); }
}

function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
