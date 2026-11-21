/**
 * Prosedürel karikatür karakter modeli. Hiyerarşik eklem (joint) grupları + paylaşılan geometriler.
 * Yön: karakter +Z'ye bakar. Karakterin sağı -X tarafıdır.
 */
import * as THREE from 'three';
import { CharacterSpec } from './CharacterSpec';
import { toonMesh, sharedGeo, toonMat } from '../world/materials';
import { mergeJointChildren } from '../world/merge';

const SPH = (seg = 20) => sharedGeo(`sph${seg}`, () => new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75)));
const CYL = () => sharedGeo('cyl', () => new THREE.CylinderGeometry(1, 1, 1, 12).translate(0, -0.5, 0)); // tepe 0, alt -1
const CAP = () => sharedGeo('capsule', () => new THREE.CapsuleGeometry(1, 1, 6, 12).translate(0, -0.5, 0));
const BOX = () => sharedGeo('box', () => new THREE.BoxGeometry(1, 1, 1));
const TORUS = () => sharedGeo('torusHalf', () => new THREE.TorusGeometry(1, 0.28, 8, 16, Math.PI));
const CONE = () => sharedGeo('cone', () => new THREE.ConeGeometry(1, 1, 14));

function part(geo: THREE.BufferGeometry, color: number, scale: [number, number, number], pos: [number, number, number] = [0, 0, 0], outline = 0.016): THREE.Mesh {
  const m = toonMesh(geo, color, outline);
  m.scale.set(...scale);
  m.position.set(...pos);
  return m;
}

export interface Limb {
  upper: THREE.Group;
  lower: THREE.Group;
  end: THREE.Group;
}

export class CharacterModel {
  readonly root = new THREE.Group(); // ayak hizası
  readonly body = new THREE.Group(); // ölçek & squash
  readonly hips = new THREE.Group();
  readonly spine = new THREE.Group();
  readonly neck = new THREE.Group();
  readonly head = new THREE.Group();
  readonly bellyMesh: THREE.Mesh;
  readonly mouth: THREE.Mesh;
  /** Gülümseme / somurtma yayı */
  readonly smile: THREE.Mesh;
  /** Utanma kızarıklığı (yanaklar) */
  readonly blush: THREE.Mesh[] = [];
  readonly blushMat: THREE.MeshBasicMaterial;
  readonly pupils: THREE.Mesh[] = [];
  /** Çaylı yüz katmanı (leke + damlalar) */
  readonly stain = new THREE.Group();
  private stainMat: THREE.MeshToonMaterial;
  private drips: THREE.Mesh[] = [];
  private stainK = -1;
  readonly eyes: THREE.Group[] = [];
  readonly brows: THREE.Mesh[] = [];
  readonly mustache = new THREE.Group();
  readonly hat: THREE.Group = new THREE.Group();
  readonly armL: Limb;
  readonly armR: Limb;
  readonly legL: Limb;
  readonly legR: Limb;
  /** Sağ elde tutulan eşyalar için bağlantı noktası. */
  readonly handPropR = new THREE.Group();
  readonly handPropL = new THREE.Group();
  readonly hipHeight: number;
  readonly headTopY: number;
  readonly spec: CharacterSpec;

