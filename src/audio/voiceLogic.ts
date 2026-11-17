/**
 * NPC mırıltısı (Sims/Animal Crossing tarzı) — saf mantık. WebAudio yok; ses katmanı (Voice.ts) bunu çalar.
 * Metinden hece dizisi üretir: her ünlü grubu bir "hece"; ünlü türü metindeki harfe göre (Türkçe ünlüler),
 * tonlama: soru (?) sonda yükselir, ünlem (!) daha yüksek ve hızlı.
 */
import type { Rng } from '../games/common/rng';

export type Vowel = 'a' | 'e' | 'i' | 'o' | 'u';

export interface VoiceProfile {
  /** temel ses perdesi (Hz) */
  base: number;
  /** saniyedeki hece */
  rate: number;
  /** perde dalgalanması (0..1) */
  range: number;
  /** dalga biçimi karakteri */
  timbre: 'sawtooth' | 'square' | 'triangle';
  /** ses yüksekliği çarpanı */
  gain: number;
}

/** Her NPC'nin kendine özgü sesi */
export const VOICES: Record<string, VoiceProfile> = {
  riza: { base: 105, rate: 6, range: 0.25, timbre: 'sawtooth', gain: 1 }, // kalın, ağır, homurtulu
  cemal: { base: 135, rate: 9, range: 0.35, timbre: 'square', gain: 0.9 }, // hızlı, iddialı
  nihat: { base: 190, rate: 10, range: 0.5, timbre: 'triangle', gain: 0.9 }, // ince, kıkırdak
  sukru: { base: 165, rate: 11, range: 0.4, timbre: 'triangle', gain: 0.85 }, // çok konuşan, hızlı
  hasan: { base: 95, rate: 4, range: 0.15, timbre: 'sawtooth', gain: 0.7 }, // uykulu, yavaş
  ferhat: { base: 150, rate: 9.5, range: 0.55, timbre: 'square', gain: 1 }, // coşkulu
  kemal: { base: 120, rate: 6.5, range: 0.2, timbre: 'sawtooth', gain: 0.9 }, // resmi, tekdüze
  player: { base: 140, rate: 8, range: 0.35, timbre: 'triangle', gain: 0.8 },
};

export function profileFor(id: string, voicePitch = 1): VoiceProfile {
  return VOICES[id] ?? { base: 140 * voicePitch, rate: 8, range: 0.35, timbre: 'triangle', gain: 0.85 };
}

export interface Syllable {
  vowel: Vowel;
  /** başlangıç (sn, dizinin başına göre) */
  at: number;
  dur: number;
  /** temel perdeye çarpan */
  pitch: number;
  gain: number;
}

const VOWEL_MAP: Record<string, Vowel> = { a: 'a', e: 'e', ı: 'i', i: 'i', o: 'o', ö: 'o', u: 'u', ü: 'u' };

/** Metindeki ünlü grupları (en az 2, en fazla 14 hece) */
export function vowelsOf(text: string): Vowel[] {
  const out: Vowel[] = [];
  let prevVowel = false;
  for (const ch of text.toLocaleLowerCase('tr')) {
    const v = VOWEL_MAP[ch];
    if (v && !prevVowel) out.push(v);
    prevVowel = !!v;
  }
  while (out.length < 2) out.push('a');
  return out.slice(0, 14);
}

export function syllablesFor(text: string, p: VoiceProfile, rng: Rng): Syllable[] {
  const vowels = vowelsOf(text);
  const question = /\?\s*$/.test(text.trim());
  const exclaim = /!/.test(text);
  const step = 1 / (p.rate * (exclaim ? 1.15 : 1));
  const out: Syllable[] = [];
  let at = 0;
  vowels.forEach((v, i) => {
    const last = i === vowels.length - 1;
    const contour = question && last ? 1.35 : 1 + (rng() - 0.5) * p.range;
    const dur = step * (0.6 + rng() * 0.5) * (last ? 1.4 : 1);
    out.push({ vowel: v, at, dur, pitch: contour * (exclaim ? 1.1 : 1), gain: (0.7 + rng() * 0.3) * p.gain * (exclaim ? 1.2 : 1) });
    at += dur + step * 0.15;
  });
  return out;
}

export function totalDuration(s: Syllable[]) { return s.length ? s[s.length - 1].at + s[s.length - 1].dur : 0; }

/** Aynı anda sesli konuşacaklar: dinleyiciye en yakın `max` kişi (menzil içinde); diğerleri yalnızca balon */
export function selectSpeakers<T extends { id: string; x: number; z: number }>(listener: { x: number; z: number }, speakers: T[], max = 3, range = 14): T[] {
  return speakers
    .map((s) => ({ s, d: Math.hypot(s.x - listener.x, s.z - listener.z) }))
    .filter((e) => e.d <= range)
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map((e) => e.s);
}
