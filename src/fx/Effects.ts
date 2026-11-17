/** Çizgi film efektleri: kafa etrafında dönen yıldızlar, toz bulutu (puf), kalpler, "!" işaretleri. */
import * as THREE from 'three';
import { sharedGeo } from '../world/materials';

interface Fx {
  obj: THREE.Object3D;
  t: number;
  life: number;
  update: (fx: Fx, dt: number) => void;
}

function starGeometry(): THREE.BufferGeometry {
  return sharedGeo('star', () => {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.045 : 0.1;
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    return new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false });
  });
}

export class Effects {
  private list: Fx[] = [];
  constructor(private scene: THREE.Scene) {}

  /** Bir nesnenin (kafa) etrafında dönen yıldızlar. */
  stars(follow: THREE.Object3D, duration = 2.5, yOffset = 0.45) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd60a });
    const stars: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(starGeometry(), mat);
      g.add(s);
      stars.push(s);
    }
    this.scene.add(g);
    this.list.push({
      obj: g, t: 0, life: duration,
      update: (fx) => {
        const p = new THREE.Vector3();
        follow.getWorldPosition(p);
        g.position.copy(p).add(new THREE.Vector3(0, yOffset, 0));
        stars.forEach((s, i) => {
          const a = fx.t * 6 + (i / stars.length) * Math.PI * 2;
          s.position.set(Math.cos(a) * 0.35, Math.sin(fx.t * 9 + i) * 0.05, Math.sin(a) * 0.35);
          s.rotation.y = -a;
          s.rotation.z = fx.t * 8;
          const k = Math.min(1, (fx.life - fx.t) * 2) * Math.min(1, fx.t * 6);
          s.scale.setScalar(k);
        });
      },
    });
  }

  /** Toz bulutu / ışınlanma efekti */
  puff(pos: THREE.Vector3, color = 0xffffff, count = 10, size = 0.25) {
    const g = new THREE.Group();
    g.position.copy(pos);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
    const parts: { m: THREE.Mesh; v: THREE.Vector3 }[] = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(sharedGeo('puffSph', () => new THREE.SphereGeometry(1, 10, 8)), mat);
      const a = (i / count) * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a), 0.6 + Math.random() * 0.8, Math.sin(a)).multiplyScalar(1.2 + Math.random());
      m.position.set(0, 0.3 + Math.random() * 0.6, 0);
      m.scale.setScalar(size * (0.6 + Math.random() * 0.6));
      g.add(m);
      parts.push({ m, v });
    }
    this.scene.add(g);
    this.list.push({
      obj: g, t: 0, life: 0.8,
      update: (fx, dt) => {
        for (const p of parts) {
          p.m.position.addScaledVector(p.v, dt);
          p.v.multiplyScalar(1 - dt * 3);
          p.m.scale.multiplyScalar(1 + dt * 1.2);
        }
        mat.opacity = 0.9 * (1 - fx.t / fx.life);
      },
    });
  }

  /** Yükselen sembol (♥, !, ?, Zzz) — sprite ile */
  symbol(pos: THREE.Vector3, text: string, color = '#d62828', life = 1.4, size = 0.45) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.font = 'bold 96px "Trebuchet MS", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = '#2a1a10';
    g.strokeText(text, 64, 70);
    g.fillStyle = color;
    g.fillText(text, 64, 70);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    sp.position.copy(pos);
    sp.scale.setScalar(size);
    this.scene.add(sp);
    const start = pos.clone();
    this.list.push({
      obj: sp, t: 0, life,
      update: (fx) => {
        const p = fx.t / fx.life;
        sp.position.set(start.x + Math.sin(fx.t * 5) * 0.08, start.y + p * 0.6, start.z);
        const pop = fx.t < 0.15 ? fx.t / 0.15 * 1.3 : 1 + Math.max(0, 0.3 - (fx.t - 0.15) * 2);
        sp.scale.setScalar(size * Math.min(1.3, pop));
        mat.opacity = p > 0.7 ? (1 - p) / 0.3 : 1;
      },
    });
    return sp;
  }

  /** Çarpma anı için "BONK!" yazısı */
  impactText(pos: THREE.Vector3, text = 'BONK!') {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d')!;
    // patlama şekli
    g.fillStyle = '#ffd60a';
    g.beginPath();
    for (let i = 0; i < 24; i++) {
      const r = i % 2 ? 40 : 62;
      const a = (i / 24) * Math.PI * 2;
      const x = 128 + Math.cos(a) * r * 1.8, y = 64 + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath(); g.fill();
    g.lineWidth = 5; g.strokeStyle = '#2a1a10'; g.stroke();
    g.font = 'bold 54px "Trebuchet MS", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#d62828'; g.fillText(text, 128, 68);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
    const sp = new THREE.Sprite(mat);
    sp.position.copy(pos);
    sp.renderOrder = 999;
    this.scene.add(sp);
    this.list.push({
      obj: sp, t: 0, life: 0.9,
      update: (fx) => {
        const p = fx.t / fx.life;
        const s = p < 0.15 ? (p / 0.15) * 1.2 : 1.2 - (p - 0.15) * 0.3;
        sp.scale.set(0.9 * s, 0.45 * s, 1);
        sp.material.rotation = Math.sin(fx.t * 30) * 0.08;
        mat.opacity = p > 0.75 ? (1 - p) / 0.25 : 1;
      },
    });
  }

  update(dt: number) {
    for (const fx of this.list) {
      fx.t += dt;
      fx.update(fx, dt);
    }
    const dead = this.list.filter((f) => f.t >= f.life);
    for (const d of dead) {
      this.scene.remove(d.obj);
      d.obj.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m && (m as THREE.SpriteMaterial).map) (m as THREE.SpriteMaterial).map!.dispose();
      });
    }
    this.list = this.list.filter((f) => f.t < f.life);
  }
}
