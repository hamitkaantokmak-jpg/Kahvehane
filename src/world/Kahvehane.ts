/**
 * Kahvehane mekânı: oda, mobilya, dekor, ışıklar, çarpışma kutuları ve etkileşim noktaları.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toonMesh, toonMat, sharedGeo, PALETTE, outlineMat } from './materials';
import { floorTexture, wallpaperTexture, signTexture, calendarTexture, posterTexture, TvScreen } from './textures';
import { CollisionWorld } from './Collision';
import { mergeStatic } from './merge';
import { makeTeaGlass } from '../characters/CharacterModel';
import { GameId } from '../games/common/types';

export type TableKind = 'okey' | 'tavla' | 'kart';

export interface Seat {
  index: number;
  /** Sandalye merkezi */
  pos: THREE.Vector3;
  /** Oturan kişinin bakış açısı (rad) */
  yaw: number;
  chair: THREE.Object3D;
  occupant: string | null;
  table: TableDef;
}

export interface TableDef {
  id: string;
  kind: TableKind;
  name: string;
  center: THREE.Vector3;
  seats: Seat[];
  games: GameId[];
  group: THREE.Group;
  /** masa üstü dekor (oyun sırasında gizlenir/gösterilir) */
  props: THREE.Group;
  /** oyun sırasında masaya konan 3D taşlar/kartlar */
  live: THREE.Group;
}

export interface Interactable {
  id: string;
  kind: 'seat' | 'tv' | 'semaver' | 'door' | 'npc' | 'sign' | 'radio' | 'dart';
  pos: THREE.Vector3;
  radius: number;
  label: string;
  ref?: unknown;
}

const TABLE_GAMES: Record<TableKind, GameId[]> = {
  okey: ['okey', 'okey101'],
  tavla: ['tavla'],
  kart: ['pisti2', 'pisti4'],
};

export class Kahvehane {
  readonly group = new THREE.Group();
  readonly collision = new CollisionWorld();
  readonly tables: TableDef[] = [];
  readonly interactables: Interactable[] = [];
  readonly tv = new TvScreen();
  readonly semaverPos = new THREE.Vector3(-8.1, 0, -4.6);
  readonly counterServePos = new THREE.Vector3(-7.0, 0, -4.6);
  readonly tvViewPos = new THREE.Vector3(0.5, 0, -5.2);
  readonly doorPos = new THREE.Vector3(0, 0, 6.6);
  readonly benchSeats: { pos: THREE.Vector3; yaw: number; occupant: string | null }[] = [];
  private clockHands: { h: THREE.Object3D; m: THREE.Object3D; s: THREE.Object3D } | null = null;
  private fan: THREE.Object3D | null = null;
  private steam: THREE.Mesh[] = [];
  private time = 0;
  lights: THREE.Light[] = [];
  readonly W = 18;
  readonly D = 14;
  readonly H = 3.6;

  constructor() {
    this.buildRoom();
    this.buildCounter();
    this.buildTvCorner();
    this.buildTables();
    this.buildDecor();
    this.buildLights();
    this.mergeStats = mergeStatic(this.group);
  }
  mergeStats = { before: 0, after: 0 };

