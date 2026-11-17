/**
 * Zemin düzleminde (XZ) basit çarpışma: eksen hizalı kutular + daireler.
 * Ayrıca NPC'ler için ızgara tabanlı A* yol bulma.
 */
export interface Box2 { minX: number; maxX: number; minZ: number; maxZ: number; tag?: string }
export interface Circle2 { x: number; z: number; r: number; tag?: string }

export class CollisionWorld {
  boxes: Box2[] = [];
  circles: Circle2[] = [];
  bounds: Box2 = { minX: -9, maxX: 9, minZ: -7, maxZ: 7 };

  addBox(cx: number, cz: number, w: number, d: number, tag?: string) {
    this.boxes.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, tag });
  }
  addCircle(x: number, z: number, r: number, tag?: string) {
    this.circles.push({ x, z, r, tag });
  }

  /** Dairesel bir gövdeyi engellerden iterek çözer. Dinamik daireler (karakterler) ayrıca verilebilir. */
  resolve(pos: { x: number; z: number }, radius: number, dynamic: Circle2[] = []): void {
    for (let iter = 0; iter < 3; iter++) {
      for (const b of this.boxes) {
        const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
        const dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < radius * radius) {
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            pos.x += (dx / d) * (radius - d);
            pos.z += (dz / d) * (radius - d);
          } else {
            // merkez kutunun içinde: en yakın kenara it
            const pushes = [pos.x - b.minX + radius, b.maxX - pos.x + radius, pos.z - b.minZ + radius, b.maxZ - pos.z + radius];
            const i = pushes.indexOf(Math.min(...pushes));
            if (i === 0) pos.x = b.minX - radius; else if (i === 1) pos.x = b.maxX + radius;
            else if (i === 2) pos.z = b.minZ - radius; else pos.z = b.maxZ + radius;
          }
        }
      }
      for (const c of [...this.circles, ...dynamic]) {
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const min = radius + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          pos.x += (dx / d) * (min - d);
          pos.z += (dz / d) * (min - d);
        }
      }
      pos.x = Math.max(this.bounds.minX + radius, Math.min(this.bounds.maxX - radius, pos.x));
      pos.z = Math.max(this.bounds.minZ + radius, Math.min(this.bounds.maxZ - radius, pos.z));
    }
  }

  blocked(x: number, z: number, radius: number): boolean {
    if (x < this.bounds.minX + radius || x > this.bounds.maxX - radius || z < this.bounds.minZ + radius || z > this.bounds.maxZ - radius) return true;
    for (const b of this.boxes) {
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius) return true;
    }
    for (const c of this.circles) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (radius + c.r) ** 2) return true;
    return false;
  }
}

export class NavGrid {
  readonly cell: number;
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oz: number;
  readonly walk: Uint8Array;

  constructor(world: CollisionWorld, cell = 0.25, radius = 0.3) {
    this.cell = cell;
    this.ox = world.bounds.minX;
    this.oz = world.bounds.minZ;
    this.w = Math.ceil((world.bounds.maxX - world.bounds.minX) / cell);
    this.h = Math.ceil((world.bounds.maxZ - world.bounds.minZ) / cell);
    this.walk = new Uint8Array(this.w * this.h);
    for (let j = 0; j < this.h; j++)
      for (let i = 0; i < this.w; i++) {
        const { x, z } = this.toWorld(i, j);
        this.walk[j * this.w + i] = world.blocked(x, z, radius) ? 0 : 1;
      }
  }

  toWorld(i: number, j: number) {
    return { x: this.ox + (i + 0.5) * this.cell, z: this.oz + (j + 0.5) * this.cell };
  }
  toCell(x: number, z: number) {
    return { i: Math.max(0, Math.min(this.w - 1, Math.floor((x - this.ox) / this.cell))), j: Math.max(0, Math.min(this.h - 1, Math.floor((z - this.oz) / this.cell))) };
  }

  private nearestWalkable(i: number, j: number): { i: number; j: number } | null {
    if (this.walk[j * this.w + i]) return { i, j };
    for (let r = 1; r < 12; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          const a = i + di, b = j + dj;
          if (a >= 0 && b >= 0 && a < this.w && b < this.h && this.walk[b * this.w + a]) return { i: a, j: b };
        }
    return null;
  }

  /** A* yol bulma; sonuç dünya koordinatlarında sadeleştirilmiş nokta listesi. */
  findPath(sx: number, sz: number, tx: number, tz: number): { x: number; z: number }[] {
    const s0 = this.toCell(sx, sz);
    const t0 = this.toCell(tx, tz);
    const s = this.nearestWalkable(s0.i, s0.j);
    const t = this.nearestWalkable(t0.i, t0.j);
    if (!s || !t) return [{ x: tx, z: tz }];
    const W = this.w;
    const N = W * this.h;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const open: number[] = [];
    const f = new Float32Array(N).fill(Infinity);
    const start = s.j * W + s.i;
    const goal = t.j * W + t.i;
    g[start] = 0;
    f[start] = Math.hypot(t.i - s.i, t.j - s.j);
    open.push(start);
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let iterations = 0;
    while (open.length && iterations++ < 20000) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (f[open[k]] < f[open[bi]]) bi = k;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const ci = cur % W, cj = (cur / W) | 0;
      for (const [di, dj, cost] of dirs) {
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= this.h) continue;
        const n = nj * W + ni;
        if (!this.walk[n] || closed[n]) continue;
        if (di && dj && (!this.walk[cj * W + ni] || !this.walk[nj * W + ci])) continue;
        const ng = g[cur] + cost;
        if (ng < g[n]) {
          g[n] = ng;
          came[n] = cur;
          f[n] = ng + Math.hypot(t.i - ni, t.j - nj);
          open.push(n);
        }
      }
    }
    if (came[goal] < 0 && goal !== start) return [{ x: tx, z: tz }];
    const cells: number[] = [];
    for (let c = goal; c !== -1; c = came[c]) { cells.push(c); if (c === start) break; }
    cells.reverse();
    const pts = cells.map((c) => this.toWorld(c % W, (c / W) | 0));
    // sadeleştirme: görüş hattı kontrolü
    const out: { x: number; z: number }[] = [];
    let anchor = { x: sx, z: sz };
    for (let k = 1; k < pts.length; k++) {
      if (!this.lineWalkable(anchor.x, anchor.z, pts[k].x, pts[k].z)) {
        out.push(pts[k - 1]);
        anchor = pts[k - 1];
      }
    }
    out.push({ x: tx, z: tz });
    return out;
  }

  lineWalkable(ax: number, az: number, bx: number, bz: number): boolean {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(d / (this.cell * 0.5));
    for (let k = 0; k <= steps; k++) {
      const x = ax + ((bx - ax) * k) / steps, z = az + ((bz - az) * k) / steps;
      const c = this.toCell(x, z);
      if (!this.walk[c.j * this.w + c.i]) return false;
    }
    return true;
  }
}
