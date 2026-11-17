/** Dart arayüzü: nişan (fare/dokunma tahta üzerinde), basılı tut → güç çubuğu gidip gelir, bırak → atış. */
import * as D from '../../games/dart/dart';
import { botThrow, DART_SKILLS, DEFAULT_SKILL } from '../../games/dart/dartBot';
import type { Rng } from '../../games/common/rng';
import { h, btn, later } from '../dom';
import type { SfxName } from '../../audio/Sfx';
import type { ReactKind } from '../../tables/TableSession';

export interface DartHost {
  readonly names: string[];
  readonly ids: string[];
  readonly paused: boolean;
  readonly rng: Rng;
  isHuman(i: number): boolean;
  react(i: number, kind: ReactKind, line?: string): void;
  sfx(name: SfxName): void;
  toast(msg: string): void;
  /** Ekran noktası → tahta koordinatı (tahta yarıçapı = 1) ya da null */
  boardFromScreen(x: number, y: number): { x: number; y: number } | null;
  /** Oku fırlat; saplanınca cb */
  launchDart(player: number, point: { x: number; y: number }, onLand: () => void): void;
  clearDarts(): void;
  /** Çay içmiş oyuncunun nişan titremesi (0 = yok) */
  wobble(): number;
  /** Nişangahı 3D tahtada göster (null = gizle) */
  showAim(p: { x: number; y: number } | null): void;
  matchFinished(winnerSide: number): void;
  exit(): void;
}

export class DartUI {
  readonly el: HTMLDivElement;
  s: D.DartState;
  private alive = true;
  private timer = 0;
  private board: HTMLDivElement;
  private status: HTMLDivElement;
  private powerEl: HTMLDivElement;
  private log: HTMLDivElement;
  private btns: HTMLDivElement;
  private aim: { x: number; y: number } = { x: 0, y: 0.6 };
  private charging = false;
  private power = 0;
  private powerDir = 1;
  flying = false;
  private onDown = (e: PointerEvent) => this.pointerDown(e);
  private onMove = (e: PointerEvent) => this.pointerMove(e);
  private onUp = () => this.pointerUp();

  constructor(private host: DartHost, opts: D.DartOptions) {
    this.s = D.newDart(opts);
    this.el = h('div', 'gui dart');
    this.board = h('div', 'dart-score');
    this.log = h('div', 'dart-log');
    this.powerEl = h('div', 'dart-power', '<div class="fill"></div><span>Güç</span>');
    this.status = h('div', 'status');
    this.btns = h('div', 'gbtns');
    this.el.append(this.board, this.log, this.powerEl, this.status, this.btns);
    // atış alanı: tüm ekran (arayüz öğeleri hariç)
    window.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    this.render();
    this.pump();
  }

  destroy() {
    this.alive = false;
    clearTimeout(this.timer);
    window.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    this.host.showAim(null);
    this.el.remove();
  }

  private get myTurn() { return this.s.winner === null && this.host.isHuman(this.s.current) && !this.flying; }

  private isUi(e: PointerEvent) {
    const t = e.target as HTMLElement;
    return !!t.closest('button, .modal, .dart-score, .gbtns, .select-panel');
  }

  private pointerMove(e: PointerEvent) {
    if (!this.myTurn) return;
    const p = this.host.boardFromScreen(e.clientX, e.clientY);
    if (p) { this.aim = p; this.host.showAim(this.aim); }
  }
  private pointerDown(e: PointerEvent) {
    if (!this.myTurn || this.isUi(e)) return;
    const p = this.host.boardFromScreen(e.clientX, e.clientY);
    if (p) this.aim = p;
    this.charging = true;
    this.power = 0;
    this.powerDir = 1;
  }
  private pointerUp() {
    if (!this.charging) return;
    this.charging = false;
    this.throwHuman(this.power);
  }

  /** Test kancası: belirli nişan + güçle at */
  throwHuman(power: number, aim = this.aim) {
    if (!this.myTurn) return;
    const wob = this.host.wobble();
    const pt = D.throwOutcome(aim, power, wob, this.host.rng, 0.045);
    this.fire(this.s.current, pt);
  }

  fire(p: number, pt: { x: number; y: number }) {
    this.flying = true;
    this.host.sfx('whoosh');
    this.host.showAim(null);
    this.host.launchDart(p, pt, () => {
      if (!this.alive) return;
      const hit = D.scoreAt(pt.x, pt.y);
      const turnBefore = this.s.current;
      const r = D.throwDart(this.s, hit);
      this.flying = false;
      this.host.sfx(hit.offBoard ? 'slap' : 'tile');
      this.feedback(turnBefore, r, pt);
      this.render();
      if (this.s.winner !== null) { later(() => this.onEnd(), 900); return; }
      if (r.turnEnded) { this.timer = later(() => { this.host.clearDarts(); this.render(); this.pump(); }, 1100); return; }
      this.pump();
    });
  }