  constructor(spec: CharacterSpec) {
    this.spec = spec;
    const s = spec;
    const legLen = s.legLength;
    this.hipHeight = legLen;
    const torsoH = 0.5;
    const bellyR = 0.24 + s.belly * 0.14;
    const chestW = 0.2 + s.belly * 0.04;
    const jacket = s.jacket ?? s.shirt;

    this.root.add(this.body);
    this.body.scale.setScalar(s.height);
    this.body.add(this.hips);
    this.hips.position.y = legLen;

    // --- gövde ---
    this.hips.add(this.spine);
    const pelvis = part(SPH(), s.pants, [0.2 + s.belly * 0.05, 0.13, 0.17], [0, 0.02, 0]);
    this.hips.add(pelvis);
    this.bellyMesh = part(SPH(), s.shirt, [bellyR * 1.0, torsoH * 0.55, bellyR * (0.95 + s.belly * 0.25)], [0, 0.2, 0.02 + s.belly * 0.05]);
    this.spine.add(this.bellyMesh);
    const chest = part(SPH(), jacket, [chestW + 0.04, 0.2, 0.17], [0, torsoH * 0.78, -0.02]);
    this.spine.add(chest);
    if (s.jacket || s.accessories.includes('vest')) {
      // ceket/yelek: göbeğin önünü açık bırakan iki yan parça
      const sideL = part(SPH(), jacket, [0.12, torsoH * 0.5, bellyR * 0.9], [bellyR * 0.62, 0.24, 0]);
      const sideR = part(SPH(), jacket, [0.12, torsoH * 0.5, bellyR * 0.9], [-bellyR * 0.62, 0.24, 0]);
      this.spine.add(sideL, sideR);
    }
    if (s.accessories.includes('apron')) {
      const apron = part(BOX(), 0xf7f2e8, [0.34, 0.5, 0.03], [0, 0.08, bellyR * (0.95 + s.belly * 0.25) + 0.03], 0.012);
      this.spine.add(apron);
    }
    if (s.accessories.includes('beads')) {
      // tespih elde
      const beads = new THREE.Group();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        beads.add(part(SPH(8), 0x9c2a2a, [0.022, 0.022, 0.022], [Math.cos(a) * 0.05, -0.04 + Math.sin(a) * 0.07, 0], 0));
      }
      this.handPropL.add(beads);
    }

    // göbek yüzeyi: (x, y) noktasında önden z (aksesuarları göbeğin üstüne oturtmak için)
    const bRx = bellyR, bRy = torsoH * 0.55, bRz = bellyR * (0.95 + s.belly * 0.25), bCy = 0.2, bCz = 0.02 + s.belly * 0.05;
    const bellyZ = (x: number, y: number) => {
      const k = 1 - (x / bRx) ** 2 - ((y - bCy) / bRy) ** 2;
      const onBelly = k > 0 ? bCz + bRz * Math.sqrt(k) : 0;
      return Math.max(onBelly, 0.15); // göğüs önü
    };
    if (s.accessories.includes('tie')) {
      // kravat: yakada düğüm, göbeğin üstünden sarkan uç (yüzeyi izleyen 4 parça)
      const red = 0x8e1b2a;
      this.spine.add(part(SPH(10), red, [0.04, 0.035, 0.03], [0, torsoH * 0.86, bellyZ(0, torsoH * 0.86) + 0.01], 0.006));
      const ys = [0.8, 0.68, 0.56, 0.44, 0.33].map((f) => torsoH * f);
      for (let i = 0; i < ys.length - 1; i++) {
        const y0 = ys[i], y1 = ys[i + 1];
        const z0 = bellyZ(0, y0) + 0.012, z1 = bellyZ(0, y1) + 0.012;
        const seg = part(BOX(), red, [0.05 + i * 0.012, Math.hypot(y0 - y1, z1 - z0) + 0.01, 0.015], [0, (y0 + y1) / 2, (z0 + z1) / 2], 0.006);
        seg.rotation.x = -Math.atan2(z1 - z0, y0 - y1);
        this.spine.add(seg);
      }
    }
    if (s.accessories.includes('pocket')) {
      // gömlek cebi + içinde not defteri (sol göğüs)
      const shade = new THREE.Color(s.shirt).multiplyScalar(0.62).getHex();
      const py = torsoH * 0.68, px = 0.11;
      const pz = bellyZ(px, py);
      this.spine.add(part(BOX(), shade, [0.11, 0.1, 0.025], [px, py, pz], 0.007).rotateY(0.3));
      this.spine.add(part(BOX(), 0xfaf3dc, [0.07, 0.075, 0.018], [px - 0.01, py + 0.055, pz - 0.006], 0.005).rotateY(0.3));
      this.spine.add(part(CYL(), 0x1d5fc4, [0.01, 0.09, 0.01], [px + 0.03, py + 0.1, pz - 0.004], 0.003));
    }
    if (s.accessories.includes('tracksuit')) {
      // eşofman fermuarı (göğüsten göbeğe)
      for (const f of [0.85, 0.7, 0.55, 0.4]) this.spine.add(part(BOX(), 0xffffff, [0.012, torsoH * 0.16, 0.01], [0, torsoH * f, bellyZ(0, torsoH * f) + 0.004], 0));
    }
    if (s.accessories.includes('towel')) {
      // omuzda havlu (sol omuz)
      const towel = part(BOX(), 0xfdfdfd, [0.12, 0.05, 0.3], [chestW + 0.04, torsoH * 0.9, 0], 0.008);
      towel.rotation.z = -0.35;
      this.spine.add(towel);
      for (const z of [0.15, -0.15]) this.spine.add(part(BOX(), 0x4f8bd6, [0.13, 0.055, 0.02], [chestW + 0.04, torsoH * 0.9, z], 0).rotateZ(-0.35));
    }

