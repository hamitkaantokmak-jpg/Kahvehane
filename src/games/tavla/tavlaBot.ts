/**
 * Tavla botu: tüm geçerli hamle dizilerini üretir, ortaya çıkan pozisyonları sezgisel olarak puanlar.
 * Tavlada tüm bilgi açıktır; bot yalnızca tahta ve zarları görür (gelecek zarları bilmez).
 */
import { Player, Position, legalSequences, pipCount, Move, allHome } from './tavla';
import type { Difficulty } from '../common/types';

function posKey(p: Position) {
  return p.points.join(',') + '|' + p.bar.join(',') + '|' + p.off.join(',');
}

/** Bir açık pulun rakip tarafından vurulma olasılığına kaba yaklaşım: menzildeki rakip pulu sayısı. */
function shotsAt(pos: Position, me: Player, i: number): number {
  const opp = (1 - me) as Player;
  let shots = 0;
  // rakip pullar i'ye doğru hareket eder; rakip 1 ise artan yönde, i'den küçük konumlardan gelir
  for (let d = 1; d <= 12; d++) {
    const src = opp === 1 ? i - d : i + d;
    let has = false;
    if (src < 0 || src > 23) {
      // bar'dan giriş
      if (pos.bar[opp] > 0 && ((opp === 1 && src === -1) || (opp === 0 && src === 24))) has = true;
    } else {
      const v = pos.points[src];
      has = opp === 0 ? v > 0 : v < 0;
    }
    if (has) shots += d <= 6 ? 11 : 3; // direkt atış 11/36, dolaylı yaklaşık
  }
  return Math.min(shots, 36);
}

export function evaluatePosition(pos: Position, me: Player): number {
  const opp = (1 - me) as Player;
  const sign = me === 0 ? 1 : -1;
  let score = 0;
  score += (pipCount(pos, opp) - pipCount(pos, me)) * 1.0;
  score += pos.off[me] * 6 - pos.off[opp] * 6;
  score += pos.bar[opp] * 14 - pos.bar[me] * 16;
  const racing = isRace(pos);
  for (let i = 0; i < 24; i++) {
    const v = pos.points[i] * sign;
    const inMyHome = me === 0 ? i <= 5 : i >= 18;
    if (v >= 2) {
      score += inMyHome ? 9 : 4;
      // kapı dizisi (prime)
      const next = me === 0 ? i - 1 : i + 1;
      if (next >= 0 && next <= 23 && pos.points[next] * sign >= 2) score += 3;
    } else if (v === 1 && !racing) {
      score -= 2 + shotsAt(pos, me, i) * 0.9 * (inMyHome ? 1.3 : 1);
    }
  }
  if (allHome(pos, me)) score += 8;
  return score;
}

function isRace(pos: Position): boolean {
  // pullar birbirini geçtiyse temas yoktur
  let min0 = 99, max1 = -1;
  for (let i = 0; i < 24; i++) {
    if (pos.points[i] > 0) min0 = Math.min(min0, i);
    if (pos.points[i] < 0) max1 = Math.max(max1, i);
  }
  if (pos.bar[0] || pos.bar[1]) return false;
  // oyuncu 0 aşağı, oyuncu 1 yukarı gidiyor: oyuncu 0'ın en yüksek pulu oyuncu 1'in en düşüğünden küçükse yarış
  let max0 = -1, min1 = 99;
  for (let i = 0; i < 24; i++) {
    if (pos.points[i] > 0) max0 = Math.max(max0, i);
    if (pos.points[i] < 0) min1 = Math.min(min1, i);
  }
  void min0; void max1;
  return max0 < min1;
}

/**
 * Bir açık pulun (me'nin i hanesindeki) bir sonraki rakip zarında vurulma olasılığı: 36 zar kombinasyonu
 * tek tek sayılır; ara durakların kapalı olup olmadığı kontrol edilir.
 */
