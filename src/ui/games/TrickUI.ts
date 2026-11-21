/**
 * El alma oyunlarının (Batak, King) ortak masa arayüzü: yeşil çuha masa, herkes kendi kenarında,
 * ortaya oynanan kart oynayanın önüne düşer; el bitince kısa süre kimin aldığı görünür.
 * Alt sınıflar yalnızca oyuna özgü kısımları (ihale/sözleşme paneli, plaka bilgisi, bot adımı, el sonu) yazar.
 */
import { Card, Play, Suit, SUIT_SYMBOL } from '../../games/trick/trick';
import type { GameHost, GameUI } from '../../tables/TableSession';
import { h, btn, later } from '../dom';
import { cardEl } from './PistiUI';

const POS = ['bottom', 'right', 'top', 'left'] as const;
export const SUIT_TR = ['Maça', 'Kupa', 'Karo', 'Sinek'];
export const suitHtml = (s: Suit) => `<span class="suit ${s === 1 || s === 2 ? 'red' : 'black'}">${SUIT_SYMBOL[s]}</span>`;

export interface TrickSnapshot {
  hands: Card[][];
  current: number;
  trick: Play[];
  lastTrick: Play[] | null;
  lastWinner: number | null;
  tricksWon: number[];
  /** insan şu an kart oynayabilir mi */
  humanPlays: boolean;
  legal: Card[];
}

export abstract class TrickUI implements GameUI {
  readonly el: HTMLDivElement;
  protected alive = true;
  protected timer = 0;
  protected table: HTMLDivElement;
  protected handEl: HTMLDivElement;
  protected status: HTMLDivElement;
  protected btns: HTMLDivElement;
  protected panel: HTMLDivElement;
  protected info: HTMLDivElement;
  /** son el gösterimi (oynanan dört kart bir süre ortada kalır) */
  private showLastUntil = 0;
  private busy = false;
  /** el sonu tablosu bu el için gösterildi mi (iki kez açılmasın) */
  private endShown = false;

  constructor(protected host: GameHost, cls: string) {
    this.el = h('div', `gui trick ${cls}`);
    this.table = h('div', 'ptable trick-table');
    this.info = h('div', 'pinfo');
    this.panel = h('div', 'tpanel');
    this.status = h('div', 'status');
    this.handEl = h('div', 'phand');
    this.btns = h('div', 'gbtns');
    const dock = h('div', 'odock');
    const side = h('div', 'oside');
    side.append(this.status, this.btns);
    dock.append(this.handEl, side);
    this.el.append(this.table, dock);
  }

  destroy() { this.alive = false; clearTimeout(this.timer); this.el.remove(); }

  /** Test kancası: durum dışarıdan değiştirildikten sonra yeniden çiz ve döngüyü sürdür */
  refresh() { this.showLastUntil = 0; this.render(); this.pump(); }

  // ------------------------------------------------------------ alt sınıfların dolduracağı kısımlar
  protected abstract snap(): TrickSnapshot;
  /** Plakadaki kısa bilgi (ihale, alınan el, ceza...) */
  protected abstract seatMeta(p: number): string;
  /** Ortadaki bilgi (koz, sözleşme) */
  protected abstract centerInfo(): string;
  /** Köşedeki skor tabelası */
  protected abstract scoreBoard(): string;
  /** İnsan için ihale/sözleşme/koz paneli (yoksa null) */
  protected abstract humanPanel(): HTMLElement | null;
  protected abstract statusText(): string;
  /** Sırası gelen bot için bir adım; sonunda after() çağrılmalı (tam bir kez) */
  protected abstract botStep(p: number): void;
  /** Bot sırası mı (ihale/seçim dahil) */
  protected abstract botToAct(): number | null;
  protected abstract humanPlay(cardId: number): void;
  protected abstract handOver(): boolean;
  protected abstract onHandEnd(): void;

  // ------------------------------------------------------------ döngü
  protected pump() {
    if (!this.alive || this.busy) return;
    if (this.handOver()) return;
    const p = this.botToAct();
    if (p === null) return;
    if (this.host.paused) { clearTimeout(this.timer); this.timer = later(() => this.pump(), 600); return; }
    clearTimeout(this.timer);
    const wait = Math.max(0, this.showLastUntil - performance.now());
    this.timer = later(() => {
      if (!this.alive || this.botToAct() !== p) { this.pump(); return; }
      this.botStep(p); // botStep kendi sonunda after() çağırır
    }, 650 + Math.random() * 400 + wait);
  }