  // ------------------------------------------------------------------ oda
  private buildRoom() {
    const { W, D, H } = this;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), toonMat(0xffffff, { map: floorTexture() }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.name = 'floor';
    this.group.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), toonMat(0xe8d2a8));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = H;
    this.group.add(ceil);
    // ahşap kirişler
    for (let x = -7.5; x <= 7.5; x += 3) {
      const beam = toonMesh(sharedGeo('beam', () => new THREE.BoxGeometry(0.25, 0.25, D)), PALETTE.woodDark, 0.015);
      beam.position.set(x, H - 0.13, 0);
      this.group.add(beam);
    }
    const wp = wallpaperTexture();
    const wallMat = toonMat(0xffffff, { map: wp });
    const lowMat = toonMat(PALETTE.wallLow);
    const mkWall = (w: number, x: number, z: number, ry: number, gaps: { from: number; to: number; bottom: number; top: number }[] = []) => {
      // duvarı boşluklarla (kapı/pencere) parçalara ayır
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(w / 2, H); shape.lineTo(-w / 2, H); shape.lineTo(-w / 2, 0);
      for (const gp of gaps) {
        const hole = new THREE.Path();
        hole.moveTo(gp.from, gp.bottom); hole.lineTo(gp.to, gp.bottom); hole.lineTo(gp.to, gp.top); hole.lineTo(gp.from, gp.top); hole.lineTo(gp.from, gp.bottom);
        shape.holes.push(hole);
      }
      const geo = new THREE.ShapeGeometry(shape);
      // UV'leri metreye göre ölçekle
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / 1.8, pos.getY(i) / 1.8);
      const wall = new THREE.Mesh(geo, wallMat);
      wall.receiveShadow = true;
      wall.userData.wall = true;
      g.add(wall);
      // alt lambri
      const lambriShape = new THREE.Shape();
      lambriShape.moveTo(-w / 2, 0); lambriShape.lineTo(w / 2, 0); lambriShape.lineTo(w / 2, 1.0); lambriShape.lineTo(-w / 2, 1.0);
      for (const gp of gaps) if (gp.bottom < 1.0) {
        const hole = new THREE.Path();
        hole.moveTo(gp.from, gp.bottom); hole.lineTo(gp.to, gp.bottom); hole.lineTo(gp.to, Math.min(1.0, gp.top)); hole.lineTo(gp.from, Math.min(1.0, gp.top));
        lambriShape.holes.push(hole);
      }
      const lambri = new THREE.Mesh(new THREE.ShapeGeometry(lambriShape), lowMat);
      lambri.position.z = 0.01;
      g.add(lambri);
      const rail = toonMesh(new THREE.BoxGeometry(w, 0.08, 0.06), PALETTE.woodDark, 0);
      rail.position.set(0, 1.02, 0.03);
      g.add(rail);
      this.group.add(g);
      return g;
    };
    // arka duvar
    mkWall(W, 0, -D / 2, 0);
    // ön duvar (kapı + iki pencere) — iç yüz +z'ye değil -z'ye bakmalı
    mkWall(W, 0, D / 2, Math.PI, [
      { from: -0.8, to: 0.8, bottom: 0, top: 2.4 },
      { from: -6.5, to: -3.5, bottom: 1.1, top: 2.6 },
      { from: 3.5, to: 6.5, bottom: 1.1, top: 2.6 },
    ]);
    // sol duvar
    mkWall(D, -W / 2, 0, Math.PI / 2);
    // sağ duvar (iki pencere)
    mkWall(D, W / 2, 0, -Math.PI / 2, [
      { from: -4.5, to: -2, bottom: 1.1, top: 2.6 },
      { from: 1.5, to: 4, bottom: 1.1, top: 2.6 },
    ]);
    // pencere dışı: gökyüzü ve sokak paneli + çerçeve
    const sky = new THREE.MeshBasicMaterial({ color: 0x9fd8ff });
    const addWindow = (x: number, z: number, ry: number, w: number) => {
      const g = new THREE.Group();
      g.position.set(x, 1.85, z);
      g.rotation.y = ry;
      const outside = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.5), sky);
      outside.position.z = -0.25;
      g.add(outside);
      // karşı bina silüeti
      const bld = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.6, 0.9), new THREE.MeshBasicMaterial({ color: 0xf4a261 }));
      bld.position.set(-w * 0.15, -0.35, -0.24);
      g.add(bld);
      const frameMat = PALETTE.woodDark;
      for (const [fx, fy, fw, fh] of [[0, 0.75, w + 0.1, 0.1], [0, -0.75, w + 0.1, 0.12], [-w / 2, 0, 0.1, 1.6], [w / 2, 0, 0.1, 1.6], [0, 0, 0.06, 1.5], [0, 0.1, w, 0.05]] as const) {
        const f = toonMesh(new THREE.BoxGeometry(fw, fh, 0.12), frameMat, 0.01);
        f.position.set(fx, fy, 0);
        g.add(f);
      }
      // perde (kısa, kırmızı-beyaz)
      const cur = toonMesh(new THREE.BoxGeometry(w + 0.2, 0.35, 0.04), 0xd9412b, 0.01);
      cur.position.set(0, 0.62, 0.08);
      g.add(cur);
      this.group.add(g);
    };
    addWindow(-5, D / 2, Math.PI, 3);
    addWindow(5, D / 2, Math.PI, 3);
    addWindow(W / 2, 3.25, -Math.PI / 2, 2.5);
    addWindow(W / 2, -2.75, -Math.PI / 2, 2.5);
    // kapı
    const door = new THREE.Group();
    door.position.set(0, 0, D / 2);
    const outsideDoor = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), new THREE.MeshBasicMaterial({ color: 0xbfe6ff }));
    outsideDoor.position.set(0, 1.2, 0.3);
    outsideDoor.rotation.y = Math.PI;
    door.add(outsideDoor);
    const leaf = toonMesh(new THREE.BoxGeometry(0.8, 2.3, 0.06), 0x2e7d6b, 0.015);
    leaf.position.set(-0.4, 1.15, 0);
    const hinge = new THREE.Group();
    hinge.position.set(0.8, 0, 0.05);
    hinge.add(leaf);
    hinge.rotation.y = 0.9; // dışarı doğru aralık kapı
    door.add(hinge);
    const glassPane = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.8), toonMat(0xd8f3ff, { transparent: true, opacity: 0.6 }));
    glassPane.position.set(-0.4, 1.6, -0.035);
    glassPane.rotation.y = Math.PI;
    hinge.add(glassPane);
    for (const [fx, fy, fw, fh] of [[-0.85, 1.2, 0.12, 2.5], [0.85, 1.2, 0.12, 2.5], [0, 2.45, 1.8, 0.14]] as const) {
      const f = toonMesh(new THREE.BoxGeometry(fw, fh, 0.2), PALETTE.woodDark, 0.012);
      f.position.set(fx, fy, 0);
      door.add(f);
    }
    // paspas
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), toonMat(0xa33b2b));
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(0, 0.005, -0.6);
    door.add(mat);
    this.group.add(door);
    this.interactables.push({ id: 'door', kind: 'door', pos: new THREE.Vector3(0, 0, D / 2 - 0.5), radius: 1.2, label: 'Kapı' });
  }

  // ------------------------------------------------------------------ çay ocağı
  private buildCounter() {
    const g = new THREE.Group();
    // tezgah
    const counter = toonMesh(new THREE.BoxGeometry(1.1, 1.0, 4.2), PALETTE.wood, 0.02);
    counter.position.set(-8.35, 0.5, -4.6);
    g.add(counter);
    const top = toonMesh(new THREE.BoxGeometry(1.25, 0.06, 4.35), 0xe8e0d0, 0.015);
    top.position.set(-8.35, 1.03, -4.6);
    g.add(top);
    // ön panel çinileri
    for (let i = 0; i < 6; i++) {
      const tile = toonMesh(sharedGeo('cini', () => new THREE.BoxGeometry(0.02, 0.4, 0.5)), i % 2 ? 0x1d6fa5 : 0xf5f5f5, 0.006);
      tile.position.set(-7.79, 0.55, -6.3 + i * 0.68);
      g.add(tile);
    }
    this.collision.addBox(-8.35, -4.6, 1.3, 4.3, 'counter');
    // semaver
    const sem = new THREE.Group();
    sem.position.set(-8.35, 1.06, -4.6);
    const brass = 0xe0a83a;
    const body = toonMesh(sharedGeo('semBody', () => new THREE.LatheGeometry([
      new THREE.Vector2(0.14, 0), new THREE.Vector2(0.2, 0.05), new THREE.Vector2(0.22, 0.3), new THREE.Vector2(0.2, 0.5), new THREE.Vector2(0.12, 0.58), new THREE.Vector2(0.08, 0.62),
    ], 18)), brass, 0.015);
    sem.add(body);
    const pot = toonMesh(sharedGeo('demlik', () => new THREE.SphereGeometry(0.12, 14, 10)), 0xf2f2f2, 0.012);
    pot.position.y = 0.72;
    sem.add(pot);
    const potLid = toonMesh(sharedGeo('demlikLid', () => new THREE.ConeGeometry(0.06, 0.08, 10)), 0xd9412b, 0.008);
    potLid.position.y = 0.86;
    sem.add(potLid);
    const spout = toonMesh(sharedGeo('spout', () => new THREE.CylinderGeometry(0.02, 0.025, 0.18, 8)), brass, 0.008);
    spout.position.set(0.22, 0.2, 0);
    spout.rotation.z = Math.PI / 2.4;
    sem.add(spout);
    for (const sx of [-1, 1]) {
      const handle = toonMesh(sharedGeo('semHandle', () => new THREE.TorusGeometry(0.06, 0.012, 6, 12, Math.PI)), brass, 0.006);
      handle.position.set(0, 0.42, sx * 0.22);
      handle.rotation.x = sx * Math.PI / 2;
      sem.add(handle);
    }
    g.add(sem);
    // buhar
    const steamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(sharedGeo('steam', () => new THREE.SphereGeometry(0.05, 8, 6)), steamMat.clone());
      p.position.set(-8.35, 2.0, -4.6);
      p.userData.phase = i / 6;
      p.userData.dynamic = true;
      this.steam.push(p);
      g.add(p);
    }
    // bardak tepsileri
    for (let i = 0; i < 7; i++) {
      const glass = makeTeaGlass(true);
      glass.position.set(-8.15 + (i % 2) * 0.15, 1.07, -6.2 + i * 0.22);
      g.add(glass);
    }
    // raf ve kavanozlar
    const shelf = toonMesh(new THREE.BoxGeometry(0.4, 0.05, 3.6), PALETTE.woodDark, 0.012);
    shelf.position.set(-8.8, 2.1, -4.6);
    g.add(shelf);
    const jarColors = [0xf2c14e, 0xd94b4b, 0x7cb342, 0xffffff, 0x8d6e63];
    for (let i = 0; i < 9; i++) {
      const jar = toonMesh(sharedGeo('jar', () => new THREE.CylinderGeometry(0.08, 0.08, 0.22, 10)), jarColors[i % 5], 0.01);
      jar.position.set(-8.8, 2.24, -6.1 + i * 0.37);
      g.add(jar);
    }
    // tabela
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.8), toonMat(0xffffff, { map: signTexture('ÇAY OCAĞI', 'Demli çay, açık muhabbet') }));
    sign.position.set(-8.97, 2.75, -4.6);
    sign.rotation.y = Math.PI / 2;
    g.add(sign);
    this.group.add(g);
    this.interactables.push({ id: 'semaver', kind: 'semaver', pos: new THREE.Vector3(-7.4, 0, -4.6), radius: 1.3, label: 'Semaver' });
  }

  // ------------------------------------------------------------------ TV köşesi
  private buildTvCorner() {
    const g = new THREE.Group();
    // duvar rafı
    const shelf = toonMesh(new THREE.BoxGeometry(1.6, 0.08, 0.7), PALETTE.woodDark, 0.015);
    shelf.position.set(0.5, 2.05, -6.6);
    g.add(shelf);
    for (const sx of [-0.6, 0.6]) {
      const br = toonMesh(new THREE.BoxGeometry(0.06, 0.4, 0.5), PALETTE.woodDark, 0.01);
      br.position.set(0.5 + sx, 1.85, -6.75);
      br.rotation.x = 0.3;
      g.add(br);
    }
    const tv = new THREE.Group();
    tv.position.set(0.5, 2.5, -6.55);
    tv.rotation.x = 0.12;
    const box = toonMesh(new THREE.BoxGeometry(1.1, 0.82, 0.6), 0x6d4c33, 0.02);
    tv.add(box);
    const bezel = toonMesh(new THREE.BoxGeometry(0.86, 0.66, 0.05), 0x2b2b2b, 0.01);
    bezel.position.set(-0.07, 0, 0.3);
    tv.add(bezel);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.57), new THREE.MeshBasicMaterial({ map: this.tv.texture }));
    screen.position.set(-0.07, 0, 0.33);
    tv.add(screen);
    for (let i = 0; i < 2; i++) {
      const knob = toonMesh(sharedGeo('knob', () => new THREE.CylinderGeometry(0.04, 0.04, 0.04, 10)), 0xdddddd, 0.006);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(0.44, 0.15 - i * 0.2, 0.31);
      tv.add(knob);
    }
    for (const sx of [-1, 1]) {
      const ant = toonMesh(sharedGeo('antenna', () => new THREE.CylinderGeometry(0.01, 0.01, 0.7, 6)), 0xaaaaaa, 0.005);
      ant.position.set(sx * 0.15, 0.7, 0);
      ant.rotation.z = -sx * 0.5;
      tv.add(ant);
    }
    g.add(tv);
    this.group.add(g);
    this.interactables.push({ id: 'tv', kind: 'tv', pos: new THREE.Vector3(0.5, 0, -5.6), radius: 1.4, label: 'Televizyon' });
  }

  // ------------------------------------------------------------------ masalar
  private chairGeometry(): THREE.BufferGeometry {
    return sharedGeo('chairMerged', () => {
      const parts: THREE.BufferGeometry[] = [];
      const seat = new THREE.BoxGeometry(0.44, 0.06, 0.42).translate(0, 0.45, 0);
      parts.push(seat);
      for (const [x, z] of [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]]) parts.push(new THREE.CylinderGeometry(0.025, 0.02, 0.45, 6).translate(x, 0.225, z));
      for (const x of [-0.18, 0.18]) parts.push(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6).translate(x, 0.72, -0.19));
      parts.push(new THREE.BoxGeometry(0.42, 0.1, 0.03).translate(0, 0.9, -0.19));
      parts.push(new THREE.BoxGeometry(0.42, 0.06, 0.03).translate(0, 0.72, -0.19));
      return mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
    });
  }

  private addTable(id: string, kind: TableKind, x: number, z: number, name: string) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const size = kind === 'tavla' ? 0.75 : 0.95;
    const topColor = kind === 'okey' ? PALETTE.felt : kind === 'kart' ? PALETTE.feltBlue : PALETTE.woodLight;
    const top = toonMesh(new THREE.BoxGeometry(size, 0.05, size), topColor, 0.015);
    top.position.y = 0.76;
    group.add(top);
    const rim = toonMesh(new THREE.BoxGeometry(size + 0.08, 0.04, size + 0.08), PALETTE.wood, 0.015);
    rim.position.y = 0.73;
    group.add(rim);
    const leg = toonMesh(sharedGeo('tableLeg', () => new THREE.CylinderGeometry(0.05, 0.07, 0.72, 8)), PALETTE.woodDark, 0.012);
    leg.position.y = 0.36;
    group.add(leg);
    const foot = toonMesh(sharedGeo('tableFoot', () => new THREE.CylinderGeometry(0.28, 0.32, 0.05, 12)), PALETTE.woodDark, 0.012);
    foot.position.y = 0.025;
    group.add(foot);
    this.group.add(group);
    this.collision.addBox(x, z, size + 0.1, size + 0.1, `table:${id}`);

    const def: TableDef = { id, kind, name, center: new THREE.Vector3(x, 0, z), seats: [], games: TABLE_GAMES[kind], group, props: new THREE.Group(), live: new THREE.Group() };
    def.props.userData.dynamic = true;
    def.props.userData.mergeInside = true;
    def.live.userData.dynamic = true;
    group.add(def.props, def.live);
    // sandalyeler: 0 güney(+z), 1 doğu(+x)... oturma sırası saat yönünün tersine
    const seatDirs = kind === 'tavla' ? [[0, 1], [0, -1]] : [[0, 1], [1, 0], [0, -1], [-1, 0]];
    const dist = size / 2 + 0.38;
    seatDirs.forEach(([dx, dz], i) => {
      const chair = new THREE.Mesh(this.chairGeometry(), toonMat(PALETTE.wood));
      chair.castShadow = true;
      const ol = new THREE.Mesh(chair.geometry, outlineMat(0.014));
      ol.userData.isOutline = true;
      chair.add(ol);
      const cx = x + dx * dist, cz = z + dz * dist;
      chair.position.set(cx, 0, cz);
      const yaw = Math.atan2(-dx, -dz); // masaya bak
      chair.rotation.y = yaw;
      this.group.add(chair);
      this.collision.addCircle(cx, cz, 0.2, `chair:${id}:${i}`);
      const seat: Seat = { index: i, pos: new THREE.Vector3(cx, 0, cz), yaw, chair, occupant: null, table: def };
      def.seats.push(seat);
      this.interactables.push({ id: `seat:${id}:${i}`, kind: 'seat', pos: seat.pos.clone(), radius: 0.95, label: `${name} — otur`, ref: seat });
    });
    this.decorateTable(def, size);
    this.tables.push(def);
  }

  private decorateTable(t: TableDef, size: number) {
    const y = 0.785;
    const p = t.props;
    if (t.kind === 'okey') {
      // ıstakalar
      t.seats.forEach((s) => {
        const ist = toonMesh(sharedGeo('istakaTable', () => new THREE.BoxGeometry(0.6, 0.08, 0.07)), 0xb7773d, 0.01);
        const dx = s.pos.x - t.center.x, dz = s.pos.z - t.center.z;
        const len = Math.hypot(dx, dz);
        ist.position.set((dx / len) * size * 0.38, y + 0.04, (dz / len) * size * 0.38);
        ist.rotation.y = s.yaw;
        p.add(ist);
        for (let k = 0; k < 6; k++) {
          const tile = toonMesh(sharedGeo('tileStand', () => new THREE.BoxGeometry(0.05, 0.07, 0.015)), 0xfff6e0, 0.005);
          tile.position.set(ist.position.x + Math.cos(s.yaw) * (k - 2.5) * 0.08, y + 0.11, ist.position.z - Math.sin(s.yaw) * (k - 2.5) * 0.08);
          tile.rotation.y = s.yaw;
          tile.rotation.x = -0.2;
          p.add(tile);
        }
      });
      // orta deste
      for (let k = 0; k < 5; k++) {
        const stack = toonMesh(sharedGeo('tileStack', () => new THREE.BoxGeometry(0.06, 0.1, 0.03)), 0xfff6e0, 0.005);
        stack.position.set(-0.12 + k * 0.065, y + 0.05, 0);
        p.add(stack);
      }
    } else if (t.kind === 'tavla') {
      const tex = tavlaBoardTexture();
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.48), [
        toonMat(0x6b3a1c), toonMat(0x6b3a1c), toonMat(0xffffff, { map: tex }), toonMat(0x6b3a1c), toonMat(0x6b3a1c), toonMat(0x6b3a1c),
      ]);
      board.position.y = y + 0.02;
      board.rotation.y = Math.PI / 2;
      p.add(board);
      for (let k = 0; k < 2; k++) {
        const die = toonMesh(sharedGeo('die', () => new THREE.BoxGeometry(0.035, 0.035, 0.035)), 0xffffff, 0.006);
        die.position.set(0.05 + k * 0.05, y + 0.06, 0.05);
        die.rotation.y = k;
        p.add(die);
      }
    } else {
      for (let k = 0; k < 6; k++) {
        const card = toonMesh(sharedGeo('cardFlat', () => new THREE.BoxGeometry(0.07, 0.004, 0.1)), k % 2 ? 0xffffff : 0xc0392b, 0.004);
        card.position.set(Math.cos(k) * 0.15, y + 0.003 + k * 0.002, Math.sin(k) * 0.15);
        card.rotation.y = k * 0.7;
        p.add(card);
      }
    }
    // çay bardakları
    const glass = makeTeaGlass(true);
    glass.position.set(size * 0.35, y + 0.006, -size * 0.35);
    p.add(glass);
    const ash = toonMesh(sharedGeo('cezve', () => new THREE.CylinderGeometry(0.05, 0.06, 0.03, 10)), 0x8d99ae, 0.006);
    ash.position.set(-size * 0.36, y + 0.015, size * 0.35);
    p.add(ash);
  }

  private buildTables() {
    this.addTable('okey1', 'okey', -3.6, -3.0, 'Okey Masası 1');
    this.addTable('okey2', 'okey', 0.5, -2.6, 'Okey Masası 2');
    this.addTable('okey3', 'okey', 4.6, -3.0, 'Okey Masası 3');
    this.addTable('kart1', 'kart', -1.6, 1.6, 'İskambil Masası 1');
    this.addTable('kart2', 'kart', 2.4, 1.6, 'İskambil Masası 2');
    this.addTable('tavla1', 'tavla', -5.6, 1.4, 'Tavla Masası 1');
    this.addTable('tavla2', 'tavla', 6.2, 1.2, 'Tavla Masası 2');
  }

  // ------------------------------------------------------------------ dekor
  private buildDecor() {
    const g = this.group;
    // duvar saati
    const clock = new THREE.Group();
    clock.position.set(-3.6, 2.7, -6.95);
    const face = toonMesh(sharedGeo('clockFace', () => new THREE.CylinderGeometry(0.38, 0.38, 0.06, 28).rotateX(Math.PI / 2)), 0xfffaf0, 0.02);
    clock.add(face);
    const rim = toonMesh(sharedGeo('clockRim', () => new THREE.TorusGeometry(0.39, 0.04, 8, 28)), PALETTE.brass, 0.01);
    clock.add(rim);
    for (let i = 0; i < 12; i++) {
      const tick = toonMesh(sharedGeo('tick', () => new THREE.BoxGeometry(0.025, 0.07, 0.01)), 0x222222, 0);
      const a = (i / 12) * Math.PI * 2;
      tick.position.set(Math.sin(a) * 0.3, Math.cos(a) * 0.3, 0.035);
      tick.rotation.z = -a;
      clock.add(tick);
    }
    const mkHand = (len: number, w: number, color: number) => {
      const pivot = new THREE.Group();
      const h = toonMesh(new THREE.BoxGeometry(w, len, 0.01), color, 0);
      h.position.y = len / 2;
      pivot.add(h);
      pivot.position.z = 0.045;
      pivot.userData.dynamic = true;
      clock.add(pivot);
      return pivot;
    };
    this.clockHands = { h: mkHand(0.18, 0.03, 0x222222), m: mkHand(0.27, 0.02, 0x222222), s: mkHand(0.3, 0.008, 0xd62828) };
    g.add(clock);
    // takvim
    const cal = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.77), toonMat(0xffffff, { map: calendarTexture() }));
    cal.position.set(3.4, 2.4, -6.97);
    g.add(cal);
    // tabelalar
    const signs: [string, string, number, number, number, number, number][] = [
      ['VERESİYE YARIN', 'Bugün nakit, yarın veresiye', 8.97, 2.9, 0.3, -Math.PI / 2, 2.2],
      ['KAHVEHANE', 'Est. 1974 — Mahallenin Meclisi', -2.0, 3.05, 6.97, Math.PI, 3.0],
      ['SİYASET YASAK', '(Futbol serbest, kavga yasak)', -6.6, 2.65, -6.97, 0, 1.9],
      ['OKEY ATANA ÇAY BENDEN', '— Rıza Dayı (yalan)', 6.4, 2.65, -6.97, 0, 2.2],
      ['ISTAKA FIRLATMAK YASAKTIR', 'Hasar: 1 tepsi çay', -8.97, 1.6, 2.4, Math.PI / 2, 2.2],
    ];
    for (const [t, s, x, y, z, ry, w] of signs) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.375), toonMat(0xffffff, { map: signTexture(t, s) }));
      m.position.set(x, y, z);
      m.rotation.y = ry;
      g.add(m);
    }
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.0), toonMat(0xffffff, { map: posterTexture() }));
    poster.position.set(8.97, 1.9, -5.5);
    poster.rotation.y = -Math.PI / 2;
    g.add(poster);
    // giriş bankı
    const bench = toonMesh(new THREE.BoxGeometry(2.4, 0.08, 0.5), PALETTE.wood, 0.015);
    bench.position.set(-5.3, 0.45, 5.8);
    g.add(bench);
    const benchBack = toonMesh(new THREE.BoxGeometry(2.4, 0.4, 0.06), PALETTE.wood, 0.015);
    benchBack.position.set(-5.3, 0.8, 6.05);
    g.add(benchBack);
    for (const lx of [-1.1, 1.1]) {
      const l = toonMesh(new THREE.BoxGeometry(0.08, 0.45, 0.45), PALETTE.woodDark, 0.01);
      l.position.set(-5.3 + lx, 0.225, 5.8);
      g.add(l);
    }
    this.collision.addBox(-5.3, 5.85, 2.4, 0.6, 'bench');
    this.benchSeats.push({ pos: new THREE.Vector3(-5.9, 0, 5.75), yaw: Math.PI, occupant: null }, { pos: new THREE.Vector3(-4.7, 0, 5.75), yaw: Math.PI, occupant: null });
    // saksılar
    for (const [x, z] of [[-8.4, 6.4], [8.4, 6.4], [8.4, -6.4], [-1.6, -6.5]]) {
      const potGroup = new THREE.Group();
      potGroup.userData.occluder = true;
      g.add(potGroup);
      const pot = toonMesh(sharedGeo('pot', () => new THREE.CylinderGeometry(0.25, 0.18, 0.45, 12)), 0xc1440e, 0.015);
      pot.position.set(x, 0.225, z);
      potGroup.add(pot);
      for (let k = 0; k < 5; k++) {
        const leaf = toonMesh(sharedGeo('leaf', () => new THREE.SphereGeometry(0.2, 10, 8)), 0x3f9b4a, 0.012);
        leaf.position.set(x + Math.cos(k * 1.3) * 0.18, 0.75 + (k % 2) * 0.25, z + Math.sin(k * 1.3) * 0.18);
        leaf.scale.set(0.8, 1.3, 0.8);
        potGroup.add(leaf);
      }
      this.collision.addCircle(x, z, 0.3, 'pot');
    }
    // askılık
    const rack = toonMesh(sharedGeo('coatRack', () => new THREE.CylinderGeometry(0.04, 0.05, 1.9, 8)), PALETTE.woodDark, 0.012);
    rack.position.set(1.8, 0.95, 6.4);
    const rackGroup = new THREE.Group();
    rackGroup.userData.occluder = true;
    g.add(rackGroup);
    rackGroup.add(rack);
    const coat = toonMesh(sharedGeo('coat', () => new THREE.CapsuleGeometry(0.18, 0.5, 4, 10)), 0x5d4037, 0.015);
    coat.position.set(1.95, 1.4, 6.4);
    rackGroup.add(coat);
    const hat = toonMesh(sharedGeo('hangHat', () => new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), 0x333333, 0.01);
    hat.position.set(1.7, 1.85, 6.4);
    rackGroup.add(hat);
    this.collision.addCircle(1.8, 6.4, 0.3, 'rack');
    // tavan vantilatörü
    const fan = new THREE.Group();
    fan.position.set(0.5, this.H - 0.5, 0);
    const rod = toonMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), 0x444444, 0);
    rod.position.y = 0.25;
    fan.add(rod);
    const hub = toonMesh(new THREE.CylinderGeometry(0.12, 0.1, 0.12, 12), PALETTE.brass, 0.01);
    fan.add(hub);
    const blades = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const bl = toonMesh(sharedGeo('blade', () => new THREE.BoxGeometry(0.75, 0.02, 0.16).translate(0.45, 0, 0)), PALETTE.woodDark, 0.01);
      bl.rotation.y = (i / 4) * Math.PI * 2;
      blades.add(bl);
    }
    fan.add(blades);
    this.fan = blades;
    blades.userData.dynamic = true;
    g.add(fan);
    // dart tahtası (sol duvar) + atış çizgisi
    this.buildDartBoard();
    // radyo (köşede)
    const radio = toonMesh(new THREE.BoxGeometry(0.5, 0.3, 0.2), 0x8d5524, 0.015);
    radio.position.set(-8.35, 1.21, -2.9);
    g.add(radio);
    const grill = toonMesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 14), 0xf1e3c6, 0.006);
    grill.rotation.z = Math.PI / 2;
    grill.position.set(-8.09, 1.21, -2.95);
    g.add(grill);
  }

  /** Dart tahtası: merkez dünya koordinatı, tahta yarıçapı (çift halkanın dış kenarı) */
  readonly dartCenter = new THREE.Vector3(-8.93, 1.73, 4.4);
  readonly dartRadius = 0.26;
  readonly dartThrowPos = new THREE.Vector3(-6.3, 0, 4.4);
  readonly dartGroup = new THREE.Group();

  private buildDartBoard() {
    const g = this.dartGroup;
    g.position.copy(this.dartCenter);
    g.rotation.y = Math.PI / 2; // +x'e (odaya) bakar
    g.userData.dynamic = true; // saplanan oklar eklenir
    const back = toonMesh(sharedGeo('dartBack', () => new THREE.CylinderGeometry(1, 1, 0.04, 40).rotateX(Math.PI / 2)), 0x2b2b2b, 0.015);
    back.scale.set(this.dartRadius * 1.35, this.dartRadius * 1.35, 1);
    back.position.z = -0.02;
    g.add(back);
    const face = new THREE.Mesh(new THREE.CircleGeometry(this.dartRadius * 1.25, 64), new THREE.MeshBasicMaterial({ map: dartTexture(this.dartRadius * 1.25 / this.dartRadius) }));
    face.position.z = 0.002;
    g.add(face);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), toonMat(0xffffff, { map: signTexture('DART', 'Çizgiye bas, atışını yap') }));
    plate.position.set(0, this.dartRadius * 1.35 + 0.16, 0);
    g.add(plate);
    this.group.add(g);
    // yerdeki atış çizgisi
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 1.2), new THREE.MeshBasicMaterial({ color: 0xd9412b }));
    line.rotation.x = -Math.PI / 2;
    line.position.set(this.dartThrowPos.x + 0.3, 0.006, this.dartThrowPos.z);
    this.group.add(line);
    this.interactables.push({ id: 'dart', kind: 'dart', pos: this.dartThrowPos.clone(), radius: 1.4, label: 'Dart' });
  }

  private buildLights() {
    const hemi = new THREE.HemisphereLight(0xfff1d6, 0x8a5a3a, 1.35);
    this.group.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe2b0, 1.5);
    sun.position.set(6, 9, 5);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -11; sc.right = 11; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 30;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.02;
    this.group.add(sun, sun.target);
    this.lights.push(hemi, sun);
    // sarkıt lambalar (emissive ampul + birkaç noktasal ışık)
    const lampPos: [number, number][] = [[-3.6, -3.0], [0.5, -2.6], [4.6, -3.0], [-1.6, 1.6], [2.4, 1.6], [-5.6, 1.4], [6.2, 1.2]];
    lampPos.forEach(([x, z], i) => {
      const cord = toonMesh(sharedGeo('cord', () => new THREE.CylinderGeometry(0.01, 0.01, 1.1, 4)), 0x222222, 0);
      cord.position.set(x, this.H - 0.55, z);
      this.group.add(cord);
      const shade = toonMesh(sharedGeo('shade', () => new THREE.ConeGeometry(0.3, 0.22, 16, 1, true)), 0x2e7d6b, 0.012);
      (shade.material as THREE.Material).side = THREE.DoubleSide;
      shade.position.set(x, this.H - 1.15, z);
      this.group.add(shade);
      const bulb = new THREE.Mesh(sharedGeo('bulb', () => new THREE.SphereGeometry(0.08, 10, 8)), new THREE.MeshBasicMaterial({ color: 0xfff3b0 }));
      bulb.position.set(x, this.H - 1.25, z);
      this.group.add(bulb);
      if (i < 4) {
        const pl = new THREE.PointLight(0xffc77a, 4, 6, 1.6);
        pl.position.set(x, this.H - 1.35, z);
        this.group.add(pl);
        this.lights.push(pl);
      }
    });
  }

  update(dt: number) {
    this.time += dt;
    this.tv.update(dt);
    if (this.fan) this.fan.rotation.y += dt * 2.2;
    if (this.clockHands) {
      const d = new Date();
      const sec = d.getSeconds() + d.getMilliseconds() / 1000;
      const min = d.getMinutes() + sec / 60;
      const hr = (d.getHours() % 12) + min / 60;
      this.clockHands.s.rotation.z = -(sec / 60) * Math.PI * 2;
      this.clockHands.m.rotation.z = -(min / 60) * Math.PI * 2;
      this.clockHands.h.rotation.z = -(hr / 12) * Math.PI * 2;
    }
    for (const s of this.steam) {
      const ph = (this.time * 0.5 + s.userData.phase) % 1;
      s.position.set(-8.35 + Math.sin(ph * 9 + s.userData.phase * 10) * 0.05, 2.0 + ph * 0.7, -4.6 + Math.cos(ph * 7) * 0.04);
      s.scale.setScalar(0.6 + ph * 1.6);
      (s.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - ph);
    }
  }

  tableById(id: string) {
    return this.tables.find((t) => t.id === id);
  }

  allSeats(): Seat[] {
    return this.tables.flatMap((t) => t.seats);
  }
}

function tavlaBoardTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 200;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e9c891'; g.fillRect(0, 0, 256, 200);
  g.fillStyle = '#6b3a1c'; g.fillRect(124, 0, 8, 200);
  for (let i = 0; i < 12; i++) {
    const x = (i < 6 ? 8 : 20) + i * 19;
    g.fillStyle = i % 2 ? '#a3341f' : '#2f5d50';
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 18, 0); g.lineTo(x + 9, 80); g.fill();
    g.fillStyle = i % 2 ? '#2f5d50' : '#a3341f';
    g.beginPath(); g.moveTo(x, 200); g.lineTo(x + 18, 200); g.lineTo(x + 9, 120); g.fill();
  }
  for (let i = 0; i < 5; i++) { g.fillStyle = '#fff'; g.beginPath(); g.arc(20 + i * 6, 12 + i * 14, 8, 0, 7); g.fill(); }
  for (let i = 0; i < 5; i++) { g.fillStyle = '#222'; g.beginPath(); g.arc(230, 188 - i * 14, 8, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Dart tahtası dokusu — puan geometrisi games/dart/dart.ts ile birebir aynı */
function dartTexture(outerScale: number): THREE.CanvasTexture {
  const N = 512, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  const cx = N / 2, R = N / 2 / outerScale; // R = çift halkanın dış kenarı
  const sectors = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
  g.fillStyle = '#1b1b1b'; g.fillRect(0, 0, N, N);
  const ring = (r0: number, r1: number, colA: string, colB: string) => {
    for (let i = 0; i < 20; i++) {
      // tuval açısı: üst = -90°, saat yönünde
      const a0 = -Math.PI / 2 + (i - 0.5) * (Math.PI / 10), a1 = a0 + Math.PI / 10;
      g.beginPath(); g.arc(cx, cx, r1 * R, a0, a1); g.arc(cx, cx, r0 * R, a1, a0, true); g.closePath();
      g.fillStyle = i % 2 ? colB : colA; g.fill();
    }
  };
  ring(0.094, 0.582, '#1b1b1b', '#f4e7c8');
  ring(0.582, 0.629, '#d62828', '#2f9e44');
  ring(0.629, 0.953, '#1b1b1b', '#f4e7c8');
  ring(0.953, 1.0, '#d62828', '#2f9e44');
  g.fillStyle = '#2f9e44'; g.beginPath(); g.arc(cx, cx, 0.094 * R, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d62828'; g.beginPath(); g.arc(cx, cx, 0.037 * R, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#c0c0c0'; g.lineWidth = 1.5;
  for (const r of [0.094, 0.582, 0.629, 0.953, 1]) { g.beginPath(); g.arc(cx, cx, r * R, 0, Math.PI * 2); g.stroke(); }
  g.fillStyle = '#fff'; g.font = 'bold 26px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle';
  sectors.forEach((s, i) => { const a = -Math.PI / 2 + i * (Math.PI / 10); g.fillText(String(s), cx + Math.cos(a) * 1.11 * R, cx + Math.sin(a) * 1.11 * R); });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
