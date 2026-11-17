/** Okey taşı görünümü + sürükle-bırak destekli ıstaka (Klasik Okey ve 101 ortak). */
import { Tile, OkeyCtx, isJoker, COLOR_CSS, toCounts, bestPartition, candidatesToTiles, sortTiles, identity, MeldRules } from '../../games/common/tiles';
import { h } from '../dom';

export function tileEl(t: Tile, ctx: OkeyCtx | null, opts: { small?: boolean; back?: boolean } = {}): HTMLDivElement {
  const el = h('div', `tile${opts.small ? ' small' : ''}${opts.back ? ' back' : ''}`);
  el.dataset.id = String(t.id);
  if (opts.back) return el;
  if (t.fake) {
    el.innerHTML = `<span class="num" style="color:#2f7d32">✿</span><span class="sub">sahte</span>`;
  } else {
    el.innerHTML = `<span class="num" style="color:${COLOR_CSS[t.color]}">${t.num}</span><span class="dot" style="background:${COLOR_CSS[t.color]}"></span>`;
  }
  if (ctx && isJoker(t, ctx)) el.classList.add('joker');
  return el;
}

export const RACK_SLOTS = 32; // 2 sıra × 16

/**
 * Istaka: slot tabanlı taş düzeni. Taşlar slotlar arasında sürüklenebilir,
 * belirlenen bırakma hedeflerine (ör. atış alanı) bırakılabilir.
 */
export class Rack {
  readonly el: HTMLDivElement;
  slots: (number | null)[] = Array(RACK_SLOTS).fill(null);
  selected = new Set<number>();
  multiSelect = false;
  highlight: number | null = null;
  disabledIds = new Set<number>();
  private tiles = new Map<number, Tile>();
  private ctx: OkeyCtx = { okeyColor: 0, okeyNum: 1 };
  private drag: { id: number; ghost: HTMLElement; startX: number; startY: number; moved: boolean; fromEl: HTMLElement } | null = null;
  dropTargets: { el: HTMLElement; onDrop: (id: number) => void; accept?: (id: number) => boolean }[] = [];
  onSelect: () => void = () => {};
  onChange: () => void = () => {};

  constructor() {
    this.el = h('div', 'rack');
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
  }

  /** Eldeki taşlarla senkronize et: yeni taşları boş slotlara koy, olmayanları kaldır. */
  sync(hand: Tile[], ctx: OkeyCtx) {
    this.ctx = ctx;
    const ids = new Set(hand.map((t) => t.id));
    this.tiles = new Map(hand.map((t) => [t.id, t]));
    this.slots = this.slots.map((s) => (s !== null && ids.has(s) ? s : null));
    for (const id of [...this.selected]) if (!ids.has(id)) this.selected.delete(id);
    const placed = new Set(this.slots.filter((s) => s !== null));
    for (const t of hand) {
      if (placed.has(t.id)) continue;
      const free = this.slots.indexOf(null);
      if (free >= 0) this.slots[free] = t.id;
    }
    this.render();
  }

  ordered(): Tile[] {
    return this.slots.filter((s): s is number => s !== null).map((id) => this.tiles.get(id)!);
  }

  /** Perlere göre diz (en çok taş içeren bölümleme), aralarda boşluk bırak. */
  arrangeMelds(rules: MeldRules) {
    const hand = [...this.tiles.values()];
    const { counts, jokers } = toCounts(hand, this.ctx);
    const part = bestPartition(counts, jokers, rules, (m) => (m.concrete.length + m.jokers) * 100 + m.value);
    const groups = candidatesToTiles(part.melds, hand, this.ctx);
    const used = new Set(groups.flat().map((t) => t.id));
    const rest = sortTiles(hand.filter((t) => !used.has(t.id)), this.ctx);
    this.layoutGroups(groups, rest);
  }

  arrangePairs() {
    const hand = [...this.tiles.values()];
    const jokers = hand.filter((t) => isJoker(t, this.ctx));
    const byKey = new Map<string, Tile[]>();
    for (const t of hand) {
      if (isJoker(t, this.ctx)) continue;
      const id = identity(t, this.ctx);
      const k = `${id.color}-${id.num}`;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(t);
    }
    const pairs: Tile[][] = [];
    const singles: Tile[] = [];
    for (const arr of byKey.values()) {
      while (arr.length >= 2) pairs.push(arr.splice(0, 2));
      singles.push(...arr);
    }
    for (const j of jokers) { const s = singles.shift(); pairs.push(s ? [s, j] : [j]); }
    this.layoutGroups(pairs, sortTiles(singles, this.ctx));
  }

  arrangeSorted() {
    this.layoutGroups([], sortTiles([...this.tiles.values()], this.ctx));
  }

