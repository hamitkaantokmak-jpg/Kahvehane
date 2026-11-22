/** Pişti arayüzü (2 ve 4 kişilik): el, yerdeki deste, alma/pişti animasyonları, takım puanları. */
import * as P from '../../games/pisti/pisti';
import { choosePistiCard } from '../../games/pisti/pistiBot';
import { createRng } from '../../games/common/rng';
import { GameHost, GameUI } from '../../tables/TableSession';
import { h, btn, later } from '../dom';

export function cardEl(c: P.Card | null, opts: { back?: boolean; small?: boolean } = {}): HTMLDivElement {
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
  protected rng = createRng();
  protected alive = true;
  protected timer = 0;
  private table!: HTMLDivElement;
  private handEl!: HTMLDivElement;
  private info!: HTMLDivElement;
  private status!: HTMLDivElement;
  private btns!: HTMLDivElement;
  protected busy = false;

  constructor(protected host: GameHost, protected opts: P.PistiOptions) {
    this.el = h('div', `gui pisti p${opts.players}`);
    this.s = P.newPisti(opts, this.rng);
    this.info = h('div', 'pinfo');
    this.table = h('div', 'ptable');
    this.status = h('div', 'status');
    this.handEl = h('div', 'phand');
    this.btns = h('div', 'gbtns');
    // alt bölüm: el + durum + düğmeler (yatay telefonda el solda, durum ve düğmeler sağda)
    const dock = h('div', 'odock');
    const side = h('div', 'oside');
    side.append(this.status, this.btns);
    dock.append(this.handEl, side);
    this.el.append(this.table, dock);
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

  protected pump() {
    if (!this.alive || this.s.phase !== 'play' || this.host.isHuman(this.s.current)) return;
    // masadan kalkan (kavgadaki) oyuncu varsa bot sırası bekler
    if (this.host.paused) { clearTimeout(this.timer); this.timer = later(() => this.pump(), 600); return; }
    const p = this.s.current;
    clearTimeout(this.timer);
    this.timer = later(() => this.play(p, choosePistiCard(P.viewPisti(this.s, p), this.rng, this.host.difficulty)), 750 + Math.random() * 500);
  }

  protected play(p: number, cardId: number) {
    if (!this.alive || this.s.phase !== 'play' || this.busy) return;
    if (this.s.current !== p || !this.s.hands[p].some((c) => c.id === cardId)) { this.pump(); return; }
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

  protected splash(text: string) {
    const d = h('div', 'splash', text);
    this.el.appendChild(d);
    setTimeout(() => d.remove(), 1600);
  }

  private sync3d() {
    const s = this.s;
    this.host.table3d.syncPisti({ players: this.opts.players, hands: [s.hands[0]], handCounts: s.hands.map((x) => x.length), pile: s.pile, hiddenCount: s.hiddenCount, deckCount: s.deck.length, captured: s.captured.map((c) => c.length), capturedIds: s.captured });
  }

  /** Masa görünümü: yeşil çuha, herkes kendi kenarında; aldığı kartlar önünde yığılır, deste ve yerdeki kartlar ortada. */
  protected render(capturedBy?: number) {
    this.sync3d();
    const s = this.s;
    const n = this.host.names;
    const t = P.tally(s);
    const four = this.opts.players === 4;
    const live = s.phase === 'play';
    // köşedeki skor tabelası
    this.info.innerHTML = [0, 1].map((side) =>
      `<div class="pside${this.side(0) === side ? ' me' : ''}"><span class="nm">${this.sideName(side)}</span><b class="tot">${s.totals[side]}</b><span class="of">/${s.options.target}</span></div>`,
    ).join('') + `<div class="pel">El ${s.handNo}</div>`;
    this.table.innerHTML = '';
    this.table.appendChild(this.info);
    // aldığı kartlar: kapalı yığın + sayı (+ pişti puanı)
    const capEl = (side: number) => {
      const c = h('div', `pcap${capturedBy !== undefined && this.side(capturedBy) === side ? ' fresh' : ''}`);
      const stack = h('div', 'pcap-stack');
      const k = Math.min(4, Math.ceil(t[side].cards / 4));
      for (let i = 0; i < k; i++) { const ce = cardEl(null, { back: true, small: true }); ce.style.setProperty('--i', String(i)); stack.appendChild(ce); }
      if (!k) stack.appendChild(h('div', 'empty'));
      c.appendChild(stack);
      c.appendChild(h('div', 'pl', `${t[side].cards} kart · ${t[side].points} puan${t[side].pistiPoints ? ` · <b>pişti ${t[side].pistiPoints}</b>` : ''}`));
      return c;
    };
    const plate = (pi: number) => {
      const partner = four && pi !== 0 && this.side(pi) === 0;
      const d = h('div', `oplate${s.current === pi && live ? ' turn' : ''}${partner ? ' opened' : ''}`);
      d.innerHTML = `<span class="nm">${pi === 0 ? 'Sen' : n[pi]}</span><span class="cnt" title="Eldeki kart">${s.hands[pi].length}</span>${partner ? '<span class="meta">ortak</span>' : ''}`;
      return d;
    };
    const seats: [number, string][] = four ? [[1, 'right'], [2, 'top'], [3, 'left']] : [[1, 'top']];
    // takımın aldığı kartlar: kendi tarafın altta, karşı tarafınki sağdaki (2 kişide karşıdaki) rakibin önünde
    const capHolder = (pi: number) => pi === 0 || pi === 1;
    for (const [pi, pos] of seats) {
      const z = h('div', `pseat ${pos}${s.current === pi && live ? ' turn' : ''}`);
      const who = h('div', 'pwho');
      who.appendChild(plate(pi));
      const backs = h('div', 'backs');
      for (let k = 0; k < s.hands[pi].length; k++) backs.appendChild(cardEl(null, { back: true, small: true }));
      who.appendChild(backs);
      z.appendChild(who);
      if (capHolder(pi)) z.appendChild(capEl(this.side(pi)));
      this.table.appendChild(z);
    }
    // orta: deste + yerdeki kartlar
    const center = h('div', 'pcenter');
    const deck = h('div', 'pdeck');
    if (s.deck.length) deck.appendChild(cardEl(null, { back: true }));
    else deck.appendChild(h('div', 'empty'));
    deck.appendChild(h('div', 'pl', `Deste ${s.deck.length}`));
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
    } else pile.appendChild(h('div', 'empty', capturedBy !== undefined ? `${capturedBy === 0 ? 'Sen' : n[capturedBy]} aldı!` : 'Yer boş'));
    center.append(deck, pile);
    this.table.appendChild(center);
    const me = h('div', `pseat bottom${s.current === 0 && live ? ' turn' : ''}`);
    me.append(capEl(this.side(0)), plate(0));
    this.table.appendChild(me);
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

  protected newMatchLabel = 'Yeni maç';
  protected onNextHand() { P.nextHand(this.s, this.rng); this.host.sfx('deal'); this.host.table3d.clear(); this.render(); this.pump(); }
  protected onNewMatch() { this.s = P.newPisti(this.opts, this.rng); this.host.table3d.clear(); this.render(); this.pump(); }

  protected onHandEnd() {
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
    if (!over) row.appendChild(btn('Sonraki el ▶', 'primary', () => { m.remove(); this.onNextHand(); }));
    else {
      this.host.matchFinished(winSide === mySide);
      row.appendChild(btn(this.newMatchLabel, 'primary', () => { m.remove(); this.onNewMatch(); }));
    }
    row.appendChild(btn('Masadan kalk', 'ghost', () => this.host.exit()));
    m.querySelector('.panel')!.appendChild(row);
    this.el.appendChild(m);
  }
}
