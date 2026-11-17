/**
 * Prosedürel animasyon sistemi.
 * - Taban katmanı: duruş (ayakta / oturuyor / uyuyor / yerde) + hareket hızı (idle/yürüme/koşma) sürekli karışır.
 * - Eylem katmanı: tek seferlik ya da döngülü jestler (kahkaha, alkış, göbek atma, sendeleme...)
 *   yumuşak giriş/çıkışla taban pozun üstüne karışır.
 * - İkincil hareket: göbek, bıyık ve kafa için yay (spring) fiziği; squash & stretch.
 */
import * as THREE from 'three';
import { CharacterModel } from './CharacterModel';

export interface Pose {
  bodyY: number; // kalça yükseklik ofseti
  bodyZ: number;
  lean: number; // gövde öne eğilme (spine.x)
  twist: number; // spine.y
  tilt: number; // spine.z
  headX: number; headY: number; headZ: number;
  shLX: number; shLZ: number; elL: number;
  shRX: number; shRZ: number; elR: number;
  hipLX: number; kneeL: number;
  hipRX: number; kneeR: number;
  squash: number; // + uzama, - basılma
  mouth: number; // 0..1 açıklık
  brow: number; // -1 kızgın, +1 şaşkın
  smile: number; // -1 somurtma .. +1 gülümseme
  blush: number; // 0..1 utanma
  wide: number; // 0..1 faltaşı gibi açık gözler
  rootRotX: number; // tüm vücut (düşme)
  rootRotZ: number;
}

export const ZERO_POSE: Pose = {
  bodyY: 0, bodyZ: 0, lean: 0, twist: 0, tilt: 0, headX: 0, headY: 0, headZ: 0,
  shLX: 0, shLZ: 0.12, elL: -0.15, shRX: 0, shRZ: -0.12, elR: -0.15,
  hipLX: 0, kneeL: 0, hipRX: 0, kneeR: 0, squash: 0, mouth: 0, brow: 0, smile: 0.25, blush: 0, wide: 0, rootRotX: 0, rootRotZ: 0,
};
const KEYS = Object.keys(ZERO_POSE) as (keyof Pose)[];

export type Posture = 'stand' | 'sit' | 'sleepSit';

export type ActionName =
  | 'laugh' | 'clap' | 'bellyDance' | 'slamTable' | 'leanBack' | 'stagger' | 'fall' | 'swing'
  | 'wave' | 'drink' | 'talk' | 'surprise' | 'angry' | 'think' | 'cheer' | 'pour' | 'point' | 'facepalm' | 'carry' | 'shrug';

interface ActionDef {
  duration: number; // saniye (loop ise döngü süresi yok sayılır)
  loop?: boolean;
  blendIn?: number;
  blendOut?: number;
  /** p: 0..1 ilerleme, t: geçen saniye */
  pose: (p: number, t: number, base: Pose, seated: boolean) => Partial<Pose>;
}

const S = Math.sin;
const ease = (x: number) => x * x * (3 - 2 * x);
const pulse = (p: number, a: number, b: number) => (p < a ? 0 : p > b ? 0 : S(((p - a) / (b - a)) * Math.PI));

