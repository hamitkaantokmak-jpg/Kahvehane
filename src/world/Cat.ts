/**
 * Kahvehaneye giren kedi (kaos olayı): kapıdan girer, bir masaya çıkar, çayı devirir, NPC'ler tepki verir, sonra gider.
 * Prosedürel model (toon + dış hat), basit yol takibi.
 */
import * as THREE from 'three';
import { toonMesh, sharedGeo } from './materials';
import type { NavGrid } from './Collision';

export type CatPhase = 'enter' | 'onTable' | 'leave' | 'gone';

export class Cat {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private tail: THREE.Group;
  private legs: THREE.Object3D[] = [];
  phase: CatPhase = 'enter';
  private path: { x: number; z: number }[] = [];
  private t = 0;
  private timer = 0;
  private hop: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;
  onArriveTable: (() => void) | null = null;
  onGone: (() => void) | null = null;

  constructor(private nav: NavGrid, private door: THREE.Vector3, private tableCenter: THREE.Vector3, private sitTime = 9) {
    const orange = 0xf08c2a, cream = 0xffe0b0;
    const torso = toonMesh(sharedGeo('catBody', () => new THREE.CapsuleGeometry(0.11, 0.28, 6, 12).rotateX(Math.PI / 2)), orange, 0.01);
    torso.position.y = 0.22;
    const head = toonMesh(sharedGeo('catHead', () => new THREE.SphereGeometry(0.11, 14, 10)), orange, 0.01);
    head.position.set(0, 0.33, 0.22);
    for (const sx of [-1, 1]) {
      const ear = toonMesh(sharedGeo('catEar', () => new THREE.ConeGeometry(0.04, 0.08, 8)), orange, 0.006);
      ear.position.set(sx * 0.06, 0.1, 0);
      ear.rotation.z = -sx * 0.25;
      head.add(ear);
      const eye = toonMesh(sharedGeo('catEye', () => new THREE.SphereGeometry(0.018, 8, 6)), 0x2b2b2b, 0);
      eye.position.set(sx * 0.04, 0.02, 0.095);
      head.add(eye);
    }
    const snout = toonMesh(sharedGeo('catSnout', () => new THREE.SphereGeometry(0.045, 10, 8)), cream, 0.005);
    snout.position.set(0, -0.03, 0.09);
    head.add(snout);
    this.body.add(torso, head);
    for (const [x, z] of [[-0.07, 0.15], [0.07, 0.15], [-0.07, -0.13], [0.07, -0.13]]) {
      const leg = toonMesh(sharedGeo('catLeg', () => new THREE.CylinderGeometry(0.025, 0.025, 0.16, 6).translate(0, -0.08, 0)), orange, 0.006);
      leg.position.set(x, 0.17, z);
      this.legs.push(leg);
      this.body.add(leg);
    }
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.25, -0.24);
    const seg = toonMesh(sharedGeo('catTail', () => new THREE.CylinderGeometry(0.02, 0.03, 0.3, 6).translate(0, 0.15, 0)), orange, 0.006);
    this.tail.add(seg);
    this.tail.rotation.x = -0.6;
    this.body.add(this.tail);
    this.root.add(this.body);
    this.root.position.copy(door);
    this.goTo(this.approach());
  }

  private approach() {
    const d = new THREE.Vector3().subVectors(this.door, this.tableCenter).setY(0).normalize().multiplyScalar(0.75);
    return this.tableCenter.clone().add(d);
  }

  private goTo(p: THREE.Vector3) {
    this.path = this.nav.findPath(this.root.position.x, this.root.position.z, p.x, p.z);
  }

  update(dt: number) {
    this.t += dt;
    this.tail.rotation.z = Math.sin(this.t * 3) * 0.4;
    if (this.hop) {
      const h = this.hop;
      h.t = Math.min(1, h.t + dt * 2);
      this.root.position.lerpVectors(h.from, h.to, h.t);
      this.root.position.y += Math.sin(h.t * Math.PI) * 0.35;
      if (h.t >= 1) {
        this.hop = null;
        if (this.phase === 'enter') { this.phase = 'onTable'; this.timer = this.sitTime; this.onArriveTable?.(); }
        else if (this.phase === 'onTable') { this.phase = 'leave'; this.goTo(this.door); }
      }
      return;
    }
    if (this.phase === 'onTable') {
      this.timer -= dt;
      this.body.rotation.y = Math.sin(this.t * 0.7) * 0.8; // etrafına bakınır
      if (this.timer <= 0) {
        const down = this.approach();
        this.hop = { from: this.root.position.clone(), to: new THREE.Vector3(down.x, 0, down.z), t: 0 };
      }
      return;
    }
    if (this.phase === 'gone') return;
    // yürüme
    const tgt = this.path[0];
    if (!tgt) {
      if (this.phase === 'enter') {
        this.hop = { from: this.root.position.clone(), to: new THREE.Vector3(this.tableCenter.x, 0.78, this.tableCenter.z), t: 0 };
      } else if (this.phase === 'leave') { this.phase = 'gone'; this.onGone?.(); }
      return;
    }
    const dx = tgt.x - this.root.position.x, dz = tgt.z - this.root.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.08) { this.path.shift(); return; }
    const step = Math.min(d, 1.6 * dt);
    this.root.position.x += (dx / d) * step;
    this.root.position.z += (dz / d) * step;
    this.root.rotation.y = Math.atan2(dx, dz);
    this.legs.forEach((l, i) => (l.rotation.x = Math.sin(this.t * 14 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6));
    this.body.position.y = Math.abs(Math.sin(this.t * 14)) * 0.015;
  }
}
