/**
 * Masadaki oyun durumunun gerçek 3D gösterimi.
 * - Okey taşları ve kartlar: tek InstancedMesh + doku atlası (örnek başına UV ofseti), tek materyal.
 * - Tavla pulları: InstancedMesh + örnek rengi. Zarlar: iki küp, atış animasyonu.
 * - Her parça bir anahtarla (taş/kart id'si) izlenir; durum değişince hedef konuma yumuşakça uçar.
 * Oyun arayüzleri yalnızca açık bilgiyi gönderir; rakip taşları arkası dönük, kartları kapalıdır.
 */
import * as THREE from 'three';
import type { Seat } from '../world/Kahvehane';
import { Tile, OkeyCtx, COLOR_CSS } from '../games/common/tiles';
import type { Card } from '../games/pisti/pisti';
import { RANK_LABEL, SUIT_SYMBOL } from '../games/pisti/pisti';
import { toonMesh, sharedGeo, outlineMat } from '../world/materials';

const TOP = 0.785; // masa üst yüzeyi (yerel)

// ------------------------------------------------------------------ atlaslar
interface Atlas { tex: THREE.CanvasTexture; cols: number; rows: number }

function makeAtlas(cols: number, rows: number, cw: number, ch: number, draw: (g: CanvasRenderingContext2D, i: number, x: number, y: number) => void): Atlas {
  const c = document.createElement('canvas');
  c.width = cols * cw;
  c.height = rows * ch;
  const g = c.getContext('2d')!;
  for (let i = 0; i < cols * rows; i++) draw(g, i, (i % cols) * cw, Math.floor(i / cols) * ch);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.flipY = true;
  return { tex, cols, rows };
}

let tileAtlas: Atlas | null = null;
/** Taş atlası: 0..51 = renk*13 + (sayı-1), 52 = sahte okey, 53 = düz (arka/yan) */
function getTileAtlas(): Atlas {
  if (tileAtlas) return tileAtlas;
  const cw = 64, ch = 88;
  tileAtlas = makeAtlas(8, 7, cw, ch, (g, i, x, y) => {
    g.fillStyle = '#fbf1da';
    g.fillRect(x, y, cw, ch);
    if (i > 52) return;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (i === 52) {
      g.fillStyle = '#2f7d32';
      g.font = 'bold 44px Georgia';
      g.fillText('✿', x + cw / 2, y + ch * 0.45);
      return;
    }
    const color = Math.floor(i / 13), num = (i % 13) + 1;
    g.fillStyle = COLOR_CSS[color];
    g.font = `bold ${num >= 10 ? 40 : 48}px Georgia`;
    g.fillText(String(num), x + cw / 2, y + ch * 0.42);
    g.beginPath();
    g.arc(x + cw / 2, y + ch * 0.78, 7, 0, Math.PI * 2);
    g.fill();
  });
  return tileAtlas;
}

let cardAtlas: Atlas | null = null;
/** Kart atlası: 0..51 = suit*13 + (rank-1), 52 = arka, 53 = düz beyaz */
function getCardAtlas(): Atlas {
  if (cardAtlas) return cardAtlas;
  const cw = 72, ch = 100;
  cardAtlas = makeAtlas(9, 6, cw, ch, (g, i, x, y) => {
    g.fillStyle = '#ffffff';
    g.fillRect(x, y, cw, ch);
    if (i === 52) {
      g.fillStyle = '#c0392b';
      g.fillRect(x + 4, y + 4, cw - 8, ch - 8);
      g.strokeStyle = '#ffd6c9';
      g.lineWidth = 2;
      for (let k = -ch; k < cw; k += 10) { g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + k + ch, y + ch); g.stroke(); }
      g.clearRect(x + cw, y, 1, ch);
      return;
    }
    if (i > 52) return;
    const suit = Math.floor(i / 13), rank = (i % 13) + 1;
    g.fillStyle = suit === 1 || suit === 2 ? '#c0392b' : '#1b1b1b';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 22px Georgia';
    g.fillText(RANK_LABEL[rank], x + 15, y + 16);
    g.font = '18px Georgia';
    g.fillText(SUIT_SYMBOL[suit], x + 15, y + 36);
    g.font = 'bold 40px Georgia';
    g.fillText(rank >= 11 ? RANK_LABEL[rank] : SUIT_SYMBOL[suit], x + cw / 2, y + ch * 0.6);
  });
  return cardAtlas;
}