  /** Her hamleden sonra: el bittiyse son eli göster, yeniden çiz, sıradakine geç */
  protected after(trickDone = false) {
    if (trickDone) this.showLastUntil = performance.now() + 1000;
    this.render();
    if (this.handOver()) {
      if (this.endShown) return;
      this.endShown = true;
      this.busy = true;
      this.timer = later(() => { this.busy = false; this.render(); this.onHandEnd(); }, 1100);
      return;
    }
    this.endShown = false;
    if (trickDone) { this.busy = true; this.timer = later(() => { this.busy = false; this.render(); this.pump(); }, 1000); return; }
    this.pump();
  }

  protected sync3d() {
    const s = this.snap();
    const showLast = !s.trick.length && s.lastTrick && performance.now() < this.showLastUntil;
    this.host.table3d.syncTrick({ hand: s.hands[0], handCounts: s.hands.map((x) => x.length), trick: showLast ? s.lastTrick! : s.trick, won: s.tricksWon });
  }

  // ------------------------------------------------------------ çizim
  protected render() {
    this.sync3d();
    const s = this.snap();
    const n = this.host.names;
    const showLast = !s.trick.length && s.lastTrick && performance.now() < this.showLastUntil;
    const trick = showLast ? s.lastTrick! : s.trick;
    this.table.innerHTML = '';
    this.info.innerHTML = this.scoreBoard();
    this.table.appendChild(this.info);
    for (let p = 0; p < 4; p++) {
      const z = h('div', `pseat ${POS[p]}${s.current === p && !this.handOver() ? ' turn' : ''}${showLast && s.lastWinner === p ? ' took' : ''}`);
      const who = h('div', 'pwho');
      const plate = h('div', `oplate${s.current === p && !this.handOver() ? ' turn' : ''}`);
      plate.innerHTML = `<span class="nm">${p === 0 ? 'Sen' : n[p]}</span>${p !== 0 ? `<span class="cnt" title="Eldeki kart">${s.hands[p].length}</span>` : ''}<span class="meta">${this.seatMeta(p)}</span>`;
      who.appendChild(plate);
      if (p !== 0) {
        const backs = h('div', 'backs');
        for (let k = 0; k < Math.min(s.hands[p].length, 13); k++) backs.appendChild(cardEl(null, { back: true, small: true }));
        who.appendChild(backs);
      }
      z.appendChild(who);
      // aldığı eller
      const won = h('div', 'pcap');
      const st = h('div', 'pcap-stack');
      const k = Math.min(4, s.tricksWon[p]);
      for (let i = 0; i < k; i++) { const ce = cardEl(null, { back: true, small: true }); ce.style.setProperty('--i', String(i)); st.appendChild(ce); }
      if (!k) st.appendChild(h('div', 'empty'));
      won.append(st, h('div', 'pl', `${s.tricksWon[p]} el`));
      z.appendChild(won);
      this.table.appendChild(z);
    }
    // orta: her kart oynayanın önünde
    const c = h('div', 'tcenter');
    for (let p = 0; p < 4; p++) {
      const slot = h('div', `tslot ${POS[p]}`);
      const play = trick.find((t) => t.player === p);
      if (play) { const ce = cardEl(play.card); if (showLast && s.lastWinner === p) ce.classList.add('winner'); slot.appendChild(ce); }
      c.appendChild(slot);
    }
    c.appendChild(h('div', 'tinfo', showLast && s.lastWinner !== null ? `<b>${s.lastWinner === 0 ? 'Sen' : n[s.lastWinner]}</b> aldı` : this.centerInfo()));
    this.table.appendChild(c);
    // panel (ihale / sözleşme / koz)
    const pan = this.humanPanel();
    if (pan) { this.panel.innerHTML = ''; this.panel.appendChild(pan); this.table.appendChild(this.panel); }
    // el
    this.handEl.innerHTML = '';
    const legal = new Set(s.legal.map((x) => x.id));
    for (const card of s.hands[0]) {
      const ce = cardEl(card);
      if (s.humanPlays) ce.classList.add(legal.has(card.id) ? 'playable' : 'blocked');
      ce.addEventListener('click', () => {
        if (!this.snap().humanPlays || this.busy) return;
        if (!legal.has(card.id)) { this.host.toast(this.blockedReason()); return; }
        this.humanPlay(card.id);
      });
      this.handEl.appendChild(ce);
    }
    this.status.innerHTML = this.statusText();
    this.btns.innerHTML = '';
    this.btns.appendChild(btn('Kalk', 'ghost small', () => this.host.exit()));
  }

  protected blockedReason() { return 'Bu kart şimdi oynanamaz.'; }

  protected splash(text: string) {
    const d = h('div', 'splash', text);
    this.el.appendChild(d);
    setTimeout(() => d.remove(), 1600);
  }
}
