/**
 * Üçüncü şahıs kamera: oyuncuyu takip eder, fareyle döner, oda sınırları ve tavanla çarpışmaz.
 * Sabit (masa) moduna yumuşak geçiş yapabilir.
 */
import * as THREE from 'three';

export class CameraRig {
  yaw = Math.PI; // oyuncunun arkasından
  pitch = 0.3;
  distance = 4.2;
  readonly minDist = 1.8;
  readonly maxDist = 7;
  sensitivity = 0.0035;
  invertY = false;
  private target = new THREE.Vector3();
  private fixed: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;
  private blend = 0; // 0 takip, 1 sabit
  private shakeT = 0;
  private shakeAmp = 0;
  bounds = { minX: -8.7, maxX: 8.7, minZ: -6.7, maxZ: 6.7, maxY: 3.35 };
  private raycaster = new THREE.Raycaster();
  occluders: THREE.Object3D[] = [];

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  look(dx: number, dy: number, zoom: number) {
    this.yaw -= dx * this.sensitivity;
    this.pitch += dy * this.sensitivity * (this.invertY ? -1 : 1);
    this.pitch = THREE.MathUtils.clamp(this.pitch, -0.25, 1.2);
    this.distance = THREE.MathUtils.clamp(this.distance + zoom * 0.4, this.minDist, this.maxDist);
  }

  setFixed(pos: THREE.Vector3 | null, look?: THREE.Vector3) {
    this.fixed = pos && look ? { pos: pos.clone(), look: look.clone() } : null;
  }

  get isFixed() { return !!this.fixed; }

  shake(amp = 0.08, t = 0.3) {
    this.shakeAmp = amp;
    this.shakeT = t;
  }

  /** Kameranın yere izdüşen ileri vektörü */
  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw + Math.PI), 0, Math.cos(this.yaw + Math.PI)).normalize();
  }

  update(dt: number, follow: THREE.Vector3) {
    this.target.lerp(follow, Math.min(1, dt * 12));
    if (this.target.lengthSq() === 0) this.target.copy(follow);
    const off = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    // engel kontrolü: hedeften kameraya ışın
    let dist = this.distance;
    if (this.occluders.length) {
      this.raycaster.set(this.target, off);
      this.raycaster.far = this.distance;
      const hits = this.raycaster.intersectObjects(this.occluders, false);
      if (hits.length) dist = Math.max(0.8, hits[0].distance - 0.2);
    }
    const followPos = this.target.clone().addScaledVector(off, dist);
    const b = this.bounds;
    followPos.x = THREE.MathUtils.clamp(followPos.x, b.minX, b.maxX);
    followPos.z = THREE.MathUtils.clamp(followPos.z, b.minZ, b.maxZ);
    followPos.y = THREE.MathUtils.clamp(followPos.y, 0.4, b.maxY);

    this.blend += ((this.fixed ? 1 : 0) - this.blend) * Math.min(1, dt * 3.5);
    const pos = followPos.clone();
    const look = this.target.clone();
    if (this.fixed) {
      pos.lerp(this.fixed.pos, this.blend);
      look.lerp(this.fixed.look, this.blend);
    } else if (this.blend > 0.001 && this.lastFixed) {
      pos.copy(this.lastFixed.pos).lerp(followPos, 1 - this.blend);
      look.copy(this.lastFixed.look).lerp(this.target, 1 - this.blend);
    }
    if (this.fixed) this.lastFixed = this.fixed;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      pos.x += (Math.random() - 0.5) * this.shakeAmp;
      pos.y += (Math.random() - 0.5) * this.shakeAmp;
    }
    this.camera.position.copy(pos);
    this.camera.lookAt(look);
  }
  private lastFixed: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;
}