    // --- boyun & kafa ---
    this.neck.position.y = torsoH * 0.95;
    this.spine.add(this.neck);
    this.neck.add(part(CYL(), s.skin, [0.07, 0.1, 0.07], [0, 0.08, 0]));
    if (s.accessories.includes('scarf')) this.neck.add(part(sharedGeo('scarf', () => new THREE.TorusGeometry(1, 0.45, 8, 16)), 0xc0392b, [0.11, 0.11, 0.11], [0, 0.0, 0], 0.012).rotateX(Math.PI / 2));
    if (s.accessories.includes('bowtie')) {
      const bt = new THREE.Group();
      bt.add(part(CONE(), 0x111111, [0.04, 0.06, 0.03], [0.035, 0, 0], 0.008).rotateZ(Math.PI / 2));
      bt.add(part(CONE(), 0x111111, [0.04, 0.06, 0.03], [-0.035, 0, 0], 0.008).rotateZ(-Math.PI / 2));
      bt.position.set(0, -0.01, 0.1);
      this.neck.add(bt);
    }
    const hr = s.headSize;
    this.head.position.y = 0.1 + hr * 0.85;
    this.neck.add(this.head);
    const headScale: Record<string, [number, number, number]> = {
      round: [1, 1, 1], egg: [0.88, 1.12, 0.95], wide: [1.15, 0.92, 1.0], long: [0.85, 1.2, 0.92],
    };
    const hs = headScale[s.headShape];
    const skull = part(SPH(24), s.skin, [hr * hs[0], hr * hs[1], hr * hs[2]], [0, 0, 0], 0.02);
    this.head.add(skull);
    // kulaklar
    for (const sx of [1, -1]) this.head.add(part(SPH(10), s.skin, [hr * 0.18, hr * 0.28, hr * 0.12], [sx * hr * hs[0] * 0.98, 0, 0], 0.012));
    // gözler
    const eyeY = hr * 0.18;
    const eyeX = hr * 0.34;
    const faceZ = hr * hs[2];
    for (const sx of [1, -1]) {
      const eye = new THREE.Group();
      eye.position.set(sx * eyeX, eyeY, faceZ * 0.86);
      eye.add(part(SPH(14), 0xffffff, [hr * 0.2, hr * 0.24, hr * 0.12], [0, 0, 0], 0.01));
      const pupil = part(SPH(10), 0x1b1b1b, [hr * 0.08, hr * 0.1, hr * 0.06], [-sx * hr * 0.02, -hr * 0.02, hr * 0.09], 0);
      pupil.userData.keep = true;
      this.pupils.push(pupil);
      eye.add(pupil);
      if (s.accessories.includes('glasses')) {
        const rim = part(sharedGeo('rim', () => new THREE.TorusGeometry(1, 0.12, 6, 18)), 0x222222, [hr * 0.24, hr * 0.24, hr * 0.24], [0, 0, hr * 0.12], 0);
        eye.add(rim);
      }
      this.head.add(eye);
      this.eyes.push(eye);
      const brow = part(BOX(), s.hairColor === 0xe8e8e8 ? 0xdcdcdc : s.hairColor, [hr * 0.36, hr * 0.07 * s.eyebrows, hr * 0.08], [sx * eyeX, eyeY + hr * 0.3, faceZ * 0.9], 0.008);
      this.head.add(brow);
      this.brows.push(brow);
    }
    // burun
    const ns = s.noseSize * hr;
    let nose: THREE.Mesh;
    if (s.noseShape === 'long') nose = part(CAP(), s.skin, [ns * 0.16, ns * 0.45, ns * 0.16], [0, -hr * 0.02, faceZ * 0.95], 0.014).rotateX(-Math.PI / 2.4);
    else if (s.noseShape === 'hook') nose = part(SPH(14), s.skin, [ns * 0.2, ns * 0.3, ns * 0.32], [0, -hr * 0.05, faceZ * 1.02], 0.014);
    else if (s.noseShape === 'button') nose = part(SPH(14), 0xf0a07a, [ns * 0.17, ns * 0.15, ns * 0.15], [0, -hr * 0.04, faceZ * 1.0], 0.014);
    else nose = part(SPH(14), s.skin === 0xeba487 ? 0xe58b72 : s.skin, [ns * 0.25, ns * 0.23, ns * 0.25], [0, -hr * 0.06, faceZ * 1.0], 0.014);
    this.head.add(nose);
    // ağız
    this.mouth = part(SPH(12), 0x5a1414, [hr * 0.2, hr * 0.05, hr * 0.08], [0, -hr * 0.42, faceZ * 0.86], 0.006);
    this.head.add(this.mouth);
    this.smile = new THREE.Mesh(sharedGeo('smileArc', () => new THREE.TorusGeometry(1, 0.22, 6, 14, Math.PI)), toonMat(0x5a1414));
    this.smile.scale.setScalar(hr * 0.16);
    this.smile.position.set(0, -hr * 0.4, faceZ * 0.9);
    this.head.add(this.smile);
    this.blushMat = new THREE.MeshBasicMaterial({ color: 0xff5a6e, transparent: true, opacity: 0, depthWrite: false });
    for (const sx of [1, -1]) {
      const b = new THREE.Mesh(sharedGeo('blushDisc', () => new THREE.SphereGeometry(1, 10, 6)), this.blushMat);
      b.scale.set(hr * 0.17, hr * 0.1, hr * 0.05);
      b.position.set(sx * hr * 0.55 * hs[0], -hr * 0.12, faceZ * 0.82);
      b.renderOrder = 2;
      this.head.add(b);
      this.blush.push(b);
    }
    // bıyık
    this.mustache.position.set(0, -hr * 0.28, faceZ * 0.93);
    this.head.add(this.mustache);
    const mc = s.hairColor;
    if (s.mustache === 'walrus') {
      for (const sx of [1, -1]) this.mustache.add(part(SPH(12), mc, [hr * 0.3, hr * 0.14, hr * 0.12], [sx * hr * 0.2, -hr * 0.05, 0], 0.01).rotateZ(sx * 0.35));
    } else if (s.mustache === 'handlebar') {
      for (const sx of [1, -1]) {
        this.mustache.add(part(SPH(10), mc, [hr * 0.22, hr * 0.07, hr * 0.07], [sx * hr * 0.17, 0, 0], 0.008).rotateZ(sx * 0.15));
        this.mustache.add(part(TORUS(), mc, [hr * 0.1, hr * 0.1, hr * 0.12], [sx * hr * 0.42, hr * 0.06, 0], 0.006).rotateZ(sx > 0 ? -0.6 : Math.PI + 0.6));
      }
    } else if (s.mustache === 'pencil') {
      this.mustache.add(part(BOX(), mc, [hr * 0.5, hr * 0.035, hr * 0.04], [0, 0, 0], 0.005));
    } else if (s.mustache === 'chevron') {
      for (const sx of [1, -1]) this.mustache.add(part(SPH(10), mc, [hr * 0.24, hr * 0.1, hr * 0.09], [sx * hr * 0.16, -hr * 0.02, 0], 0.008).rotateZ(sx * 0.25));
    }
    // saç
    const hc = s.hairColor;
    if (s.hair === 'curly') {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        this.head.add(part(SPH(10), hc, [hr * 0.3, hr * 0.26, hr * 0.3], [Math.cos(a) * hr * 0.55 * hs[0], hr * 0.72 * hs[1], Math.sin(a) * hr * 0.5 - hr * 0.1], 0.01));
      }
    } else if (s.hair === 'slick') {
      this.head.add(part(SPH(20), hc, [hr * hs[0] * 1.03, hr * hs[1] * 0.62, hr * hs[2] * 1.03], [0, hr * 0.42, -hr * 0.05], 0.012));
    } else if (s.hair === 'side') {
      for (const sx of [1, -1]) this.head.add(part(SPH(12), hc, [hr * 0.25, hr * 0.42, hr * 0.6], [sx * hr * hs[0] * 0.8, hr * 0.25, -hr * 0.15], 0.01));
      this.head.add(part(SPH(12), hc, [hr * 0.8, hr * 0.3, hr * 0.7], [0, hr * 0.78 * hs[1], -hr * 0.1], 0.01));
    } else if (s.hair === 'tuft') {
      for (let i = 0; i < 3; i++) this.head.add(part(CONE(), hc, [hr * 0.12, hr * 0.45, hr * 0.12], [(i - 1) * hr * 0.15, hr * 1.15 * hs[1], 0], 0.01).rotateZ((i - 1) * 0.4));
      for (const sx of [1, -1]) this.head.add(part(SPH(10), hc, [hr * 0.2, hr * 0.3, hr * 0.45], [sx * hr * hs[0] * 0.85, hr * 0.1, -hr * 0.2], 0.01));
    } else if (s.hair === 'combover') {
      for (const sx of [1, -1]) this.head.add(part(SPH(10), hc, [hr * 0.22, hr * 0.32, hr * 0.55], [sx * hr * hs[0] * 0.85, hr * 0.05, -hr * 0.2], 0.01));
      this.head.add(part(BOX(), hc, [hr * 1.3, hr * 0.04, hr * 0.06], [hr * 0.1, hr * 0.92 * hs[1], 0.0], 0.006).rotateZ(-0.12));
      this.head.add(part(BOX(), hc, [hr * 1.2, hr * 0.04, hr * 0.06], [hr * 0.1, hr * 0.9 * hs[1], hr * 0.2], 0.006).rotateZ(-0.12));
    } else if (s.hair === 'bald') {
      for (const sx of [1, -1]) this.head.add(part(SPH(10), hc, [hr * 0.18, hr * 0.25, hr * 0.4], [sx * hr * hs[0] * 0.9, 0, -hr * 0.25], 0.01));
    }
    // şapkalar
    this.hat.position.y = hr * hs[1] * 0.75;
    this.head.add(this.hat);
    if (s.accessories.includes('flatcap')) {
      this.hat.add(part(SPH(16), 0x6d5a45, [hr * 1.05, hr * 0.35, hr * 1.08], [0, 0.0, 0.0], 0.012));
      this.hat.add(part(CYL(), 0x5d4a35, [hr * 0.55, hr * 0.04, hr * 0.4], [0, -hr * 0.05, hr * 0.65], 0.01));
    } else if (s.accessories.includes('fez')) {
      this.hat.add(part(sharedGeo('fez', () => new THREE.CylinderGeometry(0.75, 1, 1, 16)), 0xb3121b, [hr * 0.55, hr * 0.6, hr * 0.55], [0, hr * 0.28, 0], 0.012));
      this.hat.add(part(CYL(), 0x111111, [hr * 0.03, hr * 0.45, hr * 0.03], [hr * 0.05, hr * 0.6, -hr * 0.1], 0).rotateZ(-0.6));
    } else if (s.accessories.includes('cap')) {
      this.hat.add(part(SPH(16), 0xe74c3c, [hr * 0.98, hr * 0.5, hr * 0.98], [0, 0.0, 0], 0.012));
      this.hat.add(part(CYL(), 0xc0392b, [hr * 0.5, hr * 0.03, hr * 0.5], [0, -hr * 0.02, hr * 0.75], 0.01));
    }

    if (s.accessories.includes('pencil')) {
      // kulağın arkasında kalem
      const pen = new THREE.Group();
      pen.position.set(-hr * hs[0] * 1.08, hr * 0.32, -hr * 0.05);
      pen.rotation.set(Math.PI / 2 - 0.35, 0, 0.15); // kulağın üstünde, önden arkaya yatık
      pen.add(part(CYL(), 0xf2c230, [0.017, 0.22, 0.017], [0, 0.11, 0], 0.005));
      pen.add(part(CONE(), 0xe8c79a, [0.017, 0.04, 0.017], [0, -0.13, 0], 0.004).rotateX(Math.PI));
      pen.add(part(CYL(), 0xe86a8a, [0.018, 0.03, 0.018], [0, 0.14, 0], 0.004));
      this.head.add(pen);
    }

    // --- kollar ---
    const shoulderY = torsoH * 0.82;
    const armLen = 0.24 * s.armLength;
    const mkArm = (sx: number): Limb => {
      const upper = new THREE.Group();
      upper.position.set(sx * (chestW + 0.07), shoulderY, 0);
      this.spine.add(upper);
      upper.add(part(SPH(12), jacket, [0.085, 0.085, 0.085], [0, 0, 0]));
      upper.add(part(CAP(), jacket, [0.06, armLen, 0.06], [0, -0.02, 0]));
      if (s.accessories.includes('tracksuit')) upper.add(part(BOX(), 0xffffff, [0.012, armLen * 1.1, 0.025], [sx * 0.058, -0.02 - armLen * 0.5, 0], 0));
      const lower = new THREE.Group();
      lower.position.y = -armLen - 0.04;
      upper.add(lower);
      const sleeve = s.jacket || s.accessories.includes('tracksuit');
      lower.add(part(CAP(), sleeve ? jacket : s.skin, [0.052, armLen * 0.9, 0.052], [0, 0, 0]));
      if (s.accessories.includes('tracksuit')) lower.add(part(BOX(), 0xffffff, [0.012, armLen, 0.022], [sx * 0.05, -armLen * 0.45, 0], 0));
      const end = new THREE.Group();
      end.position.y = -armLen * 0.9 - 0.06;
      lower.add(end);
      const hs2 = 0.075 * s.handSize;
      end.add(part(SPH(14), s.skin, [hs2, hs2 * 1.1, hs2 * 0.85], [0, -hs2 * 0.6, 0]));
      end.add(part(SPH(8), s.skin, [hs2 * 0.35, hs2 * 0.6, hs2 * 0.35], [sx * -hs2 * 0.6, -hs2 * 0.3, hs2 * 0.6], 0.008));
      return { upper, lower, end };
    };
    this.armL = mkArm(1);
    this.armR = mkArm(-1);
    this.armR.end.add(this.handPropR);
    this.handPropR.position.set(0, -0.08, 0.02);
    this.armL.end.add(this.handPropL);
    this.handPropL.position.set(0, -0.08, 0.02);

    // --- bacaklar ---
    const thigh = legLen * 0.5;
    const shin = legLen * 0.46;
    const mkLeg = (sx: number): Limb => {
      const upper = new THREE.Group();
      upper.position.set(sx * 0.11, 0, 0);
      this.hips.add(upper);
      upper.add(part(CAP(), s.pants, [0.075, thigh, 0.075], [0, 0, 0]));
      if (s.accessories.includes('tracksuit')) upper.add(part(BOX(), 0xffffff, [0.012, thigh * 1.3, 0.03], [sx * 0.074, -thigh * 0.55, 0], 0));
      const lower = new THREE.Group();
      lower.position.y = -thigh;
      upper.add(lower);
      lower.add(part(CAP(), s.pants, [0.065, shin, 0.065], [0, 0, 0]));
      if (s.accessories.includes('tracksuit')) lower.add(part(BOX(), 0xffffff, [0.012, shin * 1.2, 0.026], [sx * 0.064, -shin * 0.5, 0], 0));
      const end = new THREE.Group();
      end.position.y = -shin - 0.03;
      lower.add(end);
      end.add(part(SPH(12), 0x2b1d14, [0.085, 0.06, 0.15], [0, -0.0, 0.05], 0.012));
      return { upper, lower, end };
    };
    this.legL = mkLeg(1);
    this.legR = mkLeg(-1);

    // çaylı yüz: alın/yanak/saç lekeleri + süzülen damlalar (karaktere özel yarı saydam toon materyal)
    this.stainMat = new THREE.MeshToonMaterial({ color: 0x5c2a08, transparent: true, opacity: 0, depthWrite: false });
    const blob = sharedGeo('stainBlob', () => new THREE.SphereGeometry(1, 10, 8));
    const blobs: [number, number, number, number, number][] = [
      [0.15, 0.45, 0.82, 0.32, 0.16], [-0.3, 0.25, 0.86, 0.22, 0.14], [0.42, -0.05, 0.8, 0.2, 0.16],
      [-0.1, 0.78, 0.45, 0.42, 0.18], [0.05, -0.2, 0.95, 0.14, 0.1],
    ];
    for (const [x, y, z, sx, sy] of blobs) {
      const m = new THREE.Mesh(blob, this.stainMat);
      m.position.set(x * hr * hs[0], y * hr * hs[1], z * faceZ);
      m.scale.set(sx * hr, sy * hr, 0.06 * hr);
      m.lookAt(m.position.clone().multiplyScalar(2));
      m.userData.keep = true;
      m.renderOrder = 3;
      this.stain.add(m);
    }
    for (let i = 0; i < 4; i++) {
      const d = new THREE.Mesh(blob, this.stainMat);
      d.scale.set(hr * 0.045, hr * 0.07, hr * 0.045);
      d.userData = { keep: true, x: (i - 1.5) * hr * 0.35, phase: i * 0.27 };
      d.renderOrder = 3;
      this.stain.add(d);
      this.drips.push(d);
    }
    this.stain.visible = false;
    this.head.add(this.stain);
    this.faceZ = faceZ;
    this.mouth.userData.keep = true;
    this.smile.userData.keep = true;
    for (const b of this.blush) b.userData.keep = true;
    this.bellyMesh.userData.keep = true;
    for (const b of this.brows) b.userData.keep = true;
    mergeJointChildren(this.root);
    // küçük parçalar gölge atmasın (gölge geçişindeki çizim çağrılarını azaltır)
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.isOutline) return;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      const sc = new THREE.Vector3(); m.getWorldScale(sc);
      if ((m.geometry.boundingSphere?.radius ?? 1) * Math.max(sc.x, sc.y, sc.z) < 0.09) m.castShadow = false;
    });
    this.blush.forEach((b) => (b.castShadow = false));
    this.smile.castShadow = false;
    this.headTopY = (legLen + torsoH * 0.95 + 0.1 + hr * 0.85 + hr * hs[1] + 0.08) * s.height;
  }

  private faceZ = 0;

  /** Çaylı yüz yoğunluğu (0 = temiz). `t` damla animasyonu için süre. */
  setStain(k: number, t: number) {
    if (k <= 0) { if (this.stainK !== 0) { this.stain.visible = false; this.stainK = 0; } return; }
    this.stain.visible = true;
    this.stainK = k;
    this.stainMat.opacity = 0.92 * k;
    const hr = this.spec.headSize;
    for (const d of this.drips) {
      const p = (t * 0.45 + d.userData.phase) % 1;
      d.position.set(d.userData.x, hr * (0.15 - p * 1.25), this.faceZ * (0.9 - p * 0.15));
      d.visible = p < 0.92;
    }
  }

  setHeldProp(obj: THREE.Object3D | null) {
    this.handPropR.clear();
    if (obj) this.handPropR.add(obj);
  }
}