export const ACTIONS: Record<ActionName, ActionDef> = {
  laugh: {
    duration: 2.2,
    pose: (p, t, _b, seated) => ({
      lean: -0.35 + S(t * 22) * 0.06, headX: -0.45 + S(t * 22) * 0.1, mouth: 0.9 + S(t * 22) * 0.1,
      shLX: -0.3, shLZ: 0.5, elL: -1.6, shRX: -0.3, shRZ: -0.5, elR: -1.6,
      squash: S(t * 22) * 0.05, bodyY: seated ? 0 : Math.abs(S(t * 11)) * 0.04, brow: 0.6,
    }),
  },
  clap: {
    duration: 1.8,
    pose: (_p, t) => {
      const c = Math.abs(S(t * 14));
      return { shLX: -1.1, shLZ: 0.1 + c * 0.45, elL: -1.0, shRX: -1.1, shRZ: -0.1 - c * 0.45, elR: -1.0, mouth: 0.5, headX: -0.1, brow: 0.5 };
    },
  },
  bellyDance: {
    duration: 3.2,
    pose: (_p, t, _b, seated) => ({
      tilt: S(t * 9) * 0.25, twist: S(t * 4.5) * 0.3, bodyZ: S(t * 9) * 0.04, headZ: -S(t * 9) * 0.25,
      shLX: -0.4, shLZ: 2.4 + S(t * 9) * 0.2, elL: -0.9, shRX: -0.4, shRZ: -2.4 + S(t * 9) * 0.2, elR: -0.9,
      squash: S(t * 18) * 0.05, mouth: 0.6, hipLX: seated ? undefined : S(t * 9) * 0.2, hipRX: seated ? undefined : -S(t * 9) * 0.2, brow: 0.4,
    }),
  },
  slamTable: {
    duration: 1.1,
    pose: (p) => {
      const up = p < 0.35 ? ease(p / 0.35) : 0;
      const hit = p >= 0.35 && p < 0.5 ? 1 : p >= 0.5 ? 1 - ease((p - 0.5) / 0.5) : 0;
      const k = up + hit;
      return {
        shRX: -2.6 * up - 1.3 * hit, elR: -0.3 * up - 0.1 * hit, lean: 0.35 * hit - 0.1 * up,
        shLX: -2.6 * up - 1.3 * hit, elL: -0.3 * up - 0.1 * hit, brow: -1, mouth: 0.7 * k,
        squash: hit > 0.9 ? -0.12 : 0,
      };
    },
  },
  leanBack: {
    duration: 2.6,
    pose: (p) => {
      const w = pulse(p, 0, 1);
      return { lean: -0.55 * w, rootRotX: -0.18 * w, headX: -0.25 * w, shLX: -2.3 * w, shLZ: 0.9 * w, elL: -2.2 * w, shRX: -2.3 * w, shRZ: -0.9 * w, elR: -2.2 * w, mouth: 0.15 };
    },
  },
  stagger: {
    duration: 1.6,
    blendIn: 0.05,
    pose: (p, t) => {
      const d = 1 - p;
      return {
        headZ: S(t * 18) * 0.5 * d, headY: S(t * 11) * 0.4 * d, headX: 0.2 * d, tilt: S(t * 9) * 0.3 * d,
        lean: -0.2 * d, shLZ: 1.2 * d + 0.12, shRZ: -1.2 * d - 0.12, mouth: 0.6 * d, brow: 1 * d,
        squash: p < 0.1 ? -0.2 * (1 - p / 0.1) : 0, bodyZ: -S(p * Math.PI) * 0.15,
      };
    },
  },
  fall: {
    duration: 3.2,
    blendIn: 0.08,
    pose: (p, t) => {
      // devrilme → yerde çırpınma → toparlanıp kalkma
      const down = p < 0.2 ? ease(p / 0.2) : p < 0.7 ? 1 : 1 - ease((p - 0.7) / 0.3);
      const flail = p > 0.2 && p < 0.7 ? 1 : 0;
      return {
        rootRotX: -1.45 * down, bodyY: 0, squash: p > 0.18 && p < 0.25 ? -0.25 : 0,
        hipLX: -0.9 * down + S(t * 16) * 0.4 * flail, hipRX: -0.6 * down - S(t * 16) * 0.4 * flail, kneeL: 0.6 * down, kneeR: 0.9 * down,
        shLX: -2.8 * down + S(t * 14) * 0.5 * flail, shRX: -2.8 * down - S(t * 14) * 0.5 * flail, shLZ: 0.6, shRZ: -0.6,
        headX: -0.3 * down, headZ: S(t * 10) * 0.3 * flail, mouth: 0.8 * down, brow: 1,
      };
    },
  },
  swing: {
    duration: 0.75,
    blendIn: 0.05,
    pose: (p) => {
      const wind = p < 0.35 ? ease(p / 0.35) : 0;
      const strike = p >= 0.35 ? Math.max(0, 1 - (p - 0.35) / 0.65) : 0;
      return {
        shRX: -2.9 * wind + (-0.9) * strike - 0.4, shRZ: -0.3 * wind - 0.2, elR: -0.8 * wind - 0.2 * strike,
        twist: 0.6 * wind - 0.5 * strike, lean: -0.15 * wind + 0.3 * strike, brow: -0.8, mouth: 0.6 * strike,
        squash: wind * 0.06 - strike * 0.08,
      };
    },
  },
  wave: {
    duration: 1.6,
    pose: (_p, t) => ({ shRX: -0.3, shRZ: -2.6, elR: -0.4 + S(t * 12) * 0.35, headZ: 0.12, mouth: 0.4, brow: 0.5 }),
  },
  drink: {
    duration: 2.6,
    pose: (p) => {
      const up = pulse(p, 0.05, 0.95);
      return { shRX: -1.2 * up - 0.2, shRZ: 0.25 * up - 0.1, elR: -2.1 * up, headX: -0.35 * pulse(p, 0.3, 0.8), mouth: 0.2 * up, brow: 0.3 };
    },
  },
  talk: {
    duration: 2.5,
    pose: (_p, t) => ({
      mouth: Math.max(0, S(t * 17) * 0.5 + S(t * 7) * 0.3), headX: S(t * 3) * 0.06, headY: S(t * 1.7) * 0.15,
      shRX: -0.6 + S(t * 4) * 0.2, shRZ: -0.4, elR: -1.0 + S(t * 5) * 0.3, brow: S(t * 2.3) * 0.5,
    }),
  },
  surprise: {
    duration: 1.4,
    blendIn: 0.06,
    pose: (p) => {
      const w = p < 0.15 ? p / 0.15 : 1;
      return { bodyY: S(Math.min(p * 3, 1) * Math.PI) * 0.12, squash: 0.15 * (1 - p), shLZ: 1.6 * w, shRZ: -1.6 * w, elL: -0.6, elR: -0.6, mouth: 1, brow: 1, headX: -0.15, lean: -0.15 };
    },
  },
  angry: {
    duration: 2.0,
    pose: (_p, t) => ({
      shLX: -0.9, shLZ: 0.6 + S(t * 16) * 0.15, elL: -1.8, shRX: -1.0, shRZ: -0.6 - S(t * 16) * 0.15, elR: -1.8,
      headZ: S(t * 20) * 0.08, brow: -1, mouth: 0.55 + S(t * 15) * 0.2, lean: 0.12, squash: S(t * 30) * 0.02,
    }),
  },
  think: {
    duration: 2.4,
    pose: (_p, t) => ({ shRX: -1.4, shRZ: 0.35, elR: -2.3, headZ: 0.18, headX: 0.1 + S(t * 2) * 0.04, brow: -0.3, mouth: 0.05, shLX: -0.4, elL: -1.3, shLZ: 0.3 }),
  },
  cheer: {
    duration: 1.8,
    pose: (_p, t, _b, seated) => ({
      shLX: -0.2, shLZ: 2.8, elL: -0.2, shRX: -0.2, shRZ: -2.8, elR: -0.2, bodyY: seated ? 0 : Math.abs(S(t * 10)) * 0.15,
      squash: S(t * 20) * 0.08, mouth: 1, brow: 0.8, headX: -0.25,
    }),
  },
  pour: {
    duration: 2.2,
    pose: (p) => {
      const w = pulse(p, 0, 1);
      return { shRX: -1.0 * w, shRZ: 0.3 * w, elR: -0.9 * w, lean: 0.25 * w, headX: 0.35 * w, shLX: -0.8 * w, elL: -1.2 * w };
    },
  },
  point: {
    duration: 1.6,
    pose: (_p, t) => ({ shRX: -1.5, shRZ: -0.15, elR: -0.05, mouth: 0.4 + S(t * 15) * 0.3, brow: -0.5, lean: 0.1 }),
  },
  facepalm: {
    duration: 1.8,
    pose: () => ({ shRX: -1.6, shRZ: 0.55, elR: -2.5, headX: 0.35, lean: 0.15, brow: -0.4 }),
  },
  carry: {
    duration: 1, loop: true,
    pose: () => ({ shLX: -0.9, shLZ: 0.1, elL: -1.3 }),
  },
  shrug: {
    duration: 1.4,
    pose: (p) => {
      const w = pulse(p, 0, 1);
      return { shLZ: 0.9 * w, shRZ: -0.9 * w, elL: -1.4 * w, elR: -1.4 * w, shLX: -0.6 * w, shRX: -0.6 * w, headZ: 0.25 * w, brow: 0.7 * w, bodyY: 0.04 * w };
    },
  },
};

