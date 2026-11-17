/**
 * Aşama 5 küçük kaos olaylarının saf kuralları (three.js/DOM yok, rastgelelik enjekte).
 */
import type { Rng } from '../games/common/rng';

/** Olay süreleri (sn) */
export const DURATIONS = { powerCut: 22, tvGoal: 5, catVisit: 28, tableFlipReset: 7 } as const;

/**
 * Masa devirme: yalnızca çok sinirli karakter (temper ≥ 0.85, ör. Rıza Dayı) okeyde maçı kaybedince,
 * öfkesi yüksekse ve zar tutarsa. Sonuç ve puanlar geçerli kalır (yalnızca görsel/sosyal).
 */
export function shouldFlipTable(p: { temper: number; lostMatch: boolean; game: string; anger: number }, roll: number): boolean {
  if (!p.lostMatch || p.temper < 0.85 || (p.game !== 'okey' && p.game !== 'okey101')) return false;
  const chance = 0.45 + p.anger * 0.4;
  return roll < chance;
}

export type ObjectionReply = 'deny' | 'mock' | 'angry';
/** İtiraz: bota haksızlık iddiası (gerçek hile tespiti yok). Karakterin cevabı ve gerginlik etkisi. */
export function objectionOutcome(temper: number, roll: number): { reply: ObjectionReply; tension: number } {
  if (roll < temper * 0.7) return { reply: 'angry', tension: 8 };
  if (roll < 0.75) return { reply: 'deny', tension: 4 };
  return { reply: 'mock', tension: 3 };
}

/** Tekrar etmeyen seçici: aynı listeden art arda aynı öğe gelmez; tüm liste tükenmeden tekrar yok. */
export class NoRepeatPicker<T> {
  private bag: T[] = [];
  private last: T | null = null;
  constructor(private items: readonly T[], private rng: Rng) {}
  next(): T {
    if (this.items.length === 1) return this.items[0];
    if (!this.bag.length) {
      this.bag = [...this.items];
      for (let i = this.bag.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]]; }
      if (this.bag[this.bag.length - 1] === this.last) { const x = this.bag.pop()!; this.bag.unshift(x); }
    }
    const v = this.bag.pop()!;
    this.last = v;
    return v;
  }
}

/** Gol anında masadaki bardak devrilir mi? TV'ye yakınlık arttıkça olasılık artar. */
export function glassTips(distanceToTv: number, roll: number): boolean {
  if (distanceToTv > 6) return false;
  return roll < 0.5 * (1 - distanceToTv / 6) + 0.1;
}

/** Elektrik kesintisinde ışık çarpanı (yumuşak sönüş/geliş) */
export function powerLightFactor(elapsed: number, duration: number): number {
  const fadeOut = 0.6, fadeIn = 1.5;
  if (elapsed < fadeOut) return 1 - (elapsed / fadeOut) * 0.85;
  if (elapsed > duration - fadeIn) return 0.15 + ((elapsed - (duration - fadeIn)) / fadeIn) * 0.85;
  // arada titreme (deterministik)
  return 0.15 + Math.max(0, Math.sin(elapsed * 23) * Math.sin(elapsed * 7)) * 0.04;
}

/** Kibitz: izleyici NPC bir sonraki yorumu ne zaman yapsın (sn) */
export function nextKibitzDelay(rng: Rng): number {
  return 9 + rng() * 9;
}
