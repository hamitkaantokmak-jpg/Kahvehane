/**
 * KING kural motoru (4 kişi, tekli). Saf mantık, JSON'a çevrilebilir durum.
 *
 * Seçilen kurallar (kahvehanelerde en yaygın hali):
 * - 52 kart, 13'er kart. Oyunu seçen sırayla değişir; seçen ilk kartı açar.
 * - Tam King 20 eldir: her oyuncu 2 kez KOZ, 3 kez CEZA seçer; her ceza türü maçta en çok 2 kez oynanır.
 *   Kısa King 8 eldir: her oyuncu 1 koz + 1 ceza seçer; her ceza en çok 1 kez.
 * - Cezalar: El almaz (her el −50), Kupa almaz (her kupa −30), Erkek almaz (her papaz/vale −60),
 *   Kız almaz (her kız −100), Rıfkı (kupa papazı −320), Son iki (son iki elin her biri −180).
 *   Koz: seçen kozu belirler, alınan her el +50.
 * - Oynayış: açılan renge uymak zorunludur. Rengin yoksa: kozda koz atmak zorunludur; rıfkıda elinde kupa papazı
 *   varsa onu atmak zorunludur; diğer cezalarda istediğini atarsın.
 * - Kozda koz açılmadan kozla, kupa almaz ve rıfkıda kupa açılmadan kupayla el açılamaz (elinde başka renk yoksa açılır).
 * - Ceza elleri, cezanın tamamı alınınca erken biter (ör. rıfkı papaz alınınca). El almaz, son iki ve koz 13 el sürer.
 * - Maç sonunda toplamı en yüksek olan kazanır.
 */
import { Rng } from '../common/rng';
import { Card, Suit, Play, deal4, trickWinner, next } from '../trick/trick';

export type Penalty = 'el' | 'kupa' | 'erkek' | 'kiz' | 'rifki' | 'sonIki';
export type Contract = 'koz' | Penalty;

export const PENALTIES: Penalty[] = ['el', 'kupa', 'erkek', 'kiz', 'rifki', 'sonIki'];

export const CONTRACT_META: Record<Contract, { label: string; desc: string }> = {
  koz: { label: 'Koz', desc: 'Kozu sen seçersin, her el +50' },
  el: { label: 'El almaz', desc: 'Her el −50' },
  kupa: { label: 'Kupa almaz', desc: 'Her kupa −30' },
  erkek: { label: 'Erkek almaz', desc: 'Her papaz ve vale −60' },
  kiz: { label: 'Kız almaz', desc: 'Her kız −100' },
  rifki: { label: 'Rıfkı', desc: 'Kupa papazı −320' },
  sonIki: { label: 'Son iki', desc: 'Son iki elin her biri −180' },
};

export interface KingOptions {
  /** Kısa King (8 el) */
  short: boolean;
}

export type KingPhase = 'choose' | 'trump' | 'play' | 'handOver' | 'matchOver';

export interface KingState {
  options: KingOptions;
  hands: Card[][];
  chooser: number;
  current: number;
  phase: KingPhase;
  contract: Contract | null;
  trump: Suit | null;
  /** koz ya da kupa açıldı mı */
  broken: boolean;
  trick: Play[];
  trickNo: number;
  lastTrick: Play[] | null;
  lastWinner: number | null;
  /** her oyuncunun bu elde aldığı kartlar */
  taken: Card[][];
  tricksWon: number[];
  handScores: number[] | null;
  totals: number[];
  handNo: number;
  /** maç boyunca ceza türlerinin kullanım sayısı */
  penaltyUses: Record<Penalty, number>;
  /** oyuncu başına seçilen koz / ceza sayısı */
  kozChosen: number[];
  cezaChosen: number[];
  /** oynanan sözleşmeler (tablo için) */
  history: { handNo: number; chooser: number; contract: Contract; trump: Suit | null; scores: number[] }[];
  played: Card[];
  /** son iki: 12. ve 13. eli alanlar */
  sonIkiWinners: number[];
}

export class KingError extends Error {}

export const quotas = (o: KingOptions) => (o.short ? { koz: 1, ceza: 1, perPenalty: 1, hands: 8 } : { koz: 2, ceza: 3, perPenalty: 2, hands: 20 });