/** Eylemlere eşlik eden yüz ifadeleri (eylem ağırlığıyla karışır). */
const EXPR: Partial<Record<ActionName, Partial<Pose>>> = {
  laugh: { smile: 1 }, clap: { smile: 0.8 }, bellyDance: { smile: 0.9 }, cheer: { smile: 1, wide: 0.4 }, wave: { smile: 0.7 },
  angry: { smile: -1 }, slamTable: { smile: -0.8 }, think: { smile: -0.3 }, facepalm: { smile: -0.5, blush: 1 },
  shrug: { smile: -0.2, blush: 0.4 }, surprise: { wide: 1, smile: 0 }, talk: { smile: 0.35 }, point: { smile: 0.5 },
  drink: { smile: 0.6 }, stagger: { wide: 1, blush: 0.6, smile: -0.4 }, fall: { wide: 1, blush: 0.9, smile: -0.6 },
  swing: { smile: -0.6 }, leanBack: { smile: 0.6 }, pour: { smile: 0.4 },
};

interface ActiveAction {
  name: ActionName;
  t: number;
  def: ActionDef;
  weight: number;
  stopping: boolean;
}

class Spring {
  x = 0; v = 0;
  constructor(public k = 120, public d = 8) {}
  step(target: number, dt: number) {
    const a = -this.k * (this.x - target) - this.d * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

export class Animator {
  readonly model: CharacterModel;
  posture: Posture = 'stand';
  /** 0 ayakta, 1 oturuyor */
  sitW = 0;
  speed = 0; // m/s (yatay)
  runThreshold = 2.6;
  /** Oturma yüksekliği (kalça) */
  seatHeight = 0.48;
  private phase = 0;
  private time = Math.random() * 10;
  private actions: ActiveAction[] = [];
  private blinkT = 2 + Math.random() * 3;
  private blink = 0;
  private bellySpring = new Spring(140, 6);
  private mustSpring = new Spring(160, 7);
  private headSpring = new Spring(60, 4);
  private prevBodyY = 0;
  private prevVel = 0;
  /** Bakış hedefi (dünya), null → düz */
  lookAt: THREE.Vector3 | null = null;
  private lookYaw = 0;
  private lookPitch = 0;
  readonly pose: Pose = { ...ZERO_POSE };
  private idleVariant = 0;
  private idleVariantT = 4;

  constructor(model: CharacterModel) {
    this.model = model;
  }

  play(name: ActionName, opts: { loop?: boolean } = {}): void {
    const def = ACTIONS[name];
    // aynı eylem zaten oynuyorsa baştan başlat
    const ex = this.actions.find((a) => a.name === name && !a.stopping);
    if (ex) { ex.t = 0; return; }
    this.actions.push({ name, t: 0, def: opts.loop ? { ...def, loop: true } : def, weight: 0, stopping: false });
  }

  stop(name: ActionName) {
    for (const a of this.actions) if (a.name === name) a.stopping = true;
  }

  isPlaying(name?: ActionName): boolean {
    return this.actions.some((a) => !a.stopping && (!name || a.name === name));
  }

  /** Engelleyici (kontrolü kilitleyen) eylem oynuyor mu */
  isIncapacitated(): boolean {
    return this.actions.some((a) => (a.name === 'fall' || a.name === 'stagger') && !a.stopping && a.t < a.def.duration * 0.85);
  }

  hitImpulse(strength = 1) {
    this.headSpring.v += 25 * strength;
    this.bellySpring.v += 6 * strength;
    this.mustSpring.v += 30 * strength;
  }

  update(dt: number) {
    this.time += dt;
    const m = this.model;
    const seatedTarget = this.posture === 'stand' ? 0 : 1;
    this.sitW += (seatedTarget - this.sitW) * Math.min(1, dt * 6);
    if (Math.abs(this.sitW - seatedTarget) < 0.002) this.sitW = seatedTarget;
    const seated = this.sitW > 0.5;

    // --- taban poz ---
    const base: Pose = { ...ZERO_POSE };
    const sp = this.speed;
    const walkW = Math.min(1, sp / 1.2) * (1 - this.sitW);
    const runW = Math.min(1, Math.max(0, (sp - 2.0) / (this.runThreshold - 2.0))) * (1 - this.sitW);
    const stride = 1.6 + (this.model.spec.legLength < 0.47 ? 0.6 : 0);
    this.phase += dt * (sp * stride * 1.6 + 0.0001);
    const ph = this.phase;
    // nefes / bekleme
    const breathe = S(this.time * 1.8);
    base.squash = breathe * 0.012;
    base.headX = S(this.time * 0.7) * 0.03;
    // bekleme varyasyonları (aynı animasyonu sürekli tekrar etmemek için)
    this.idleVariantT -= dt;
    if (this.idleVariantT <= 0) { this.idleVariant = Math.floor(Math.random() * 4); this.idleVariantT = 3 + Math.random() * 5; }
    if (sp < 0.2 && !seated) {
      if (this.idleVariant === 1) { base.headY = S(this.time * 0.9) * 0.4; }
      else if (this.idleVariant === 2) { base.shLX = -0.25; base.shRX = -0.25; base.shLZ = 0.45; base.shRZ = -0.45; base.elL = -1.6; base.elR = -1.6; base.twist = S(this.time) * 0.06; } // eller arkada
      else if (this.idleVariant === 3) { base.tilt = S(this.time * 1.2) * 0.07; base.hipLX = 0.05; }
    }
    // yürüme
    const sw = S(ph);
    const sw2 = S(ph * 2);
    const amp = 0.55 + runW * 0.45;
    base.hipLX = base.hipLX * (1 - walkW) + sw * amp * walkW;
    base.hipRX = -sw * amp * walkW;
    base.kneeL = Math.max(0, -S(ph + 1.2)) * (0.9 + runW * 0.6) * walkW;
    base.kneeR = Math.max(0, S(ph + 1.2)) * (0.9 + runW * 0.6) * walkW;
    base.shLX += -sw * (0.5 + runW * 0.5) * walkW;
    base.shRX += sw * (0.5 + runW * 0.5) * walkW;
    base.elL += -0.4 * runW * walkW - 0.6 * runW;
    base.elR += -0.4 * runW * walkW - 0.6 * runW;
    base.bodyY += Math.abs(sw2) * 0.05 * walkW + Math.abs(sw2) * 0.05 * runW;
    base.squash += -Math.abs(sw2) * 0.03 * walkW - 0.04 * runW * Math.abs(S(ph * 2 + 0.6));
    base.tilt += sw * 0.07 * walkW;
    base.twist += sw * 0.12 * walkW;
    base.lean += 0.06 * walkW + 0.22 * runW;
    base.headX -= 0.05 * walkW + 0.1 * runW;
    // oturma
    if (this.sitW > 0) {
      const w = this.sitW;
      const drop = (this.model.hipHeight - this.seatHeight / this.model.spec.height);
      base.bodyY += -drop * w;
      base.bodyZ += -0.06 * w;
      base.hipLX = base.hipLX * (1 - w) - 1.5 * w;
      base.hipRX = base.hipRX * (1 - w) - 1.5 * w;
      base.kneeL = base.kneeL * (1 - w) + 1.45 * w;
      base.kneeR = base.kneeR * (1 - w) + 1.45 * w;
      base.shLX = base.shLX * (1 - w) - 0.5 * w;
      base.shRX = base.shRX * (1 - w) - 0.5 * w;
      base.elL = base.elL * (1 - w) - 0.8 * w;
      base.elR = base.elR * (1 - w) - 0.8 * w;
      if (this.posture === 'sleepSit') {
        base.lean = -0.15 * w; base.rootRotX = -0.12 * w;
        base.headX = 0.55 + S(this.time * 0.8) * 0.06; base.headZ = 0.3;
        base.mouth = 0.25 + S(this.time * 0.8) * 0.2;
        base.smile = 0;
        base.shLZ = 0.35; base.shRZ = -0.35; base.elL = -0.3; base.elR = -0.3; base.shLX = -0.2; base.shRX = -0.2;
        base.squash = S(this.time * 0.8) * 0.04;
      }
    }

    // --- eylem katmanı ---
    const out: Pose = { ...base };
    for (const a of this.actions) {
      a.t += dt;
      const dur = a.def.duration;
      const p = a.def.loop ? (a.t % dur) / dur : Math.min(1, a.t / dur);
      const bi = a.def.blendIn ?? 0.15;
      const bo = a.def.blendOut ?? 0.25;
      if (a.stopping) a.weight = Math.max(0, a.weight - dt / bo);
      else {
        a.weight = Math.min(1, a.weight + dt / bi);
        if (!a.def.loop && a.t >= dur - bo) a.weight = Math.min(a.weight, Math.max(0, (dur - a.t) / bo));
      }
      const ap = { ...EXPR[a.name], ...a.def.pose(p, a.t, base, seated) };
      for (const k of KEYS) {
        const v = ap[k];
        if (v === undefined) continue;
        out[k] = out[k] + (v - out[k]) * a.weight;
      }
    }
    this.actions = this.actions.filter((a) => !(a.stopping && a.weight <= 0) && (a.def.loop || a.t < a.def.duration));

    // göz kırpma
    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blink = 0.14; this.blinkT = 2 + Math.random() * 4; }
    this.blink = Math.max(0, this.blink - dt);

    // bakış
    let yaw = 0, pitch = 0;
    if (this.lookAt) {
      const headWorld = new THREE.Vector3();
      m.head.getWorldPosition(headWorld);
      const local = m.root.worldToLocal(this.lookAt.clone());
      const headLocal = m.root.worldToLocal(headWorld.clone());
      const d = local.sub(headLocal);
      yaw = THREE.MathUtils.clamp(Math.atan2(d.x, d.z), -1.1, 1.1);
      pitch = THREE.MathUtils.clamp(-Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.5, 0.5);
    }
    this.lookYaw += (yaw - this.lookYaw) * Math.min(1, dt * 5);
    this.lookPitch += (pitch - this.lookPitch) * Math.min(1, dt * 5);

    Object.assign(this.pose, out);
    this.apply(out, dt);
  }

  private apply(p: Pose, dt: number) {
    const m = this.model;
    // squash & stretch (hacim korunumu)
    const sq = p.squash;
    m.body.scale.set(m.spec.height * (1 - sq * 0.5), m.spec.height * (1 + sq), m.spec.height * (1 - sq * 0.5));
    m.hips.position.y = m.hipHeight + p.bodyY;
    m.hips.position.z = p.bodyZ;
    m.body.rotation.x = p.rootRotX;
    m.body.rotation.z = p.rootRotZ;
    m.spine.rotation.set(p.lean, p.twist, p.tilt);
    // kafa yayı
    const hs = this.headSpring.step(0, dt);
    m.head.rotation.set(p.headX + this.lookPitch, p.headY + this.lookYaw + hs * 0.05, p.headZ + hs * 0.08);
    m.armL.upper.rotation.set(p.shLX, 0, p.shLZ);
    m.armL.lower.rotation.set(p.elL, 0, 0);
    m.armR.upper.rotation.set(p.shRX, 0, p.shRZ);
    m.armR.lower.rotation.set(p.elR, 0, 0);
    m.legL.upper.rotation.set(p.hipLX, 0, 0);
    m.legL.lower.rotation.set(p.kneeL, 0, 0);
    m.legR.upper.rotation.set(p.hipRX, 0, 0);
    m.legR.lower.rotation.set(p.kneeR, 0, 0);
    // ayaklar yere paralel kalsın
    m.legL.end.rotation.x = -(p.hipLX + p.kneeL) * 0.6;
    m.legR.end.rotation.x = -(p.hipRX + p.kneeR) * 0.6;
    // ağız / kaş / göz
    const ms = m.spec.headSize;
    // ifade: ağız kapalıyken gülümseme/somurtma yayı, yanak kızarıklığı, iri gözler
    const showArc = p.mouth < 0.3 && Math.abs(p.smile) > 0.12;
    m.smile.visible = showArc;
    m.mouth.visible = !showArc || p.mouth > 0.15;
    if (showArc) {
      m.smile.rotation.z = p.smile > 0 ? Math.PI : 0; // ∪ gülümseme, ∩ somurtma
      const k = Math.min(1, Math.abs(p.smile));
      m.smile.scale.set(ms * 0.16 * (0.7 + 0.5 * k), ms * 0.16 * (0.4 + 0.6 * k), ms * 0.12);
      m.smile.position.y = -ms * (p.smile > 0 ? 0.36 : 0.48);
    }
    m.blushMat.opacity = Math.min(0.75, p.blush * 0.75);
    for (const pu of m.pupils) {
      const b = (pu.userData.base ??= pu.scale.clone()) as THREE.Vector3;
      pu.scale.copy(b).multiplyScalar(1 - p.wide * 0.35);
    }
    m.mouth.scale.set(ms * 0.2 * (1 - p.mouth * 0.2), ms * (0.05 + p.mouth * 0.22), ms * 0.08);
    for (let i = 0; i < 2; i++) {
      const brow = m.brows[i];
      const side = i === 0 ? 1 : -1;
      brow.rotation.z = p.brow < 0 ? side * 0.45 * -p.brow : -side * 0.15 * p.brow;
      brow.position.y = ms * 0.18 + ms * 0.3 + p.brow * ms * 0.08;
      const wideK = 1 + p.wide * 0.3;
      m.eyes[i].scale.set(wideK, this.blink > 0 ? 0.1 : (1 + Math.max(0, p.brow) * 0.15) * wideK, wideK);
    }
    // ikincil hareket: göbek ve bıyık
    const vy = (p.bodyY - this.prevBodyY) / Math.max(dt, 1e-4);
    const acc = (vy - this.prevVel) / Math.max(dt, 1e-4);
    this.prevBodyY = p.bodyY;
    this.prevVel = vy;
    this.bellySpring.v -= THREE.MathUtils.clamp(acc, -60, 60) * 0.02 * (0.3 + m.spec.belly);
    const b = this.bellySpring.step(0, dt);
    const bs = m.bellyMesh.userData.baseScale ?? (m.bellyMesh.userData.baseScale = m.bellyMesh.scale.clone());
    m.bellyMesh.scale.set(bs.x * (1 - b * 0.4), bs.y * (1 + b), bs.z * (1 - b * 0.4));
    this.mustSpring.v -= THREE.MathUtils.clamp(acc, -60, 60) * 0.05;
    const mus = this.mustSpring.step(p.mouth * 0.1, dt);
    m.mustache.rotation.x = mus * 0.5;
    m.mustache.scale.y = 1 + mus * 0.3;
    m.hat.position.y = m.hat.userData.baseY ?? (m.hat.userData.baseY = m.hat.position.y);
    m.hat.position.y += Math.max(0, -b) * 0.02 + Math.max(0, hs) * 0.01;
  }
}
