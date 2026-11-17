/**
 * NPC sesleri (Aşama 6). Konuşma balonu çıkınca NPC'nin kendine özgü prosedürel "mırıltısı" çalar.
 * Konumsal: PannerNode, dinleyici kamerada. Aynı anda en yakın 3 kişi sesli konuşur, diğerleri yalnızca balon.
 *
 * Gelecek için soyutlama: `VoiceSource` arayüzü. Bir NPC + replik için kayıtlı ses dosyası (ör. şiveli kayıt)
 * eklenirse `SampleVoiceSource` onu çalar; yoksa `BabbleVoiceSource` mırıltı üretir. Şu an hiç kayıt yok.
 */
import { profileFor, syllablesFor, totalDuration, selectSpeakers, VoiceProfile, Vowel } from './voiceLogic';
import type { Rng } from '../games/common/rng';

export interface Vec3 { x: number; y: number; z: number }

export interface VoiceSource {
  /** Bu konuşmayı çalabilir mi */
  canPlay(id: string, text: string): boolean;
  /** Çal; süreyi (sn) döndürür */
  play(ctx: AudioContext, out: AudioNode, id: string, text: string): number;
}

/** İleride: kayıtlı replik sesleri (id + metin → AudioBuffer). Şimdilik boş kayıt defteri. */
export class SampleVoiceSource implements VoiceSource {
  private buffers = new Map<string, AudioBuffer>();
  register(id: string, text: string, buf: AudioBuffer) { this.buffers.set(`${id}|${text}`, buf); }
  canPlay(id: string, text: string) { return this.buffers.has(`${id}|${text}`); }
  play(ctx: AudioContext, out: AudioNode, id: string, text: string) {
    const buf = this.buffers.get(`${id}|${text}`)!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(out);
    src.start();
    return buf.duration;
  }
}

const FORMANTS: Record<Vowel, [number, number]> = { a: [800, 1250], e: [480, 1900], i: [320, 2300], o: [520, 900], u: [360, 780] };

/** Prosedürel mırıltı: hece başına osilatör + iki formant filtresi + zarf */
export class BabbleVoiceSource implements VoiceSource {
  constructor(private rng: Rng, private voicePitchOf: (id: string) => number) {}
  canPlay() { return true; }
  play(ctx: AudioContext, out: AudioNode, id: string, text: string): number {
    const p: VoiceProfile = profileFor(id, this.voicePitchOf(id));
    const syl = syllablesFor(text, p, this.rng);
    const t0 = ctx.currentTime + 0.02;
    for (const s of syl) {
      const t = t0 + s.at;
      const o = ctx.createOscillator();
      o.type = p.timbre;
      const f = p.base * s.pitch;
      o.frequency.setValueAtTime(f * 0.94, t);
      o.frequency.linearRampToValueAtTime(f * 1.04, t + s.dur * 0.5);
      o.frequency.linearRampToValueAtTime(f * 0.97, t + s.dur);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.16 * s.gain, t + Math.min(0.03, s.dur * 0.3));
      env.gain.exponentialRampToValueAtTime(0.0001, t + s.dur);
      for (const ff of FORMANTS[s.vowel]) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = ff;
        bp.Q.value = 5;
        o.connect(bp).connect(env);
      }
      env.connect(out);
      o.start(t);
      o.stop(t + s.dur + 0.05);
    }
    return totalDuration(syl);
  }
}

interface Active { id: string; until: number; panner: PannerNode }

export class VoicePlayer {
  enabled = true;
  readonly samples = new SampleVoiceSource();
  private babble: BabbleVoiceSource;
  private active: Active[] = [];
  private bus: GainNode | null = null;
  /** test/istatistik: sesli konuşanlar */
  spoken: string[] = [];
  muted: string[] = [];

  constructor(private getCtx: () => { ctx: AudioContext; out: AudioNode } | null, rng: Rng, voicePitchOf: (id: string) => number) {
    this.babble = new BabbleVoiceSource(rng, voicePitchOf);
  }

  /** Dinleyiciyi (kamera) güncelle */
  setListener(pos: Vec3, forward: Vec3) {
    const c = this.getCtx();
    if (!c) return;
    const l = c.ctx.listener;
    if (l.positionX) {
      l.positionX.value = pos.x; l.positionY.value = pos.y; l.positionZ.value = pos.z;
      l.forwardX.value = forward.x; l.forwardY.value = forward.y; l.forwardZ.value = forward.z;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      (l as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(pos.x, pos.y, pos.z);
    }
  }

  /**
   * Konuşma: sesli mi çalacağına karar verir (en yakın 3), çalar ve süreyi döndürür (çalmadıysa 0).
   * `talkers`: şu anda konuşan/konuşacak herkesin konumu (seçim için).
   */
  speak(id: string, text: string, pos: Vec3, listener: Vec3, now: number): number {
    if (!this.enabled) return 0;
    const c = this.getCtx();
    if (!c) return 0;
    this.active = this.active.filter((a) => a.until > now);
    const candidates = [...this.active.map((a) => ({ id: a.id, x: a.panner.positionX?.value ?? 0, z: a.panner.positionZ?.value ?? 0 })), { id, x: pos.x, z: pos.z }];
    const chosen = selectSpeakers(listener, candidates, 3);
    if (!chosen.some((s) => s.id === id)) { this.muted.push(id); return 0; }
    // yeni konuşmacıya yer açmak için seçilmeyen en uzaktakini sustur (zarf zaten kısa; sadece kaydı düşer)
    this.active = this.active.filter((a) => chosen.some((s) => s.id === a.id));
    if (!this.bus) { this.bus = c.ctx.createGain(); this.bus.gain.value = 0.9; this.bus.connect(c.out); }
    const panner = c.ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1.5;
    panner.rolloffFactor = 1.2;
    if (panner.positionX) { panner.positionX.value = pos.x; panner.positionY.value = pos.y; panner.positionZ.value = pos.z; }
    else (panner as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(pos.x, pos.y, pos.z);
    panner.connect(this.bus);
    const src: VoiceSource = this.samples.canPlay(id, text) ? this.samples : this.babble;
    const dur = src.play(c.ctx, panner, id, text);
    this.active.push({ id, until: now + dur, panner });
    this.spoken.push(id);
    setTimeout(() => panner.disconnect(), (dur + 0.5) * 1000);
    return dur;
  }
}