export function newKing(options: KingOptions, rng: Rng, firstChooser = 0): KingState {
  const s: KingState = {
    options, hands: [], chooser: firstChooser, current: firstChooser, phase: 'choose', contract: null, trump: null, broken: false,
    trick: [], trickNo: 0, lastTrick: null, lastWinner: null, taken: [[], [], [], []], tricksWon: [0, 0, 0, 0], handScores: null,
    totals: [0, 0, 0, 0], handNo: 1, penaltyUses: { el: 0, kupa: 0, erkek: 0, kiz: 0, rifki: 0, sonIki: 0 },
    kozChosen: [0, 0, 0, 0], cezaChosen: [0, 0, 0, 0], history: [], played: [], sonIkiWinners: [],
  };
  startHand(s, rng);
  return s;
}

function startHand(s: KingState, rng: Rng) {
  s.hands = deal4(rng);
  s.contract = null;
  s.trump = null;
  s.broken = false;
  s.trick = [];
  s.trickNo = 0;
  s.lastTrick = null;
  s.lastWinner = null;
  s.taken = [[], [], [], []];
  s.tricksWon = [0, 0, 0, 0];
  s.handScores = null;
  s.played = [];
  s.sonIkiWinners = [];
  s.phase = 'choose';
  s.current = s.chooser;
}

export function nextHand(s: KingState, rng: Rng) {
  if (s.phase !== 'handOver') throw new KingError('El bitmedi.');
  s.handNo++;
  s.chooser = next(s.chooser);
  startHand(s, rng);
}

/** Seçenin seçebileceği sözleşmeler (kotalara göre) */
export function availableContracts(s: KingState, p = s.chooser): Contract[] {
  const q = quotas(s.options);
  const out: Contract[] = [];
  if (s.kozChosen[p] < q.koz) out.push('koz');
  if (s.cezaChosen[p] < q.ceza) for (const pen of PENALTIES) if (s.penaltyUses[pen] < q.perPenalty) out.push(pen);
  return out;
}

export function chooseContract(s: KingState, p: number, c: Contract) {
  if (s.phase !== 'choose' || s.chooser !== p) throw new KingError('Oyunu seçme sırası sende değil.');
  if (!availableContracts(s, p).includes(c)) throw new KingError('Bu oyun seçilemez (hakkın kalmadı).');
  s.contract = c;
  if (c === 'koz') { s.kozChosen[p]++; s.phase = 'trump'; return; }
  s.cezaChosen[p]++;
  s.penaltyUses[c]++;
  s.phase = 'play';
  s.current = p;
}

export function chooseTrump(s: KingState, p: number, suit: Suit) {
  if (s.phase !== 'trump' || s.chooser !== p) throw new KingError('Kozu oyunu seçen belirler.');
  s.trump = suit;
  s.phase = 'play';
  s.current = p;
}

const isHeart = (c: Card) => c.suit === 1;
const isRifki = (c: Card) => c.suit === 1 && c.rank === 13;

export function legalCards(s: KingState, p: number): Card[] {
  if (s.phase !== 'play' || s.current !== p) return [];
  const hand = s.hands[p];
  const ct = s.contract!;
  if (!s.trick.length) {
    // açılış kısıtı: kozda koz, kupa/rıfkıda kupa açılmadan açılamaz
    const blocked = ct === 'koz' ? (c: Card) => c.suit === s.trump : ct === 'kupa' || ct === 'rifki' ? isHeart : null;
    if (blocked && !s.broken) {
      const ok = hand.filter((c) => !blocked(c));
      if (ok.length) return ok;
    }
    return hand;
  }
  const lead = s.trick[0].card.suit;
  const follow = hand.filter((c) => c.suit === lead);
  if (follow.length) return follow;
  if (ct === 'koz') {
    const trumps = hand.filter((c) => c.suit === s.trump);
    if (trumps.length) return trumps;
  }
  if (ct === 'rifki') {
    const k = hand.find(isRifki);
    if (k) return [k];
  }
  return hand;
}

/** Bir kartın bu sözleşmedeki ceza değeri (koz/el/son iki için 0: onlar el bazında sayılır) */
export function cardPenalty(c: Card, ct: Contract): number {
  switch (ct) {
    case 'kupa': return isHeart(c) ? 30 : 0;
    case 'erkek': return c.rank === 13 || c.rank === 11 ? 60 : 0;
    case 'kiz': return c.rank === 12 ? 100 : 0;
    case 'rifki': return isRifki(c) ? 320 : 0;
    default: return 0;
  }
}

