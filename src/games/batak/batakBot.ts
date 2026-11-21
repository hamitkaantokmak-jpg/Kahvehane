/**
 * Batak botu: ihale (el gücü tahmini), koz seçimi ve oynayış. Yalnızca BatakView'deki bilgiyi kullanır.
 */
import type { Difficulty } from '../common/types';
import type { Rng } from '../common/rng';
import { Suit, power } from '../trick/trick';
import { BatakView, Bid, partnerOf } from './batak';
import { bestTrump, cheapestWinner, lowest, highest, leadToWin, winningPlayer, isMaster } from '../trick/trickBot';

/** İhale kararı */
export function decideBid(v: BatakView, rng: Rng, diff: Difficulty = 'medium'): Bid {
  const legal = v.legalBids;
  const canPass = legal.includes('pass');
  const nums = legal.filter((b): b is number => typeof b === 'number');
  const { tricks } = bestTrump(v.hand);
  // eşlide ortağın katkısı (ortak ihale verdiyse güçlü sayılır)
  const partnerBid = v.partners ? v.bids[partnerOf(v.me)] : null;
  const partnerHelp = v.partners ? (typeof partnerBid === 'number' ? partnerBid * 0.5 : 2.6) : 0;
  const noise = diff === 'easy' ? (rng() - 0.5) * 2.4 : diff === 'medium' ? (rng() - 0.5) * 0.8 : 0;
  const est = tricks + partnerHelp + noise - (diff === 'hard' ? 0.3 : 0);
  // ortağın ihalesini gereksiz yere yükseltme
  if (v.partners && typeof partnerBid === 'number' && v.bidder === partnerOf(v.me) && canPass && est < v.highBid + 2) return 'pass';
  const target = Math.floor(est);
  const ok = nums.filter((b) => b <= target);
  if (ok.length && (diff !== 'easy' || rng() < 0.8)) return ok[0];
  return canPass ? 'pass' : nums[0];
}

export function decideTrump(v: BatakView): Suit {
  return bestTrump(v.hand).suit;
}

/** Oynanacak kart */
export function chooseBatakCard(v: BatakView, rng: Rng, diff: Difficulty = 'medium'): number {
  const legal = v.legal;
  if (legal.length === 1) return legal[0].id;
  if (diff === 'easy' && rng() < 0.35) return legal[Math.floor(rng() * legal.length)].id;
  const trump = v.trump;
  const memory = diff === 'hard' ? v.played : v.played.slice(-12);
  if (!v.trick.length) {
    // ihaleci ve kozu güçlüyse kozları çek
    const myTrumps = legal.filter((c) => c.suit === trump);
    const isBidSide = v.bidder === v.me || (v.partners && v.bidder === partnerOf(v.me));
    if (isBidSide && myTrumps.length >= 3 && myTrumps.some((c) => isMaster(c, v.hand, memory))) return highest(myTrumps).id;
    return leadToWin(legal, v.hand, memory, trump).id;
  }
  const winner = winningPlayer(v.trick, trump);
  const partnerWinning = v.partners && winner === partnerOf(v.me);
  // ortak eli alıyorsa ve sonuncu oynuyorsam ya da ortağın kartı en büyükse: küçük at
  if (partnerWinning) {
    const pc = v.trick.find((t) => t.player === winner)!.card;
    const last = v.trick.length === 3;
    if (last || isMaster(pc, v.hand, memory)) return lowest(legal.filter((c) => c.suit !== trump).length ? legal.filter((c) => c.suit !== trump) : legal).id;
  }
  const win = cheapestWinner(legal, v.trick, trump, v.me);
  // "el almayan cezalı": ihaleyi almayan taraftaysan ve henüz hiç el almadıysan (eşlide takımca) ilk fırsatta al
  const bidSide = v.bidder === v.me || (v.partners && v.bidder === partnerOf(v.me));
  const myTricks = v.tricksWon[v.me] + (v.partners ? v.tricksWon[partnerOf(v.me)] : 0);
  if (win && v.zeroPenalty && !bidSide && myTricks === 0 && diff !== 'easy') return win.id;
  // sonuncuysam en ucuz kazananla al; değilsem ancak kartım rengin en büyüğüyse ya da kozsa al
  if (win) {
    const last = v.trick.length === 3;
    if (last || win.suit === trump || isMaster(win, v.hand, memory) || diff === 'easy') return win.id;
    const hi = highest(legal);
    if (power(hi) >= 13 && hi.suit === win.suit) return hi.id;
  }
  return lowest(legal).id;
}