  private feedback(p: number, r: D.ThrowResult, pt: { x: number; y: number }) {
    const name = this.host.names[p];
    let msg = `${name}: ${r.hit.label}`;
    if (r.bust) { msg += ' — BUST! Tur geçersiz.'; this.host.react(p, 'angry', 'Olmaz böyle şey!'); }
    else if (r.checkout) msg += ' — BİTİRDİ! 🎯';
    else if (r.hit.score >= 50) this.host.react(p, 'goodMove');
    if (r.hit.offBoard && Math.hypot(pt.x, pt.y) > 1.3) { msg += ' (duvara saplandı!)'; this.host.react(p, 'surprise', 'Duvar da tahta sayılır mı?'); }
    const row = h('div', 'dl', msg);
    this.log.prepend(row);
    while (this.log.children.length > 5) this.log.lastChild!.remove();
  }

  private pump() {
    if (!this.alive || this.s.winner !== null || this.flying) return;
    const p = this.s.current;
    if (this.host.isHuman(p)) { this.render(); return; }
    if (this.host.paused) { this.timer = later(() => this.pump(), 600); return; }
    clearTimeout(this.timer);
    this.timer = later(() => {
      if (!this.alive || this.s.current !== p || this.flying) return;
      const skill = DART_SKILLS[this.host.ids[p]] ?? DEFAULT_SKILL;
      const t = botThrow(D.viewDart(this.s, p), skill, this.host.rng);
      this.fire(p, t.point);
    }, 900 + this.host.rng() * 400);
  }

  update(dt: number) {
    if (this.charging) {
      this.power += this.powerDir * dt * 1.25;
      if (this.power >= 1) { this.power = 1; this.powerDir = -1; }
      if (this.power <= 0) { this.power = 0; this.powerDir = 1; }
      (this.powerEl.querySelector('.fill') as HTMLElement).style.height = `${this.power * 100}%`;
    }
    // çaylı nişan titrer
    const wob = this.host.wobble();
    if (wob > 0 && this.myTurn && !this.charging) {
      const t = performance.now() / 1000;
      this.host.showAim({ x: this.aim.x + Math.sin(t * 9) * wob, y: this.aim.y + Math.cos(t * 7) * wob });
    }
  }

  private render() {
    const s = this.s;
    const sides = s.options.teams ? 2 : 2;
    const sideNames = s.options.teams
      ? [`${this.host.names[0]} & ${this.host.names[2]}`, `${this.host.names[1]} & ${this.host.names[3]}`]
      : [this.host.names[0], this.host.names[1]];
    let html = '';
    for (let i = 0; i < sides; i++) {
      const cur = D.sideOf(s, s.current) === i;
      html += `<div class="ds${cur ? ' turn' : ''}"><div class="nm">${sideNames[i]}</div><div class="rem">${s.remaining[i]}</div></div>`;
    }
    html += `<div class="ds info">${s.options.start} · ${s.options.doubleOut ? 'çiftle bitiş' : 'serbest bitiş'}<br>Tur ${s.turnNo} · Ok: ${'🎯'.repeat(3 - s.dartsThisTurn)}</div>`;
    this.board.innerHTML = html;
    this.powerEl.style.display = this.myTurn ? 'flex' : 'none';
    this.status.textContent = s.winner !== null ? 'Oyun bitti.'
      : this.myTurn ? `🟢 Sıra sende (kalan ${s.remaining[D.sideOf(s, s.current)]}): tahtaya nişan al, basılı tut, güç ortadayken bırak.`
      : `⏳ ${this.host.names[s.current]} atıyor...`;
    this.btns.innerHTML = '';
    this.btns.appendChild(btn('Kalk', 'ghost small', () => this.host.exit()));
  }

  private onEnd() {
    const s = this.s;
    const winSide = s.winner!;
    const humanSide = D.sideOf(s, 0);
    this.host.matchFinished(winSide);
    const m = h('div', 'modal');
    m.innerHTML = `<div class="panel"><h3>${winSide === humanSide ? '🎯 Kazandın!' : '🎯 Rakip kazandı'}</h3><p>Kalan: <b>${s.remaining[0]}</b> – <b>${s.remaining[1]}</b></p></div>`;
    const row = h('div', 'row-btns');
    row.appendChild(btn('Yeni oyun', 'primary', () => { m.remove(); this.host.clearDarts(); this.s = D.newDart(s.options); this.log.innerHTML = ''; this.render(); this.pump(); }));
    row.appendChild(btn('Bırak', 'ghost', () => this.host.exit()));
    m.querySelector('.panel')!.appendChild(row);
    this.el.appendChild(m);
  }
}
