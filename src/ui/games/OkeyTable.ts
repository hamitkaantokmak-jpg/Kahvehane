/**
 * Masaya odaklı okey görünümü (Klasik Okey ve 101 ortak). Yalnızca çizim: kural motoruna dokunmaz.
 *
 * Yukarıdan bakılan yeşil çuha bir masa. Her oyuncu kendi kenarında oturur:
 *   0 = sen (alt) · 1 = sağ · 2 = karşı (üst) · 3 = sol. Sıra 0 → 1 → 2 → 3 (sağdan).
 * Herkes açtığı perleri KENDİ ÖNÜNE koyar. Atılan taşlar, gerçek masadaki gibi oyuncunun sağındaki
 * köşede durur (sonraki oyuncu oradan alır): 0 → sağ alt, 1 → sağ üst, 2 → sol üst, 3 → sol alt.
 * Ortada deste ve gösterge. Dar ekranda yan kenarlar küçük çizilir; dokununca büyük görünüm açılır.
 */
import { Tile, OkeyCtx, COLOR_CSS } from '../../games/common/tiles';
import { h, btn } from '../dom';
import { tileEl } from './TileView';

export interface SeatView {
  name: string;
  /** Eldeki taş sayısı */
  count: number;
  /** Plakadaki kısa bilgi (HTML) — ör. "20 puan" ya da "açtı · 34" */
  meta: string;
  turn: boolean;
  /** 101: açtı mı (plakada yeşil işaret) */
  opened?: boolean;
}

export interface MeldView { id: number; owner: number; tiles: Tile[]; kind: string }
export interface StagedView { tiles: Tile[]; onRemove: () => void }

export interface OkeyTableModel {
  seats: SeatView[];
  discards: Tile[][];
  ctx: OkeyCtx;
  indicator: Tile;
  deckCount: number;
  /** Desteden çekilebilir mi (parlar) */
  canDrawDeck: boolean;
  /** Soldaki (3) oyuncunun attığı taş alınabilir mi */
  canDrawLeft: boolean;
  /** Atma alanı aktif mi */
  canDrop: boolean;
  /** Klasik okeyde ortada "Okey: 5" bilgisi */
  showOkeyInfo: boolean;
  /** 101: masadaki perler (yoksa kenarlar yalnızca plaka) */
  melds?: MeldView[];
  /** 101: seçili taş bu pere işlenebilir mi (parlar) */
  meldTarget?: (m: MeldView) => boolean;
  /** 101: hazırlanan (henüz açılmamış) perler, kendi önünde kesik çizgili */
  staged?: StagedView[];
  /** 101: hazırlanan perlerin özeti (HTML), ör. "78/101" */
  stagedSum?: { html: string; ok: boolean } | null;
  /** Hiç per yokken kendi önünde gösterilecek ipucu */
  emptyHint?: string;
}

export interface OkeyTableHandlers {
  onDeck: () => void;
  onLeft: () => void;
  onMeld?: (meldId: number) => void;
}

const SIDE = ['bottom', 'right', 'top', 'left'] as const;
/** Atılan taş köşeleri (oyuncunun sağı) */
const PILE_CORNER = ['br', 'tr', 'tl', 'bl'] as const;

export class OkeyTable {
  readonly el: HTMLDivElement;
  /** Kendi atma alanın (ıstakadan sürükle-bırak hedefi) */
  readonly myPile: HTMLDivElement;
  private zones: HTMLDivElement[] = [];
  private piles: HTMLDivElement[] = [];
  private center: HTMLDivElement;
  private zoom: HTMLDivElement | null = null;
  private zoomSeat: number | null = null;
  private last: OkeyTableModel | null = null;

