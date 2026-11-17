/**
 * Karakter varlığı: model + animatör + konum/yön + yol takibi + konuşma balonu.
 * Oyuncu ve NPC'ler aynı sınıfı kullanır.
 */
import * as THREE from 'three';
import { CharacterModel } from './CharacterModel';
import { Animator } from './Animator';
import { CharacterSpec } from './CharacterSpec';
import type { Seat } from '../world/Kahvehane';
import type { NavGrid, CollisionWorld } from '../world/Collision';
import { StainState, newStain, updateStain, stainIntensity } from '../interactions/teaThrow';

export interface BubbleHost {
  say(c: Character, text: string, seconds?: number): void;
}

export class Character {
  readonly model: CharacterModel;
  readonly anim: Animator;
  readonly spec: CharacterSpec;
  readonly radius = 0.3;
  yaw = 0;
  /** hedef bakış yönü */
  targetYaw: number | null = null;
  velocity = new THREE.Vector3();
  seat: Seat | null = null;
  bench: { pos: THREE.Vector3; yaw: number; occupant: string | null } | null = null;
  path: { x: number; z: number }[] = [];
  private onArrive: (() => void) | null = null;
  moveSpeed = 1.3;
  bubbleHost: BubbleHost | null = null;
  /** Taşınan nesne vb. */
  holding: THREE.Object3D | null = null;
  /** Çaylı yüz durumu (saf mantık) */
  readonly stain: StainState = newStain();
  private stainTime = 0;
  /** Yerçekimi tarzı sıçrama (vurulunca) */
  private knockVel = new THREE.Vector3();

  constructor(spec: CharacterSpec) {
    this.spec = spec;
    this.model = new CharacterModel(spec);
    this.anim = new Animator(this.model);
    this.model.root.userData.character = this;
  }

  get pos(): THREE.Vector3 {
    return this.model.root.position;
  }
  get name() {
    return this.spec.name;
  }
  get id() {
    return this.spec.id;
  }

  headWorld(out = new THREE.Vector3()): THREE.Vector3 {
    this.model.head.getWorldPosition(out);
    return out;
  }

  say(text: string, seconds = 3) {
    this.bubbleHost?.say(this, text, seconds);
  }

  faceTowards(p: THREE.Vector3) {
    this.targetYaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
  }

  /** Yol bulma ile hedefe yürü. */
  walkTo(nav: NavGrid, x: number, z: number, onArrive?: () => void, speed = 1.3) {
    this.path = nav.findPath(this.pos.x, this.pos.z, x, z);
    this.onArrive = onArrive ?? null;
    this.moveSpeed = speed;
  }

  stopWalking() {
    this.path = [];
    this.onArrive = null;
  }

  get isWalking() {
    return this.path.length > 0;
  }

  sitOn(seat: Seat) {
    this.seat = seat;
    seat.occupant = this.id;
    this.pos.set(seat.pos.x, 0, seat.pos.z);
    this.yaw = seat.yaw;
    this.targetYaw = null;
    this.anim.posture = 'sit';
    this.velocity.set(0, 0, 0);
  }

  sitOnBench(b: { pos: THREE.Vector3; yaw: number; occupant: string | null }) {
    this.bench = b;
    b.occupant = this.id;
    this.pos.set(b.pos.x, 0, b.pos.z);
    this.yaw = b.yaw;
    this.anim.posture = 'sit';
  }

  standUp() {
    if (this.seat) {
      this.seat.occupant = null;
      // sandalyeden biraz geri çık
      const back = new THREE.Vector3(-Math.sin(this.seat.yaw), 0, -Math.cos(this.seat.yaw)).multiplyScalar(0.45);
      this.pos.add(back);
      this.seat = null;
    }
    if (this.bench) {
      this.bench.occupant = null;
      this.pos.z -= 0.45;
      this.bench = null;
    }
    this.anim.posture = 'stand';
  }

  get seated() {
    return !!this.seat || !!this.bench;
  }

  knockback(dir: THREE.Vector3, strength: number) {
    this.knockVel.copy(dir).setY(0).normalize().multiplyScalar(strength);
  }

  private animDt = 0;

  /** animate=false: animasyon güncellemesi ertelenir (ekran dışı karakterler, düşük kalite) */
  update(dt: number, world?: CollisionWorld, others: Character[] = [], animate = true) {
    // yol takibi
    let speed = 0;
    if (this.path.length && !this.seated && !this.anim.isIncapacitated()) {
      const tgt = this.path[0];
      const dx = tgt.x - this.pos.x, dz = tgt.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.12) {
        this.path.shift();
        if (!this.path.length) {
          const cb = this.onArrive;
          this.onArrive = null;
          cb?.();
        }
      } else {
        const step = Math.min(d, this.moveSpeed * dt);
        this.pos.x += (dx / d) * step;
        this.pos.z += (dz / d) * step;
        this.targetYaw = Math.atan2(dx, dz);
        speed = this.moveSpeed;
      }
    }
    // dışarıdan verilen hız (oyuncu kontrolü)
    if (this.velocity.lengthSq() > 1e-6) {
      this.pos.addScaledVector(this.velocity, dt);
      speed = this.velocity.length();
    }
    if (this.knockVel.lengthSq() > 1e-4) {
      this.pos.addScaledVector(this.knockVel, dt);
      this.knockVel.multiplyScalar(Math.max(0, 1 - dt * 5));
    }
    if (world && !this.seated) {
      const dyn = others.filter((o) => o !== this && !o.seated).map((o) => ({ x: o.pos.x, z: o.pos.z, r: o.radius * 0.8 }));
      world.resolve(this.pos, this.radius, dyn);
    }
    // dönüş
    if (this.targetYaw !== null) {
      let diff = this.targetYaw - this.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.yaw += diff * Math.min(1, dt * 10);
    }
    this.model.root.rotation.y = this.yaw;
    this.anim.speed += (speed - this.anim.speed) * Math.min(1, dt * 10);
    updateStain(this.stain, dt);
    this.stainTime += dt;
    this.model.setStain(stainIntensity(this.stain), this.stainTime);
    this.animDt += dt;
    if (animate) { this.anim.update(Math.min(this.animDt, 0.2)); this.animDt = 0; }
  }
}