export function hitProbability(pos: Position, me: Player, i: number): number {
  const opp = (1 - me) as Player;
  const sign = opp === 0 ? 1 : -1; // rakibin pozitif gösterimi
  const oppAt = (k: number) => (k === -1 || k === 24 ? pos.bar[opp] > 0 : k >= 0 && k <= 23 && pos.points[k] * sign > 0);
  const blocked = (k: number) => k >= 0 && k <= 23 && pos.points[k] * sign <= -2;
  // rakip 1 artan yönde, rakip 0 azalan yönde hareket eder: kaynak = i - dist*dir
  const dir = opp === 1 ? 1 : -1;
  const srcOf = (dist: number) => {
    const k = i - dir * dist;
    if (opp === 1 && k < 0) return k === -1 ? -1 : null; // bar girişi: -1
    if (opp === 0 && k > 23) return k === 24 ? 24 : null;
    return k;
  };
  const canReach = (steps: number[]) => {
    const total = steps.reduce((a, b) => a + b, 0);
    const src = srcOf(total);
    if (src === null || !oppAt(src)) return false;
    let at = src;
    for (let k = 0; k < steps.length - 1; k++) { at += dir * steps[k]; if (blocked(at)) return false; }
    return true;
  };
  let hits = 0;
  for (let a = 1; a <= 6; a++)
    for (let b = 1; b <= 6; b++) {
      let ok: boolean;
      if (a === b) ok = [1, 2, 3, 4].some((n) => canReach(Array(n).fill(a)));
      else ok = canReach([a]) || canReach([b]) || canReach([a, b]) || canReach([b, a]);
      if (ok) hits++;
    }
  return hits / 36;
}

/** Zor seviye değerlendirme: tam vurulma olasılığı, kapı dizisi uzunluğu, yarışta pip + toplama verimi. */
export function evaluateHard(pos: Position, me: Player): number {
  const opp = (1 - me) as Player;
  const sign = me === 0 ? 1 : -1;
  const race = isRace(pos);
  const pipDiff = pipCount(pos, opp) - pipCount(pos, me);
  if (race) {
    let wastage = 0;
    for (let i = 0; i < 24; i++) if (pos.points[i] * sign > 3) wastage += pos.points[i] * sign - 3;
    return pipDiff * 1.5 + pos.off[me] * 8 - pos.off[opp] * 8 - wastage * 0.6;
  }
  let score = pipDiff * 0.8 + (pos.off[me] - pos.off[opp]) * 6 + pos.bar[opp] * 18 - pos.bar[me] * 20;
  let run = 0, bestRun = 0;
  for (let step = 0; step < 24; step++) {
    const i = me === 0 ? step : 23 - step; // kendi evimden dışarı doğru
    const v = pos.points[i] * sign;
    const inHome = step <= 5;
    if (v >= 2) { run++; bestRun = Math.max(bestRun, run); score += inHome ? 7 : 3; }
    else run = 0;
    if (v === 1) {
      const p = hitProbability(pos, me, i);
      // vurulursa kaybedilen mesafe: pulun kat ettiği yol
      const lost = me === 0 ? 24 - i : i + 1;
      score -= p * (12 + lost * 0.5);
    }
  }
  score += bestRun * bestRun * 2.2;
  if (allHome(pos, me)) score += 6;
  return score;
}

export function chooseSequence(pos: Position, me: Player, dice: number[], rng: () => number = Math.random, noise = 0.5, diff: Difficulty = 'medium'): Move[] {
  if (diff === 'easy') noise = Math.max(noise, 30);
  const seqs = legalSequences(pos, me, dice);
  let best: Move[] = [];
  let bestScore = -Infinity;
  const seen = new Set<string>();
  for (const s of seqs) {
    const k = posKey(s.result);
    if (seen.has(k)) continue;
    seen.add(k);
    const sc = (diff === 'hard' ? evaluateHard(s.result, me) : diff === 'easy' ? pipCount(s.result, (1 - me) as Player) - pipCount(s.result, me) : evaluatePosition(s.result, me)) + rng() * (diff === 'hard' ? 0.2 : noise);
    if (sc > bestScore) { bestScore = sc; best = s.moves; }
  }
  return best;
}
