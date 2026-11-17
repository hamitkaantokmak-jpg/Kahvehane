/**
 * Tavla botu: tüm geçerli hamle dizilerini üretir, ortaya çıkan pozisyonları sezgisel olarak puanlar.
 * Tavlada tüm bilgi açıktır; bot yalnızca tahta ve zarları görür (gelecek zarları bilmez).
 */
import { Player, Position, legalSequences, pipCount, Move, allHome } from './tavla';

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

export function chooseSequence(pos: Position, me: Player, dice: number[], rng: () => number = Math.random, noise = 0.5): Move[] {
  const seqs = legalSequences(pos, me, dice);
  let best: Move[] = [];
  let bestScore = -Infinity;
  const seen = new Set<string>();
  for (const s of seqs) {
    const k = posKey(s.result);
    if (seen.has(k)) continue;
    seen.add(k);
    const sc = evaluatePosition(s.result, me) + rng() * noise;
    if (sc > bestScore) { bestScore = sc; best = s.moves; }
  }
  return best;
}