  private layoutGroups(groups: Tile[][], rest: Tile[]) {
    const slots: (number | null)[] = Array(RACK_SLOTS).fill(null);
    let i = 0;
    const row = (k: number) => Math.floor(k / 16);
    for (const g of groups) {
      // grubun satıra sığmasını sağla
      if (row(i) !== row(i + g.length - 1) && i % 16 !== 0) i = (row(i) + 1) * 16;
      for (const t of g) slots[i++] = t.id;
      i++; // boşluk
    }
    if (i < 16 && rest.length > 16 - i) i = 16;
    for (const t of rest) {
      while (i < RACK_SLOTS && slots[i] !== null) i++;
      if (i >= RACK_SLOTS) { const f = slots.indexOf(null); slots[f] = t.id; continue; }
      slots[i++] = t.id;
    }
    this.slots = slots;
    this.render();
    this.onChange();
  }

  render() {
    this.el.innerHTML = '';
    for (let r = 0; r < 2; r++) {
      const rowEl = h('div', 'rack-row');
      for (let k = r * 16; k < r * 16 + 16; k++) {
        const slot = h('div', 'slot');
        slot.dataset.slot = String(k);
        const id = this.slots[k];
        if (id !== null) {
          const t = this.tiles.get(id);
          if (t) {
            const te = tileEl(t, this.ctx);
            if (this.selected.has(id)) te.classList.add('selected');
            if (this.highlight === id) te.classList.add('new');
            if (this.disabledIds.has(id)) te.classList.add('staged');
            te.addEventListener('pointerdown', (e) => this.onDown(e, id, te));
            slot.appendChild(te);
          }
        }
        rowEl.appendChild(slot);
      }
      this.el.appendChild(rowEl);
    }
  }

  private onDown(e: PointerEvent, id: number, el: HTMLElement) {
    if (this.disabledIds.has(id)) return;
    e.preventDefault();
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.classList.add('ghost');
    ghost.style.display = 'none';
    document.body.appendChild(ghost);
    this.drag = { id, ghost, startX: e.clientX, startY: e.clientY, moved: false, fromEl: el };
  }

  private onMove(e: PointerEvent) {
    const d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 8) {
      d.moved = true;
      d.ghost.style.display = 'flex';
      d.fromEl.classList.add('dragging');
    }
    if (d.moved) {
      d.ghost.style.left = `${e.clientX}px`;
      d.ghost.style.top = `${e.clientY}px`;
      for (const t of this.dropTargets) t.el.classList.toggle('drop-hover', inside(t.el, e) && (!t.accept || t.accept(d.id)));
    }
  }

  private onUp(e: PointerEvent) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    d.ghost.remove();
    d.fromEl.classList.remove('dragging');
    for (const t of this.dropTargets) t.el.classList.remove('drop-hover');
    if (!d.moved) {
      // tıklama: seçim
      if (this.multiSelect) { if (this.selected.has(d.id)) this.selected.delete(d.id); else this.selected.add(d.id); }
      else { const had = this.selected.has(d.id); this.selected.clear(); if (!had) this.selected.add(d.id); }
      this.render();
      this.onSelect();
      return;
    }
    for (const t of this.dropTargets) {
      if (inside(t.el, e) && (!t.accept || t.accept(d.id))) { t.onDrop(d.id); return; }
    }
    // slot üstüne bırakma
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const slotEl = el?.closest('.slot') as HTMLElement | null;
    if (slotEl && this.el.contains(slotEl)) {
      const to = Number(slotEl.dataset.slot);
      const from = this.slots.indexOf(d.id);
      if (from >= 0 && to !== from) {
        const other = this.slots[to];
        if (other === null) { this.slots[to] = d.id; this.slots[from] = null; }
        else {
          // kaydırarak ekle: hedef satırda boşluğa doğru kaydır
          this.slots[from] = null;
          if (!this.shiftInsert(to, d.id)) { this.slots[from] = other; this.slots[to] = d.id; }
        }
        this.render();
        this.onChange();
      }
    }
  }

  private shiftInsert(to: number, id: number): boolean {
    const rowStart = Math.floor(to / 16) * 16, rowEnd = rowStart + 15;
    // sağda boşluk ara
    for (let k = to + 1; k <= rowEnd; k++) if (this.slots[k] === null) {
      for (let m = k; m > to; m--) this.slots[m] = this.slots[m - 1];
      this.slots[to] = id;
      return true;
    }
    for (let k = to - 1; k >= rowStart; k--) if (this.slots[k] === null) {
      for (let m = k; m < to; m++) this.slots[m] = this.slots[m + 1];
      this.slots[to] = id;
      return true;
    }
    return false;
  }
}

function inside(el: HTMLElement, e: PointerEvent) {
  const r = el.getBoundingClientRect();
  return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
}
