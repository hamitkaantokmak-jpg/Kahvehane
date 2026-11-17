/**
 * Kamera ile oyuncu arasına giren nesneleri (askılık, saksı, NPC) yarı saydam yapar.
 * Materyaller paylaşıldığı için saydamlaştırma, nesneye özel materyal kopyasıyla yapılır ve geri alınır.
 */
import * as THREE from 'three';

export class OcclusionFader {
  private ray = new THREE.Raycaster();
  faded = new Map<THREE.Object3D, number>(); // kök → mevcut opaklık
  private originals = new Map<THREE.Mesh, THREE.Material>();
  private clones = new Map<THREE.Mesh, THREE.Material>();
  /** test için: şu an saydamlaştırılan köklerin sayısı */
  get count() { return [...this.faded.values()].filter((v) => v < 0.99).length; }

  constructor(private roots: THREE.Object3D[]) {}

  private rootOf(o: THREE.Object3D): THREE.Object3D | null {
    let x: THREE.Object3D | null = o;
    while (x) { if (this.roots.includes(x)) return x; x = x.parent; }
    return null;
  }

  update(cam: THREE.Vector3 | null, target: THREE.Vector3) {
    const hitRoots = new Set<THREE.Object3D>();
    if (cam) {
      // birkaç ışın: kafa, gövde
      for (const dy of [0.2, -0.45]) {
        const t = target.clone().add(new THREE.Vector3(0, dy, 0));
        const dir = t.clone().sub(cam);
        const dist = dir.length();
        this.ray.set(cam, dir.normalize());
        this.ray.far = Math.max(0, dist - 0.35);
        for (const h of this.ray.intersectObjects(this.roots, true)) {
          if (h.object.userData.isOutline) continue;
          const r = this.rootOf(h.object);
          if (r && r.visible) hitRoots.add(r);
        }
      }
    }
    for (const r of hitRoots) if (!this.faded.has(r)) this.faded.set(r, 1);
    for (const [r, op] of this.faded) {
      const target = hitRoots.has(r) ? 0.28 : 1;
      const next = op + (target - op) * 0.2;
      this.apply(r, next);
      if (target === 1 && next > 0.98) { this.restore(r); this.faded.delete(r); }
      else this.faded.set(r, next);
    }
  }

  private apply(root: THREE.Object3D, opacity: number) {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.userData.isOutline) { if (opacity <= 0.9 && m.visible) { m.visible = false; m.userData.fadeHidden = true; } return; }
      if (Array.isArray(m.material)) return;
      if (!this.originals.has(m)) {
        this.originals.set(m, m.material);
        const c = m.material.clone();
        c.transparent = true;
        c.depthWrite = false;
        this.clones.set(m, c);
        m.material = c;
      }
      (m.material as THREE.Material).opacity = opacity;
    });
  }

  private restore(root: THREE.Object3D) {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.userData.isOutline) { if (m.userData.fadeHidden) { m.visible = true; m.userData.fadeHidden = false; } return; }
      const orig = this.originals.get(m);
      if (orig) {
        this.clones.get(m)?.dispose();
        m.material = orig;
        this.originals.delete(m);
        this.clones.delete(m);
      }
    });
  }
}
