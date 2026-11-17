/**
 * Dart botu: kalan puana göre hedef seçer (bitiriş tablosu basitleştirilmiş), kişiliğe göre nişan hatası yapar.
 * Yalnızca görünüm (DartView) alır.
 */
import type { Rng } from '../common/rng';
import { DartView, aimPoint, Ring, throwOutcome } from './dart';

export interface DartSkill {
  /** nişan dağılımı (tahta yarıçapı biriminde) */
  sigma: number;
  /** sistematik sapma (ör. hep sağa kaçan) */
  biasX: number;
  biasY: number;
  /** iddialılık: zor hedeflere (üçlü/boğa) gitme eğilimi 0..1 */
  bold: number;
}

/** Kişiliklere göre beceri: Rıza ağır ve isabetli, Cemal iddialı ama sapan, Hasan uykulu... */
export const DART_SKILLS: Record<string, DartSkill> = {
  riza: { sigma: 0.07, biasX: 0, biasY: -0.01, bold: 0.3 },
  cemal: { sigma: 0.15, biasX: 0.05, biasY: 0.03, bold: 1 },
  nihat: { sigma: 0.09, biasX: -0.02, biasY: 0, bold: 0.6 },
  sukru: { sigma: 0.11, biasX: 0, biasY: 0, bold: 0.4 },
  hasan: { sigma: 0.2, biasX: 0, biasY: -0.06, bold: 0.2 },
  ferhat: { sigma: 0.12, biasX: 0.03, biasY: 0.02, bold: 0.8 },
  kemal: { sigma: 0.1, biasX: -0.03, biasY: 0, bold: 0.5 },
};
export const DEFAULT_SKILL: DartSkill = { sigma: 0.11, biasX: 0, biasY: 0, bold: 0.5 };

export interface Target { sector: number; ring: Ring; label: string }

/** Kalan puana göre hedef seçimi */
export function chooseTarget(v: DartView, skill: DartSkill): Target {
  const r = v.myRemaining;
  if (v.doubleOut) {
    if (r === 50) return { sector: 25, ring: 'bull', label: 'Boğa' };
    if (r <= 40 && r % 2 === 0) return { sector: r / 2, ring: 'double', label: `Çift ${r / 2}` };
    if (r <= 41) { // tek sayı: 1 at, çift bırak
      return { sector: 1, ring: 'single', label: '1' };
    }
    if (r <= 60) {
      // tekli atıp 32 ya da 40 bırak
      const leave = r - 32 <= 20 && r - 32 >= 1 ? 32 : 40;
      const need = r - leave;
      if (need >= 1 && need <= 20) return { sector: need, ring: 'single', label: String(need) };
    }
    if (r <= 100 && r - 60 >= 1 && (r - 40) % 3 === 0 && (r - 40) / 3 <= 20) return { sector: (r - 40) / 3, ring: 'treble', label: `Üçlü ${(r - 40) / 3}` };
  } else if (r <= 20) {
    return { sector: r, ring: 'single', label: String(r) };
  } else if (r <= 60 && r % 3 === 0 && r / 3 <= 20) {
    return { sector: r / 3, ring: 'treble', label: `Üçlü ${r / 3}` };
  }
  // yüksek puan: iddialılar T20, temkinliler T19 / tekli 20
  if (skill.bold >= 0.5) return { sector: 20, ring: 'treble', label: 'Üçlü 20' };
  return { sector: 19, ring: 'treble', label: 'Üçlü 19' };
}

/** Botun atış noktası (güç ideal; hata kişilikten) */
export function botThrow(v: DartView, skill: DartSkill, rng: Rng): { aim: { x: number; y: number }; point: { x: number; y: number }; target: Target } {
  const target = chooseTarget(v, skill);
  const aim = target.ring === 'bull' ? { x: 0, y: 0 } : aimPoint(target.sector, target.ring);
  const p = throwOutcome(aim, 0.6, 0, rng, skill.sigma);
  return { aim, point: { x: p.x + skill.biasX, y: p.y + skill.biasY }, target };
}