/** Bu sözleşmede dağıtılabilecek toplam ceza kartı sayısı (erken bitiş için) */
const PENALTY_CARDS: Partial<Record<Contract, number>> = { kupa: 13, erkek: 8, kiz: 4, rifki: 1 };

export interface PlayResult { trickDone: boolean; winner: number | null; handOver: boolean }

export function playCard(s: KingState, p: number, cardId: number): PlayResult {
  if (s.phase !== 'play') throw new KingError('Kart oynama zamanı değil.');
  if (s.current !== p) throw new KingError('Sıra sende değil.');
  const c = s.hands[p].find((x) => x.id === cardId);
  if (!c) throw new KingError('Bu kart elinde yok.');
  if (!legalCards(s, p).some((x) => x.id === cardId)) throw new KingError(s.contract === 'rifki' && s.hands[p].some(isRifki) ? 'Rıfkı elindeyken rengin yoksa papazı atmak zorundasın.' : 'Bu kart şimdi oynanamaz (renge uy).');
  s.hands[p] = s.hands[p].filter((x) => x.id !== cardId);
  s.trick.push({ player: p, card: c });
  s.played.push(c);
  if ((s.contract === 'koz' && c.suit === s.trump) || ((s.contract === 'kupa' || s.contract === 'rifki') && isHeart(c))) s.broken = true;
  if (s.trick.length < 4) { s.current = next(p); return { trickDone: false, winner: null, handOver: false }; }
  const w = trickWinner(s.trick, s.contract === 'koz' ? s.trump : null);
  s.trickNo++;
  s.tricksWon[w]++;
  s.taken[w].push(...s.trick.map((t) => t.card));
  s.lastTrick = s.trick;
  s.lastWinner = w;
  s.trick = [];
  s.current = w;
  // son iki: 12. ve 13. eller
  const ct = s.contract!;
  let over = s.hands.every((h) => h.length === 0);
  const need = PENALTY_CARDS[ct];
  if (!over && need !== undefined) {
    const got = s.taken.reduce((a, t) => a + t.filter((x) => cardPenalty(x, ct) > 0).length, 0);
    if (got >= need) over = true;
  }
  if (ct === 'sonIki' && s.trickNo >= 12) s.sonIkiWinners.push(w);
  if (over) { endHand(s); return { trickDone: true, winner: w, handOver: true }; }
  return { trickDone: true, winner: w, handOver: false };
}

/** El puanı: saf hesap */
export function scoreHand(ct: Contract, taken: Card[][], tricksWon: number[], lastTwo: number[] = []): number[] {
  return [0, 1, 2, 3].map((p) => scoreOf(p) || 0); // -0 yerine 0
  function scoreOf(p: number): number {
    switch (ct) {
      case 'koz': return tricksWon[p] * 50;
      case 'el': return tricksWon[p] * -50;
      case 'sonIki': return lastTwo.filter((w) => w === p).length * -180;
      default: return -taken[p].reduce((a, c) => a + cardPenalty(c, ct), 0);
    }
  }
}

function endHand(s: KingState) {
  const sc = scoreHand(s.contract!, s.taken, s.tricksWon, s.sonIkiWinners);
  s.handScores = sc;
  s.totals = s.totals.map((t, i) => t + sc[i]);
  s.history.push({ handNo: s.handNo, chooser: s.chooser, contract: s.contract!, trump: s.trump, scores: sc });
  s.phase = s.handNo >= quotas(s.options).hands ? 'matchOver' : 'handOver';
}

export function matchWinners(s: KingState): number[] {
  const best = Math.max(...s.totals);
  return [0, 1, 2, 3].filter((p) => s.totals[p] === best);
}

export interface KingView {
  me: number;
  hand: Card[];
  phase: KingPhase;
  chooser: number;
  contract: Contract | null;
  trump: Suit | null;
  broken: boolean;
  trick: Play[];
  trickNo: number;
  tricksWon: number[];
  takenCounts: number[];
  played: Card[];
  legal: Card[];
  available: Contract[];
}

export function viewKing(s: KingState, p: number): KingView {
  return {
    me: p, hand: [...s.hands[p]], phase: s.phase, chooser: s.chooser, contract: s.contract, trump: s.trump, broken: s.broken,
    trick: [...s.trick], trickNo: s.trickNo, tricksWon: [...s.tricksWon], takenCounts: s.taken.map((t) => t.length), played: [...s.played],
    legal: legalCards(s, p), available: s.phase === 'choose' && s.chooser === p ? availableContracts(s, p) : [],
  };
}
