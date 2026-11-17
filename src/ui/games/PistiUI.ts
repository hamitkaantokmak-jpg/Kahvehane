/** Pişti arayüzü (2 ve 4 kişilik): el, yerdeki deste, alma/pişti animasyonları, takım puanları. */
import * as P from '../../games/pisti/pisti';
import { choosePistiCard } from '../../games/pisti/pistiBot';
import { createRng } from '../../games/common/rng';
import { GameHost, GameUI } from '../../tables/TableSession';
import { h, btn, later } from '../dom';

function cardEl(c: P.Card | null, opts: { back?: boolean; small?: boolean } = {}): HTMLDivElement {
  const el = h('div', `card${opts.back ? ' back' : ''}${opts.small ? ' small' : ''}`);
  if (!c || opts.back) return el;
  const red = c.suit === 1 || c.suit === 2;
  el.classList.add(red ? 'red' : 'black');
  el.dataset.id = String(c.id);
  const r = P.RANK_LABEL[c.rank];
  const sym = P.SUIT_SYMBOL[c.suit];
  el.innerHTML = `<span class="cr tl">${r}<br>${sym}</span><span class="cs">${c.rank === 11 ? '🤵' : c.rank === 12 ? '👸' : c.rank === 13 ? '🤴' : sym}</span><span class="cr br">${r}<br>${sym}</span>`;
  if (P.cardPoints(c) > 0) el.classList.add('pts');
  return el;
}

export class PistiUI implements GameUI {
  readonly el: HTMLDivElement;
  s: P.PistiState;
  private rng = createRng();
  private alive = true;
  private timer = 0;
  private table!: HTMLDivElement;
  private handEl!: HTMLDivElement;
  private info!: HTMLDivElement;
  private status!: HTMLDivElement;
  private btns!: HTMLDivElement;
  private busy = false;

  constructor(private host: GameHost, private opts: P.PistiOptions) {
    this.el = h('div', `gui pisti p${opts.players}`);
    this.s = P.newPisti(opts, this.rng);
    this.info = h('div', 'pinfo');
    this.table = h('div', 'ptable');
    this.status = h('div', 'status');
    this.handEl = h('div', 'phand');
    this.btns = h('div', 'gbtns');
    this.el.append(this.info, this.table, this.status, this.handEl, this.btns);
    this.host.sfx('deal');
    this.render();
    this.pump();
  }

  /** Test kancası: durum dışarıdan değiştirildikten sonra yeniden çiz ve bot döngüsünü sürdür. */
  refresh() {
    this.render(); this.pump();
  }

  destroy() {
    this.alive = false;
    clearTimeout(this.timer);
    this.el.remove();
  }

  private side(p: number) { return P.sideOf(this.s, p); }
  private sideName(side: number) {
    const n = this.host.names;
    if (this.opts.players === 2) return n[side];
    return side === 0 ? `Sen & ${n[2]}` : `${n[1]} & ${n[3]}`;
  }

  private pump() {
    if (!this.alive || this.s.phase !== 'play' || this.host.isHuman(this.s.current)) return;
    const p = this.s.current;
    this.timer = later(() => this.play(p, choosePistiCard(P.viewPisti(this.s, p), this.rng, this.host.difficulty)), 750 + Math.random() * 500);
  }

  private play(p: number, cardId: number) {
    if (!this.alive || this.s.current !== p || this.s.phase !== 'play' || this.busy) return;
    const s = this.s;
    const handBefore = s.round;
    const ev = P.playCard(s, p, cardId);
    this.host.sfx('card');
    if (ev) {
      if (ev.pisti) {
        this.splash(ev.pisti === 20 ? 'ÇİFT PİŞTİ! +20' : 'PİŞTİ! +10');
        this.host.sfx('pisti');
        this.host.react(p, 'win', ev.pisti === 20 ? 'Valeyle vale! Çift pişti!' : 'Pişti!');
        // rakipler sinirlenir
        for (let i = 0; i < this.opts.players; i++) if (this.side(i) !== this.side(p) && Math.random() < 0.7) this.host.react(i, 'angry');
      } else if (ev.cards.length >= 6 || ev.cards.some((c) => P.cardPoints(c) >= 2)) {
        this.host.react(p, 'goodMove');
      } else if (Math.random() < 0.3) this.host.react(p, 'play');
    }
    if (s.round !== handBefore && s.phase === 'play') { this.host.sfx('deal'); }
    this.render(ev?.player);
    if (s.phase !== 'play') { this.timer = later(() => this.onHandEnd(), 900); return; }
    this.pump();
  }

  private splash(text: string) {
    const d = h('div', 'splash', text);
    this.el.appendChild(d);
    setTimeout(() => d.remove(), 1600);
  }

  private sync3d() {
    const s = this.s;
    this.host.table3d.syncPisti({ players: this.opts.players, hands: [s.hands[0]], handCounts: s.hands.map((x) => x.length), pile: s.pile, hiddenCount: s.hiddenCount, deckCount: s.deck.length, captured: s.captured.map((c) => c.length), capturedIds: s.captured });
  }