  constructor(private handlers: OkeyTableHandlers) {
    this.el = h('div', 'otable');
    const felt = h('div', 'felt');
    for (let i = 0; i < 4; i++) {
      const z = h('div', `ozone ${SIDE[i]}`);
      z.dataset.seat = String(i);
      // yan/üst kenara dokununca (taş seçili değilken) büyük görünüm
      if (i !== 0) z.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.meld.target')) return;
        this.openZoom(i);
      });
      this.zones.push(z);
      const p = h('div', `opile ${PILE_CORNER[i]}${i === 0 ? ' p-mine drop' : ''}`);
      p.dataset.seat = String(i);
      this.piles.push(p);
    }
    this.myPile = this.piles[0];
    this.piles[3].addEventListener('click', () => this.handlers.onLeft());
    this.center = h('div', 'ocenter');
    felt.append(...this.piles, ...this.zones, this.center);
    this.el.appendChild(felt);
  }

  render(m: OkeyTableModel) {
    this.last = m;
    const has101 = !!m.melds;
    this.el.classList.toggle('has-melds', has101);
    for (let i = 0; i < 4; i++) this.renderZone(i, m);
    for (let i = 0; i < 4; i++) this.renderPile(i, m);
    this.renderCenter(m);
    if (this.zoomSeat !== null) this.fillZoom(this.zoomSeat);
  }

  private plate(i: number, seat: SeatView) {
    const p = h('div', `oplate${seat.turn ? ' turn' : ''}${seat.opened ? ' opened' : ''}`);
    p.innerHTML = `<span class="nm">${seat.name}</span><span class="cnt" title="Eldeki taş">${seat.count}</span><span class="meta">${seat.meta}</span>`;
    p.dataset.seat = String(i);
    return p;
  }

  private meldEl(md: MeldView, m: OkeyTableModel, big = false) {
    const target = !!m.meldTarget?.(md);
    const d = h('div', `meld ${md.kind}${target ? ' target' : ''}`);
    d.dataset.meld = String(md.id);
    d.dataset.owner = String(md.owner);
    for (const t of md.tiles) d.appendChild(tileEl(t, m.ctx, { small: true }));
    d.addEventListener('click', (e) => {
      if (!this.handlers.onMeld) return;
      // yan kenarda, taş seçili değilken tıklama büyük görünümü açsın
      if (!target && !big && md.owner !== 0) return;
      e.stopPropagation();
      this.handlers.onMeld(md.id);
    });
    return d;
  }

  private renderZone(i: number, m: OkeyTableModel) {
    const z = this.zones[i];
    const seat = m.seats[i];
    z.classList.toggle('turn', seat.turn);
    z.innerHTML = '';
    if (i !== 0) z.appendChild(this.plate(i, seat));
    const melds = (m.melds ?? []).filter((x) => x.owner === i);
    const list = h('div', 'omelds');
    for (const md of melds) list.appendChild(this.meldEl(md, m));
    if (i === 0) {
      for (const st of m.staged ?? []) {
        const gd = h('div', 'meld staged');
        for (const t of st.tiles) gd.appendChild(tileEl(t, m.ctx, { small: true }));
        gd.appendChild(btn('✕', 'x', () => st.onRemove()));
        list.appendChild(gd);
      }
      if (m.stagedSum) list.appendChild(h('div', `stage-sum${m.stagedSum.ok ? ' ok' : ''}`, m.stagedSum.html));
      if (!list.childElementCount && m.melds && m.emptyHint) list.appendChild(h('div', 'ohint', m.emptyHint));
    }
    if (m.melds && i !== 0 && melds.length) z.dataset.n = String(melds.length);
    else delete z.dataset.n;
    z.appendChild(list);
    if (i === 0) z.appendChild(this.plate(0, seat));
  }

  private renderPile(i: number, m: OkeyTableModel) {
    const p = this.piles[i];
    const pile = m.discards[i];
    const clickable = i === 3 && m.canDrawLeft;
    p.className = `opile ${PILE_CORNER[i]}${i === 0 ? ' p-mine drop' : ''}${clickable ? ' clickable glow' : ''}${i === 0 && m.canDrop ? ' armed' : ''}`;
    p.innerHTML = '';
    const stack = h('div', 'ostack');
    // son üç taş hafif kaymış yığın gibi
    const shown = pile.slice(-3);
    if (!shown.length) stack.appendChild(h('div', 'empty', i === 0 ? 'At' : ''));
    shown.forEach((t, k) => {
      const el = tileEl(t, m.ctx, { small: true });
      el.style.setProperty('--k', String(shown.length - 1 - k));
      if (k < shown.length - 1) el.classList.add('under');
      stack.appendChild(el);
    });
    p.appendChild(stack);
    p.appendChild(h('div', 'pl', i === 0 ? (m.canDrop ? 'Buraya at' : `${pile.length}`) : i === 3 ? (clickable ? 'Al' : `${pile.length}`) : `${pile.length}`));
  }

  private renderCenter(m: OkeyTableModel) {
    const c = this.center;
    c.innerHTML = '';
    const deck = h('div', `deck${m.canDrawDeck ? ' clickable glow' : ''}`);
    deck.innerHTML = `<div class="tile back"></div><div class="cnt">${m.deckCount}</div><div class="pl">Deste</div>`;
    deck.addEventListener('click', () => this.handlers.onDeck());
    const ind = h('div', 'indicator');
    ind.appendChild(tileEl(m.indicator, null));
    ind.appendChild(h('div', 'pl', 'Gösterge'));
    c.append(deck, ind);
    if (m.showOkeyInfo) c.appendChild(h('div', 'okeyinfo', `Okey: <b style="color:${COLOR_CSS[m.ctx.okeyColor]}">${m.ctx.okeyNum}</b>`));
  }

  // ------------------------------------------------------------ büyük görünüm (dar ekran)
  private openZoom(i: number) {
    if (!this.last?.melds) return;
    if (!this.last.melds.some((x) => x.owner === i)) return;
    this.zoomSeat = i;
    this.fillZoom(i);
  }

  closeZoom() { this.zoom?.remove(); this.zoom = null; this.zoomSeat = null; }

  private fillZoom(i: number) {
    const m = this.last!;
    if (!this.zoom) {
      this.zoom = h('div', 'ozoom');
      this.zoom.addEventListener('click', (e) => { if (e.target === this.zoom) this.closeZoom(); });
      this.el.appendChild(this.zoom);
    }
    this.zoom.innerHTML = '';
    const panel = h('div', 'ozoom-panel');
    const head = h('div', 'ozoom-head');
    head.appendChild(this.plate(i, m.seats[i]));
    head.appendChild(btn('✕', 'x', () => this.closeZoom()));
    panel.appendChild(head);
    const list = h('div', 'omelds');
    for (const md of (m.melds ?? []).filter((x) => x.owner === i)) list.appendChild(this.meldEl(md, m, true));
    panel.appendChild(list);
    panel.appendChild(h('div', 'muted', 'Istakadan tek taş seçip bir pere dokunarak işleyebilirsin.'));
    this.zoom.appendChild(panel);
  }
}