/**
 * Kutu geometrisi + "faceSel" özniteliği: 1 = ön yüz (örneğin atlas hücresi), 2 = arka yüz, 0 = yanlar.
 */
function pieceGeometry(key: string, w: number, h: number, d: number): THREE.BufferGeometry {
  return sharedGeo(key, () => {
    const g = new THREE.BoxGeometry(w, h, d);
    const n = g.attributes.position.count;
    const sel = new Float32Array(n);
    // BoxGeometry yüz sırası: +x,-x,+y,-y,+z,-z (her biri 4 köşe)
    for (let v = 0; v < n; v++) {
      const face = Math.floor(v / 4);
      sel[v] = face === 4 ? 1 : face === 5 ? 2 : 0;
    }
    g.setAttribute('faceSel', new THREE.BufferAttribute(sel, 1));
    return g;
  });
}

function atlasMaterial(atlas: Atlas, backCell: number, plainCell: number): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ map: atlas.tex, color: 0xffffff });
  const cell = new THREE.Vector2(1 / atlas.cols, 1 / atlas.rows);
  const cellUv = (i: number) => new THREE.Vector2((i % atlas.cols) / atlas.cols, 1 - (Math.floor(i / atlas.cols) + 1) / atlas.rows);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCell = { value: cell };
    sh.uniforms.uBack = { value: cellUv(backCell) };
    sh.uniforms.uPlain = { value: cellUv(plainCell) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float faceSel;\nattribute vec2 instUv;\nuniform vec2 uCell; uniform vec2 uBack; uniform vec2 uPlain;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vec2 inner = vec2(0.06, 0.04) + vMapUv * vec2(0.88, 0.92);
        if (faceSel > 1.5) vMapUv = uBack + inner * uCell;
        else if (faceSel > 0.5) vMapUv = instUv + inner * uCell;
        else vMapUv = uPlain + vec2(0.5) * uCell;`);
  };
  m.customProgramCacheKey = () => `atlas-${atlas.cols}x${atlas.rows}-${backCell}-${plainCell}`;
  return m;
}

// ------------------------------------------------------------------ parça katmanı
interface Item {
  idx: number;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  tp: THREE.Vector3;
  tq: THREE.Quaternion;
  live: boolean;
  init: boolean;
}

class PieceLayer {
  readonly mesh: THREE.InstancedMesh;
  private items = new Map<string | number, Item>();
  private free: number[] = [];
  private uvAttr: THREE.InstancedBufferAttribute | null = null;
  private atlas: Atlas | null;
  private m4 = new THREE.Matrix4();
  private one = new THREE.Vector3(1, 1, 1);
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);
  dirty = true;

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, max: number, atlas: Atlas | null) {
    this.atlas = atlas;
    const g = geo.clone(); // instUv özniteliği örneğe özgü
    if (atlas) {
      this.uvAttr = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2);
      g.setAttribute('instUv', this.uvAttr);
    }
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    for (let i = max - 1; i >= 0; i--) { this.free.push(i); this.mesh.setMatrixAt(i, this.zero); }
  }

  beginFrame() { for (const it of this.items.values()) it.live = false; }

  place(key: string | number, pos: THREE.Vector3, quat: THREE.Quaternion, cell?: number, color?: THREE.Color, spawn?: THREE.Vector3) {
    let it = this.items.get(key);
    if (!it) {
      const idx = this.free.pop();
      if (idx === undefined) return;
      const start = spawn ?? pos;
      it = { idx, pos: start.clone(), quat: quat.clone(), tp: pos.clone(), tq: quat.clone(), live: true, init: true };
      this.items.set(key, it);
    }
    it.tp.copy(pos);
    it.tq.copy(quat);
    it.live = true;
    if (cell !== undefined && this.atlas && this.uvAttr) {
      const a = this.atlas;
      this.uvAttr.setXY(it.idx, (cell % a.cols) / a.cols, 1 - (Math.floor(cell / a.cols) + 1) / a.rows);
      this.uvAttr.needsUpdate = true;
    }
    if (color) { this.mesh.setColorAt(it.idx, color); if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
    this.dirty = true;
  }

  endFrame() {
    for (const [k, it] of this.items) {
      if (!it.live) {
        this.mesh.setMatrixAt(it.idx, this.zero);
        this.free.push(it.idx);
        this.items.delete(k);
        this.dirty = true;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    for (const it of this.items.values()) { this.mesh.setMatrixAt(it.idx, this.zero); this.free.push(it.idx); }
    this.items.clear();
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt: number) {
    const k = 1 - Math.exp(-dt * 9);
    let moved = false;
    const tmp = new THREE.Vector3();
    for (const it of this.items.values()) {
      const d = it.pos.distanceTo(it.tp);
      if (d < 0.0005 && !it.init && it.quat.angleTo(it.tq) < 0.001) continue;
      it.init = false;
      it.pos.lerp(it.tp, k);
      it.quat.slerp(it.tq, k);
      // uzak hareketlerde hafif kavis
      tmp.copy(it.pos);
      tmp.y += Math.min(0.06, d * 0.6);
      this.m4.compose(tmp, it.quat, this.one);
      this.mesh.setMatrixAt(it.idx, this.m4);
      moved = true;
    }
    if (moved || this.dirty) { this.mesh.instanceMatrix.needsUpdate = true; this.dirty = false; }
  }
}

// ------------------------------------------------------------------ yardımcılar
const Q = (x: number, y: number, z: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));
const hash = (n: number) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };

export interface Frame {
  toward: THREE.Vector3; // masa merkezinden oyuncuya
  right: THREE.Vector3; // oyuncunun sağı
  yaw: number; // yerel +z'nin oyuncuya bakması için
}

export interface OkeyView3D {
  hands: Tile[][]; // [0] insan oyuncunun eli (ıstaka sırasıyla); diğerleri yalnızca sayı için
  handCounts: number[];
  rackOrder: (number | null)[]; // insan ıstakasının slotları
  deckCount: number;
  deckIds: number[];
  indicator: Tile;
  ctx: OkeyCtx;
  discards: Tile[][];
  melds?: { owner: number; tiles: Tile[] }[];
}

export interface TavlaView3D {
  points: number[];
  bar: [number, number];
  off: [number, number];
  dice: number[];
}

export interface PistiView3D {
  players: number;
  hands: Card[][]; // [0] insan; diğerlerinin yalnızca sayısı kullanılır
  handCounts: number[];
  pile: Card[];
  hiddenCount: number;
  deckCount: number;
  captured: number[]; // taraf başına kart sayısı
  capturedIds: Card[][];
}

export interface TrickView3D {
  hand: Card[]; // insanın eli
  handCounts: number[];
  trick: { player: number; card: Card }[];
  /** oyuncu başına alınan el sayısı */
  won: number[];
}

/** Masa üstü 3D görünümü (bir masa oturumu için). */
export class TableView3D {
  private group: THREE.Group;
  private tiles: PieceLayer | null = null;
  private cards: PieceLayer | null = null;
  private checkers: PieceLayer | null = null;
  private statics = new THREE.Group();
  private dice: THREE.Mesh[] = [];
  private diceVals: number[] = [];
  private diceSpin = 0;
  private dieFaces: THREE.MeshToonMaterial[] = [];
  private kind: 'okey' | 'tavla' | 'pisti' | null = null;
  private players = 4;

  constructor(private seat: Seat) {
    this.group = seat.table.live;
  }

  /** Oyun içi oyuncu → masa koltuğu yönü */
  frame(player: number, players = this.players): Frame {
    const t = this.seat.table;
    const n = t.seats.length;
    const off = n === 2 ? player : players === 2 ? player * 2 : player;
    const s = t.seats[(this.seat.index + off) % n];
    const toward = new THREE.Vector3(s.pos.x - t.center.x, 0, s.pos.z - t.center.z).normalize();
    const f = toward.clone().negate();
    const right = new THREE.Vector3(-f.z, 0, f.x);
    return { toward, right, yaw: Math.atan2(toward.x, toward.z) };
  }

  clear() {
    this.tiles?.clear();
    this.cards?.clear();
    this.checkers?.clear();
    this.statics.clear();
    this.group.clear();
    this.tiles = this.cards = this.checkers = null;
    this.dice = [];
    this.kind = null;
  }

  private setup(kind: 'okey' | 'tavla' | 'pisti', players: number) {
    if (this.kind === kind && this.players === players) return;
    this.clear();
    this.kind = kind;
    this.players = players;
    this.statics = new THREE.Group();
    this.group.add(this.statics);
    if (kind === 'okey') {
      const a = getTileAtlas();
      this.tiles = new PieceLayer(pieceGeometry('tile3d', 0.034, 0.048, 0.014), atlasMaterial(a, 53, 53), 120, a);
      this.group.add(this.tiles.mesh);
      // ıstakalar
      for (let p = 0; p < players; p++) {
        const fr = this.frame(p, players);
        const rack = new THREE.Group();
        const plank = toonMesh(sharedGeo('rack3dA', () => new THREE.BoxGeometry(0.62, 0.025, 0.09)), 0xb7773d, 0.008);
        plank.position.set(0, 0.012, 0);
        const step = toonMesh(sharedGeo('rack3dB', () => new THREE.BoxGeometry(0.62, 0.035, 0.035)), 0x9a5b2e, 0.008);
        step.position.set(0, 0.03, -0.028);
        rack.add(plank, step);
        rack.position.copy(fr.toward.clone().multiplyScalar(0.355)).setY(TOP);
        rack.rotation.y = fr.yaw;
        this.statics.add(rack);
      }
    } else if (kind === 'pisti') {
      const a = getCardAtlas();
      this.cards = new PieceLayer(pieceGeometry('card3d', 0.062, 0.088, 0.0025), atlasMaterial(a, 52, 53), 80, a);
      this.group.add(this.cards.mesh);
    } else {
      this.checkers = new PieceLayer(sharedGeo('checker3d', () => new THREE.CylinderGeometry(0.019, 0.019, 0.009, 18)), new THREE.MeshToonMaterial({ color: 0xffffff }), 32, null);
      this.group.add(this.checkers.mesh);
      const fr = this.frame(0, 2);
      const board = new THREE.Group();
      board.rotation.y = fr.yaw;
      board.position.y = TOP;
      const base = toonMesh(sharedGeo('tavlaBase', () => new THREE.BoxGeometry(0.66, 0.02, 0.5)), 0x6b3a1c, 0.01);
      base.position.y = 0.01;
      board.add(base);
      const surface = new THREE.Mesh(sharedGeo('tavlaSurf', () => new THREE.PlaneGeometry(0.62, 0.46)), new THREE.MeshToonMaterial({ map: tavlaSurface() }));
      surface.rotation.x = -Math.PI / 2;
      surface.position.y = 0.0205;
      board.add(surface);
      // kenarlar
      for (const [x, z, w, d] of [[0, 0.24, 0.66, 0.02], [0, -0.24, 0.66, 0.02], [0.32, 0, 0.02, 0.5], [-0.32, 0, 0.02, 0.5], [0, 0, 0.03, 0.46]] as const) {
        const e = toonMesh(new THREE.BoxGeometry(w, 0.03, d), 0x4d2a10, 0.006);
        e.position.set(x, 0.025, z);
        board.add(e);
      }
      this.statics.add(board);
      // zarlar
      this.dieFaces = [1, 2, 3, 4, 5, 6].map((v) => new THREE.MeshToonMaterial({ map: dieTexture(v) }));
      for (let i = 0; i < 2; i++) {
        const d = new THREE.Mesh(sharedGeo('die3d', () => new THREE.BoxGeometry(0.028, 0.028, 0.028)), [0, 1, 2, 3, 4, 5].map((k) => this.dieFaces[k]));
        d.castShadow = true;
        const o = new THREE.Mesh(d.geometry, outlineMat(0.004));
        d.add(o);
        d.visible = false;
        this.dice.push(d);
        this.group.add(d);
      }
    }
  }

  // ------------------------------------------------------------------ okey / 101
  syncOkey(v: OkeyView3D) {
    this.setup('okey', 4);
    const L = this.tiles!;
    L.beginFrame();
    const cellOf = (t: Tile) => (t.fake ? 52 : t.color * 13 + (t.num - 1));
    const fr0 = this.frame(0);
    const deckBase = fr0.right.clone().multiplyScalar(-0.2).add(fr0.toward.clone().multiplyScalar(-0.16)).setY(TOP);
    const flatUp = (yaw: number) => Q(-Math.PI / 2, yaw, 0);
    const flatDown = (yaw: number) => Q(Math.PI / 2, yaw, 0);
    // deste: 5'lik kapalı yığınlar
    v.deckIds.forEach((id, i) => {
      const stack = Math.floor(i / 5), h = i % 5;
      const p = deckBase.clone().add(fr0.right.clone().multiplyScalar((stack % 6) * 0.038)).add(fr0.toward.clone().multiplyScalar(-Math.floor(stack / 6) * 0.052));
      p.y = TOP + 0.007 + h * 0.0142;
      L.place(id, p, flatDown(fr0.yaw), 53);
    });
    const spawnDeck = deckBase.clone().setY(TOP + 0.08);
    // gösterge: destenin yanında açık
    const indPos = deckBase.clone().add(fr0.right.clone().multiplyScalar(-0.05)).setY(TOP + 0.007);
    L.place(v.indicator.id, indPos, flatUp(fr0.yaw), cellOf(v.indicator));
    // eller
    for (let p = 0; p < 4; p++) {
      const fr = this.frame(p);
      const q = Q(-0.22, fr.yaw, 0);
      const slotPos = (k: number) => {
        const row = k < 16 ? 0 : 1, col = k % 16;
        return fr.toward.clone().multiplyScalar(row === 0 ? 0.33 : 0.372)
          .add(fr.right.clone().multiplyScalar((col - 7.5) * 0.037))
          .setY(TOP + (row === 0 ? 0.072 : 0.05));
      };
      if (p === 0) {
        const order = v.rackOrder.length ? v.rackOrder : v.hands[0].map((t) => t.id);
        const inHand = new Map(v.hands[0].map((t) => [t.id, t]));
        order.forEach((id, k) => { if (id !== null && inHand.has(id)) L.place(id, slotPos(k), q, cellOf(inHand.get(id)!), undefined, spawnDeck); });
        // ıstakada yeri olmayanlar
        let k = order.length;
        for (const t of v.hands[0]) if (!order.includes(t.id)) L.place(t.id, slotPos(k++ % 32), q, cellOf(t), undefined, spawnDeck);
      } else {
        // rakip: kimlik bilinmez, arkası dönük (anahtar: konum)
        const n = v.handCounts[p];
        const start = Math.max(0, Math.floor((16 - Math.min(16, n)) / 2));
        for (let k = 0; k < n; k++) L.place(`h${p}:${k}`, slotPos(k < 16 ? start + k : 16 + (k - 16)), q, 53, undefined, spawnDeck);
      }
      // atılan taşlar: oyuncunun sağında
      const dbase = fr.toward.clone().multiplyScalar(0.21).add(fr.right.clone().multiplyScalar(0.33));
      v.discards[p].forEach((t, i) => {
        const pos = dbase.clone().add(fr.toward.clone().multiplyScalar(-Math.min(i, 12) * 0.004)).setY(TOP + 0.007 + i * 0.0142 * 0.3);
        L.place(t.id, pos, Q(-Math.PI / 2, fr.yaw + (hash(t.id) - 0.5) * 0.4, 0), cellOf(t), undefined, slotPos(8));
      });
    }
    // 101 perleri: insan oyuncuya dönük satırlar
    if (v.melds) {
      let row = 0, col = 0;
      const perRow = 15;
      for (const m of v.melds) {
        if (col + m.tiles.length > perRow) { row++; col = 0; }
        m.tiles.forEach((t) => {
          const pos = fr0.toward.clone().multiplyScalar(0.12 - row * 0.05).add(fr0.right.clone().multiplyScalar((col - 6.5) * 0.034)).setY(TOP + 0.007);
          L.place(t.id, pos, flatUp(fr0.yaw), cellOf(t));
          col++;
        });
        col++;
      }
    }
    L.endFrame();
  }

  // ------------------------------------------------------------------ tavla
  private lastDice = '';
  syncTavla(v: TavlaView3D) {
    this.setup('tavla', 2);
    const L = this.checkers!;
    L.beginFrame();
    const fr = this.frame(0, 2);
    const W = 0.62, D = 0.46, bar = 0.03, margin = 0.015;
    const pw = (W - bar - 2 * margin) / 12;
    const r = 0.0185;
    const colX = (i: number) => {
      if (i <= 5) return bar / 2 + (5 - i + 0.5) * pw;
      if (i <= 11) return -bar / 2 - (i - 6 + 0.5) * pw;
      if (i <= 17) return -bar / 2 - (17 - i + 0.5) * pw;
      return bar / 2 + (i - 18 + 0.5) * pw;
    };
    const toWorld = (x: number, z: number, y: number) => fr.right.clone().multiplyScalar(x).add(fr.toward.clone().multiplyScalar(z)).setY(TOP + 0.025 + y);
    const white = new THREE.Color(0xfff6e6), black = new THREE.Color(0x2a2a2a);
    const flat = Q(0, 0, 0);
    // her oyuncunun pulları için sabit anahtarlar: oyuncu*15 + sıra
    const counters = [0, 0];
    const put = (p: number, pos: THREE.Vector3) => { const key = p * 15 + counters[p]++; L.place(key, pos, flat, undefined, p === 0 ? white : black); };
    for (let i = 0; i < 24; i++) {
      const n = Math.abs(v.points[i]);
      if (!n) continue;
      const p = v.points[i] > 0 ? 0 : 1;
      const near = i <= 11; // alt sıra oyuncuya yakın
      for (let k = 0; k < n; k++) {
        const lay = k % 5, tier = Math.floor(k / 5);
        const z = (near ? 1 : -1) * (D / 2 - r - lay * 2 * r);
        put(p, toWorld(colX(i), z, tier * 0.01));
      }
    }
    for (let p = 0; p < 2; p++) for (let k = 0; k < v.bar[p]; k++) put(p, toWorld(0, (p === 0 ? 1 : -1) * (0.04 + k * 2 * r), 0.02));
    // toplanan pullar: sağ kenarın dışında yan yatmış yığın
    for (let p = 0; p < 2; p++) for (let k = 0; k < v.off[p]; k++) put(p, toWorld(W / 2 + 0.04, (p === 0 ? 1 : -1) * (0.2 - k * 0.0105), 0.0));
    L.endFrame();
    // zarlar
    const key = v.dice.join(',');
    if (key !== this.lastDice) {
      this.lastDice = key;
      if (v.dice.length) { this.diceSpin = 0.6; this.diceVals = v.dice.slice(0, 2); }
    }
    this.dice.forEach((d, i) => {
      d.visible = v.dice.length > 0;
      if (!d.visible) return;
      (d.material as THREE.Material[])[2] = this.dieFaces[(this.diceVals[i] ?? 1) - 1];
      d.position.copy(toWorld(W / 4 + (i - 0.5) * 0.05, 0.0, 0.016));
    });
  }

  // ------------------------------------------------------------------ pişti
  syncPisti(v: PistiView3D) {
    this.setup('pisti', v.players);
    const L = this.cards!;
    L.beginFrame();
    const cellOf = (c: Card) => c.suit * 13 + (c.rank - 1);
    const fr0 = this.frame(0, v.players);
    const deckPos = fr0.right.clone().multiplyScalar(0.26).add(fr0.toward.clone().multiplyScalar(-0.05));
    const up = (yaw: number) => Q(-Math.PI / 2, yaw, 0);
    const down = (yaw: number) => Q(Math.PI / 2, yaw, 0);
    for (let k = 0; k < v.deckCount; k++) L.place(`d${k}`, deckPos.clone().setY(TOP + 0.002 + k * 0.0026), down(fr0.yaw + 0.1));
    const spawn = deckPos.clone().setY(TOP + 0.1);
    // ortadaki yığın
    v.pile.forEach((c, i) => {
      const hidden = i < v.hiddenCount;
      const pos = new THREE.Vector3((hash(c.id) - 0.5) * 0.03, TOP + 0.002 + i * 0.0026, (hash(c.id + 7) - 0.5) * 0.03);
      L.place(`c${c.id}`, pos, (hidden ? down : up)(fr0.yaw + (hash(c.id + 3) - 0.5) * 0.8), cellOf(c), undefined, spawn);
    });
    // eller
    for (let p = 0; p < v.players; p++) {
      const fr = this.frame(p, v.players);
      const n = p === 0 ? v.hands[0].length : v.handCounts[p];
      for (let k = 0; k < n; k++) {
        const pos = fr.toward.clone().multiplyScalar(0.33).add(fr.right.clone().multiplyScalar((k - (n - 1) / 2) * 0.07)).setY(TOP + 0.002);
        if (p === 0) { const c = v.hands[0][k]; L.place(`c${c.id}`, pos, up(fr.yaw), cellOf(c), undefined, spawn); }
        else L.place(`h${p}:${k}`, pos, down(fr.yaw), undefined, undefined, spawn);
      }
    }
    // toplananlar: tarafın ilk oyuncusunun sağında kapalı deste
    for (let side = 0; side < 2; side++) {
      const fr = this.frame(side, v.players);
      const base = fr.toward.clone().multiplyScalar(0.25).add(fr.right.clone().multiplyScalar(0.3));
      v.capturedIds[side].forEach((c, i) => L.place(`c${c.id}`, base.clone().setY(TOP + 0.002 + Math.min(i, 40) * 0.0012), down(fr.yaw + (hash(c.id) - 0.5) * 0.3), cellOf(c)));
    }
    L.endFrame();
  }

  /** El alma oyunları (Batak, King): eller, ortadaki el, alınan eller */
  syncTrick(v: TrickView3D) {
    this.setup('pisti', 4);
    const L = this.cards!;
    L.beginFrame();
    const cellOf = (c: Card) => c.suit * 13 + (c.rank - 1);
    const up = (yaw: number) => Q(-Math.PI / 2, yaw, 0);
    const down = (yaw: number) => Q(Math.PI / 2, yaw, 0);
    const spawn = new THREE.Vector3(0, TOP + 0.12, 0);
    for (let p = 0; p < 4; p++) {
      const fr = this.frame(p, 4);
      const n = p === 0 ? v.hand.length : v.handCounts[p];
      for (let k = 0; k < n; k++) {
        const pos = fr.toward.clone().multiplyScalar(0.33).add(fr.right.clone().multiplyScalar((k - (n - 1) / 2) * 0.045)).setY(TOP + 0.002 + k * 0.0004);
        if (p === 0) { const c = v.hand[k]; L.place(`c${c.id}`, pos, up(fr.yaw), cellOf(c), undefined, spawn); }
        else L.place(`h${p}:${k}`, pos, down(fr.yaw), undefined, undefined, spawn);
      }
      // alınan eller: oyuncunun sağında kapalı küçük deste
      const base = fr.toward.clone().multiplyScalar(0.24).add(fr.right.clone().multiplyScalar(0.3));
      for (let k = 0; k < v.won[p]; k++) L.place(`w${p}:${k}`, base.clone().setY(TOP + 0.002 + k * 0.004), down(fr.yaw + (k % 2 ? 0.08 : -0.06)));
    }
    // ortadaki el: her kart oynayanın önünde
    for (const t of v.trick) {
      const fr = this.frame(t.player, 4);
      const pos = fr.toward.clone().multiplyScalar(0.1).setY(TOP + 0.003);
      L.place(`c${t.card.id}`, pos, up(fr.yaw + (hash(t.card.id) - 0.5) * 0.3), cellOf(t.card), undefined, spawn);
    }
    L.endFrame();
  }

  update(dt: number) {
    this.tiles?.update(dt);
    this.cards?.update(dt);
    this.checkers?.update(dt);
    if (this.diceSpin > 0) {
      this.diceSpin = Math.max(0, this.diceSpin - dt);
      this.dice.forEach((d, i) => {
        if (this.diceSpin > 0) {
          d.rotation.set(this.diceSpin * 25 + i, this.diceSpin * 18, this.diceSpin * 21 + i * 2);
          d.position.y += Math.sin(this.diceSpin * 10) * 0.004;
        } else d.rotation.set(0, i * 0.4 + 0.2, 0);
      });
    }
  }
}

function tavlaSurface(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 620; c.height = 460;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e9c891';
  g.fillRect(0, 0, 620, 460);
  const bar = 30, margin = 15, pw = (620 - bar - 2 * margin) / 12;
  g.fillStyle = '#4d2a10';
  g.fillRect(310 - bar / 2, 0, bar, 460);
  for (let k = 0; k < 12; k++) {
    const x = k < 6 ? margin + k * pw : margin + k * pw + bar;
    g.fillStyle = k % 2 ? '#a3341f' : '#2f5d50';
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + pw, 0); g.lineTo(x + pw / 2, 190); g.fill();
    g.fillStyle = k % 2 ? '#2f5d50' : '#a3341f';
    g.beginPath(); g.moveTo(x, 460); g.lineTo(x + pw, 460); g.lineTo(x + pw / 2, 270); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function dieTexture(v: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = v === 1 ? '#c0392b' : '#1b1b1b';
  const P: Record<number, [number, number][]> = {
    1: [[32, 32]], 2: [[18, 18], [46, 46]], 3: [[16, 16], [32, 32], [48, 48]], 4: [[18, 18], [46, 18], [18, 46], [46, 46]],
    5: [[16, 16], [48, 16], [32, 32], [16, 48], [48, 48]], 6: [[18, 14], [46, 14], [18, 32], [46, 32], [18, 50], [46, 50]],
  };
  for (const [x, y] of P[v]) { g.beginPath(); g.arc(x, y, v === 1 ? 9 : 6, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