  private render(capturedBy?: number) {
    this.sync3d();
    const s = this.s;
    const n = this.host.names;
    const t = P.tally(s);
    this.info.innerHTML = [0, 1].map((side) =>
      `<div class="pside${this.side(0) === side ? ' me' : ''}"><div class="nm">${this.sideName(side)}</div><div>Kart: <b>${t[side].cards}</b> · Pişti: <b>${t[side].pistiPoints}</b> · Puan: <b>${t[side].points}</b></div><div class="tot">Toplam: <b>${s.totals[side]}</b> / ${s.options.target}</div></div>`,
    ).join('') + `<div class="pdeck">Deste: <b>${s.deck.length}</b><br>El ${s.handNo}</div>`;
    // masa: rakiplerin elleri + ortadaki yığın
    this.table.innerHTML = '';
    const positions = this.opts.players === 2 ? [[1, 'top']] : [[1, 'right'], [2, 'top'], [3, 'left']];
    for (const [pi, pos] of positions as [number, string][]) {
      const o = h('div', `popp ${pos}${s.current === pi && s.phase === 'play' ? ' turn' : ''}${this.opts.players === 4 && this.side(pi) === 0 ? ' partner' : ''}`);
      o.appendChild(h('div', 'nm', n[pi] + (this.opts.players === 4 && this.side(pi) === 0 ? ' (ortak)' : '')));
      const cards = h('div', 'backs');
      for (let k = 0; k < s.hands[pi].length; k++) cards.appendChild(cardEl(null, { back: true, small: true }));
      o.appendChild(cards);
      this.table.appendChild(o);
    }
    const pile = h('div', `pile-center${capturedBy !== undefined ? ' captured' : ''}`);
    if (s.pile.length) {
      const visible = s.pile.slice(-4);
      visible.forEach((c, i) => {
        const hidden = s.hiddenCount > 0 && s.pile.indexOf(c) < s.hiddenCount;
        const ce = cardEl(c, { back: hidden });
        ce.style.transform = `translate(${i * 6 - 9}px, ${i * -3}px) rotate(${(i - 1.5) * 7}deg)`;
        pile.appendChild(ce);
      });
      pile.appendChild(h('div', 'pcount', `${s.pile.length} kart`));
    } else pile.appendChild(h('div', 'empty', capturedBy !== undefined ? `${n[capturedBy]} aldı!` : 'Yer boş'));
    this.table.appendChild(pile);
    // benim elim
    this.handEl.innerHTML = '';
    const top = s.pile[s.pile.length - 1];
    for (const c of s.hands[0]) {
      const ce = cardEl(c);
      const myTurn = s.current === 0 && s.phase === 'play';
      if (myTurn) {
        ce.classList.add('playable');
        if (top && (c.rank === top.rank || c.rank === P.JACK)) ce.classList.add('captures');
      }
      ce.addEventListener('click', () => { if (s.current === 0 && s.phase === 'play') this.play(0, c.id); });
      this.handEl.appendChild(ce);
    }
    this.status.textContent = s.phase !== 'play' ? 'El bitti.' : s.current === 0 ? '🟢 Bir kart oyna. Aynı değer ya da vale yerdekileri alır; tek kartı almak PİŞTİ!' : `⏳ ${n[s.current]} oynuyor...`;
    this.btns.innerHTML = '';
    this.btns.appendChild(btn('Kalk', 'ghost small', () => this.host.exit()));
  }

  private onHandEnd() {
    const s = this.s;
    const t = P.tally(s);
    const sc = s.handScores!;
    const majority = t[0].cards === t[1].cards ? 'Eşit kart — çoğunluk bonusu yok' : `${this.sideName(t[0].cards > t[1].cards ? 0 : 1)} en çok kartı aldı (+3)`;
    const m = h('div', 'modal');
    const over = s.phase === 'matchOver';
    const winSide = P.matchWinnerSide(s);
    const mySide = this.side(0);
    m.innerHTML = `<div class="panel"><h3>El ${s.handNo} bitti</h3>
      <table class="score"><tr><th></th><th>Kart</th><th>Kart puanı</th><th>Pişti</th><th>El</th><th>Toplam</th></tr>
      ${[0, 1].map((side) => `<tr class="${side === mySide ? 'me' : ''}"><td>${this.sideName(side)}</td><td>${t[side].cards}</td><td>${t[side].points}</td><td>${t[side].pistiPoints}</td><td><b>${sc[side]}</b></td><td><b>${s.totals[side]}</b></td></tr>`).join('')}
      </table><p class="muted">${majority}. As/Vale 1, ♣2 = 2, ♦10 = 3, pişti 10, vale piştisi 20.</p>
      ${over ? `<h3>${winSide === mySide ? '🏆 Maçı KAZANDINIZ!' : `🏆 Maçı ${this.sideName(winSide)} kazandı`}</h3>` : ''}</div>`;
    const row = h('div', 'row-btns');
    if (!over) row.appendChild(btn('Sonraki el ▶', 'primary', () => { m.remove(); P.nextHand(s, this.rng); this.host.sfx('deal'); this.host.table3d.clear(); this.render(); this.pump(); }));
    else {
      this.host.matchFinished(winSide === mySide);
      row.appendChild(btn('Yeni maç', 'primary', () => { m.remove(); this.s = P.newPisti(this.opts, this.rng); this.host.table3d.clear(); this.render(); this.pump(); }));
    }
    row.appendChild(btn('Masadan kalk', 'ghost', () => this.host.exit()));
    m.querySelector('.panel')!.appendChild(row);
    this.el.appendChild(m);
  }
}