/** El ile tutulan nesneler. */
export function makeIstaka(): THREE.Group {
  const g = new THREE.Group();
  const plank = toonMesh(sharedGeo('istakaBox', () => new THREE.BoxGeometry(0.09, 0.95, 0.05)), 0xb7773d, 0.012);
  plank.position.y = -0.4;
  g.add(plank);
  const lip = toonMesh(sharedGeo('istakaLip', () => new THREE.BoxGeometry(0.05, 0.95, 0.03)), 0x8a5426, 0.01);
  lip.position.set(0.05, -0.4, 0.02);
  g.add(lip);
  for (let i = 0; i < 5; i++) {
    const t = toonMesh(sharedGeo('miniTile', () => new THREE.BoxGeometry(0.06, 0.08, 0.02)), 0xfff6e0, 0.006);
    t.position.set(0.07, -0.1 - i * 0.14, 0.04);
    g.add(t);
  }
  g.rotation.x = Math.PI / 2;
  return g;
}

export function makeTeaGlass(withSaucer = true): THREE.Group {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(
    sharedGeo('teaGlass', () => {
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i <= 10; i++) {
        const y = i / 10;
        const r = 0.028 + 0.012 * Math.cos(y * Math.PI * 2 - 0.5) * (1 - y * 0.2) + y * 0.006;
        pts.push(new THREE.Vector2(r, y * 0.1));
      }
      return new THREE.LatheGeometry(pts, 14);
    }),
    toonMat(0xd8eef7, { transparent: true, opacity: 0.55 }),
  );
  g.add(glass);
  const tea = new THREE.Mesh(sharedGeo('teaFill', () => new THREE.CylinderGeometry(0.028, 0.03, 0.075, 12)), toonMat(0xb33a0e));
  tea.position.y = 0.04;
  g.add(tea);
  if (withSaucer) {
    const saucer = toonMesh(sharedGeo('saucer', () => new THREE.CylinderGeometry(0.06, 0.05, 0.012, 16)), 0xc0392b, 0.006);
    saucer.position.y = -0.006;
    g.add(saucer);
  }
  return g;
}

export function makeTray(): THREE.Group {
  const g = new THREE.Group();
  const tray = toonMesh(sharedGeo('tray', () => new THREE.CylinderGeometry(0.2, 0.2, 0.02, 20)), 0xd4af37, 0.01);
  g.add(tray);
  const handle = toonMesh(sharedGeo('trayHandle', () => new THREE.TorusGeometry(0.17, 0.012, 6, 20, Math.PI)), 0xd4af37, 0.006);
  handle.position.y = 0.0;
  handle.rotation.y = Math.PI / 2;
  g.add(handle);
  for (let i = 0; i < 3; i++) {
    const glass = makeTeaGlass(true);
    glass.position.set(Math.cos(i * 2.1) * 0.1, 0.02, Math.sin(i * 2.1) * 0.1);
    g.add(glass);
  }
  return g;
}
