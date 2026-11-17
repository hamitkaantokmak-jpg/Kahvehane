/**
 * Prosedürel ses sentezi (WebAudio). Hiçbir ses dosyası kullanılmaz → telif riski yok.
 */
export type SfxName =
  | 'glass' | 'tile' | 'dice' | 'card' | 'deal' | 'chair' | 'laugh' | 'bonk' | 'slap' | 'whoosh' | 'pop'
  | 'coin' | 'glassBreak' | 'splash' | 'grunt' | 'angry' | 'surprise' | 'win' | 'lose' | 'pisti' | 'click' | 'clap' | 'tableSlam' | 'pour' | 'snore' | 'tvChannel' | 'step';

export interface AudioSettings { master: number; sfx: number; ambience: number; muted: boolean }

export class Sfx {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private noiseBuf: AudioBuffer | null = null;
  private ambienceStarted = false;
  settings: AudioSettings = { master: 0.8, sfx: 0.9, ambience: 0.5, muted: false };

  /** NPC sesleri için çıkış (ses kilidi açılmadıysa null) */
  voiceOutput(): { ctx: AudioContext; out: AudioNode } | null {
    if (!this.ctx || this.settings.muted) return null;
    return { ctx: this.ctx, out: this.sfxBus };
  }

  /** Kullanıcı etkileşimiyle çağrılmalı (tarayıcı otomatik çalma kuralları). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.ambBus = this.ctx.createGain();
      this.ambBus.connect(this.master);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applySettings();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (!this.ambienceStarted) { this.ambienceStarted = true; this.startAmbience(); }
  }

  applySettings() {
    if (!this.ctx) return;
    const m = this.settings.muted ? 0 : this.settings.master;
    this.master.gain.value = m;
    this.sfxBus.gain.value = this.settings.sfx;
    this.ambBus.gain.value = this.settings.ambience * 0.6;
  }

  private noise(dur: number, filterFreq: number, q = 1, type: BiquadFilterType = 'bandpass', gain = 0.5, when = 0, attack = 0.005) {
    const c = this.ctx!;
    const t = c.currentTime + when;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.3, when = 0, slideTo?: number, attack = 0.005) {
    const c = this.ctx!;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Basit formant tabanlı "ses" (ha, hı, ooo) */
  private voice(f0: number, dur: number, vowel: 'a' | 'o' | 'e' | 'u', gain = 0.25, when = 0, slide = 1) {
    const c = this.ctx!;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * slide, t + dur);
    const formants: Record<string, [number, number]> = { a: [800, 1200], o: [500, 900], e: [450, 1900], u: [350, 800] };
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const ff of formants[vowel]) {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = ff;
      bp.Q.value = 6;
      o.connect(bp).connect(out);
    }
    out.connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(name: SfxName, pitch = 1) {
    if (!this.ctx || this.settings.muted) return;
    const r = () => 0.9 + Math.random() * 0.2;
    switch (name) {
      case 'glass':
        this.tone(2600 * r(), 0.25, 'sine', 0.15);
        this.tone(3900 * r(), 0.18, 'sine', 0.08, 0.01);
        break;
      case 'tile':
        this.noise(0.06, 2500, 2, 'bandpass', 0.5);
        this.tone(900 * r(), 0.05, 'square', 0.05);
        break;
      case 'dice':
        for (let i = 0; i < 6; i++) this.noise(0.05, 3000 + Math.random() * 1500, 3, 'bandpass', 0.35, i * 0.07 + Math.random() * 0.03);
        break;
      case 'card':
        this.noise(0.08, 5000, 1, 'highpass', 0.25);
        break;
      case 'deal':
        for (let i = 0; i < 4; i++) this.noise(0.06, 5500, 1, 'highpass', 0.2, i * 0.08);
        break;
      case 'chair':
        this.noise(0.35, 400 * r(), 8, 'bandpass', 0.4, 0, 0.05);
        this.tone(180, 0.3, 'sawtooth', 0.04, 0, 140);
        break;
      case 'laugh':
        for (let i = 0; i < 5; i++) this.voice(180 * pitch * (1 + i * 0.03), 0.13, 'a', 0.22, i * 0.16, 0.85);
        break;
      case 'bonk':
        this.tone(320, 0.35, 'sine', 0.5, 0, 90);
        this.tone(1200, 0.12, 'triangle', 0.15, 0, 600);
        this.noise(0.08, 1500, 2, 'bandpass', 0.4);
        break;
      case 'slap':
        this.noise(0.1, 2000, 0.8, 'bandpass', 0.7);
        break;
      case 'whoosh':
        this.noise(0.3, 800, 2, 'bandpass', 0.35, 0, 0.12);
        break;
      case 'pop':
        this.tone(500, 0.1, 'sine', 0.3, 0, 1100);
        break;
      case 'grunt':
        this.voice(130 * pitch, 0.25, 'u', 0.25, 0, 0.8);
        break;
      case 'angry':
        this.voice(150 * pitch, 0.18, 'e', 0.3, 0, 1.2);
        this.voice(170 * pitch, 0.3, 'a', 0.3, 0.2, 0.7);
        break;
      case 'surprise':
        this.voice(220 * pitch, 0.4, 'o', 0.28, 0, 1.6);
        break;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.2, i * 0.12));
        break;
      case 'lose':
        [392, 370, 349, 262].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.18, i * 0.22, f * 0.97));
        break;
      case 'pisti':
        [784, 988, 1175].forEach((f, i) => this.tone(f, 0.18, 'square', 0.08, i * 0.08));
        this.tone(1568, 0.4, 'triangle', 0.15, 0.24);
        break;
      case 'coin':
        [1568, 2093, 2637].forEach((f, i) => this.tone(f * r(), 0.12, 'triangle', 0.12, i * 0.07));
        this.noise(0.05, 6000, 2, 'bandpass', 0.15, 0.03);
        break;
      case 'glassBreak':
        for (let i = 0; i < 7; i++) this.tone(2400 + Math.random() * 3200, 0.12 + Math.random() * 0.15, 'triangle', 0.08, i * 0.025 + Math.random() * 0.02);
        this.noise(0.25, 5500, 0.7, 'highpass', 0.35);
        break;
      case 'splash':
        this.noise(0.35, 900, 1.2, 'bandpass', 0.45, 0, 0.01);
        this.noise(0.5, 2500, 0.8, 'lowpass', 0.15, 0.08, 0.03);
        break;
      case 'click':
        this.tone(1200, 0.04, 'square', 0.05);
        break;
      case 'clap':
        for (let i = 0; i < 6; i++) this.noise(0.05, 1800, 1.2, 'bandpass', 0.5, i * 0.22);
        break;
      case 'tableSlam':
        this.tone(110, 0.3, 'sine', 0.6, 0, 50);
        this.noise(0.15, 600, 1, 'lowpass', 0.6);
        for (let i = 0; i < 4; i++) this.noise(0.04, 3000, 3, 'bandpass', 0.2, 0.08 + i * 0.05);
        break;
      case 'pour':
        this.noise(1.0, 1200, 3, 'bandpass', 0.18, 0, 0.1);
        break;
      case 'snore':
        this.noise(0.9, 250, 4, 'bandpass', 0.35, 0, 0.4);
        break;
      case 'tvChannel':
        this.noise(0.25, 3000, 0.5, 'highpass', 0.2);
        break;
      case 'step':
        this.noise(0.05, 300, 2, 'lowpass', 0.08);
        break;
    }
  }

  /** Ortam uğultusu: filtrelenmiş gürültü + rastgele bardak/taş sesleri */
  private startAmbience() {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 450;
    f.Q.value = 0.8;
    const g = c.createGain();
    g.gain.value = 0.06;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.15;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(f).connect(g).connect(this.ambBus);
    src.start();
    lfo.start();
    const tick = () => {
      if (!this.ctx) return;
      const roll = Math.random();
      if (!this.settings.muted && this.settings.ambience > 0) {
        const save = this.sfxBus;
        this.sfxBus = this.ambBus;
        if (roll < 0.35) this.play('glass');
        else if (roll < 0.6) this.play('tile');
        else if (roll < 0.7) this.play('dice');
        else if (roll < 0.8) this.voice(140 + Math.random() * 80, 0.2, (['a', 'o', 'e', 'u'] as const)[Math.floor(Math.random() * 4)], 0.08);
        this.sfxBus = save;
      }
      setTimeout(tick, 1500 + Math.random() * 3500);
    };
    setTimeout(tick, 2000);
  }
}

export const sfx = new Sfx();
