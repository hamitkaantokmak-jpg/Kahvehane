/** Tavla arayüzü: 24 haneli tahta, zar, pul seçimi + hedef vurgusu, bar, toplama, geri alma, maç skoru. */
import * as V from '../../games/tavla/tavla';
import { chooseSequence } from '../../games/tavla/tavlaBot';
import { createRng } from '../../games/common/rng';
import { GameHost, GameUI } from '../../tables/TableSession';
import { h, btn, later } from '../dom';

const PIPS = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export class TavlaUI implements GameUI {
  readonly el: HTMLDivElement;
  s: V.TavlaState;
  private rng = createRng();
  private alive = true;
  private timer = 0;
  private sel: V.From | null = null;
  private undoStack: string[] = [];
  private boardEl!: HTMLDivElement;
  private side!: HTMLDivElement;
  private status!: HTMLDivElement;
  private btns!: HTMLDivElement;
  private rolling = false;
  /** Test kancası: sonraki zarı sabitle */
  forceDice: [number, number] | null = null;

  constructor(private host: GameHost, opts: V.TavlaOptions) {
    this.el = h('div', 'gui tavla');
    this.s = V.newTavla(opts);
    this.boardEl = h('div', 'tboard');
    this.side = h('div', 'tside');
    this.status = h('div', 'status');
    this.btns = h('div', 'gbtns');
    const wrap = h('div', 'twrap');
    wrap.append(this.boardEl, this.side);
    this.el.append(wrap, this.status, this.btns);
    this.render();
  }

  /** Test kancası: durum dışarıdan değiştirildikten sonra yeniden çiz ve bot döngüsünü sürdür. */
  refresh() {
    this.render();
  }

  destroy() {
    this.alive = false;
    clearTimeout(this.timer);
    this.el.remove();
  }

  private openingRoll() {
    const [a, b] = V.rollOpening(this.s, this.rng);
    this.host.sfx('dice');
    this.host.toast(`Açılış: Sen ${a} — ${this.host.names[1]} ${b}. ${a > b ? 'Sen başlıyorsun!' : `${this.host.names[1]} başlıyor.`}`);
    if (a < b) this.host.react(1, 'happy');
    this.render();
    this.timer = later(() => this.next(), 900);
  }

  private next() {
    if (!this.alive) return;
    const s = this.s;
    if (s.phase === 'gameOver' || s.phase === 'matchOver') { this.onGameEnd(); return; }
    if (s.phase === 'roll' && s.current === 1) this.botTurn();
    this.render();
  }

  private roll() {
    if (this.rolling || this.s.phase !== 'roll' || this.s.current !== 0) return;
    this.rolling = true;
    this.host.sfx('dice');
    // zar animasyonu
    let k = 0;
    const anim = () => {
      const d = this.side.querySelector('.dice');
      if (d) d.innerHTML = `<span class="die rolling">${PIPS[1 + Math.floor(Math.random() * 6)]}</span><span class="die rolling">${PIPS[1 + Math.floor(Math.random() * 6)]}</span>`;
      if (++k < 6) this.timer = later(anim, 70);
      else {
        this.rolling = false;
        V.roll(this.s, this.rng, this.forceDice ?? undefined);
        this.forceDice = null;
        this.undoStack = [JSON.stringify(this.snapshot())];
        if (this.s.dice[0] === this.s.dice[1]) this.host.toast(`Çift ${this.s.dice[0]}! Dört hamle.`);
        if (V.legalMoves(this.s).length === 0) {
          this.host.toast('Oynanacak hamle yok, sıra geçiyor.');
          this.timer = later(() => { V.endTurn(this.s); this.next(); }, 1200);
        }
        this.render();
      }
    };
    anim();
  }

  private snapshot() {
    const s = this.s;
    return { points: s.points, bar: s.bar, off: s.off, remaining: s.remaining, turnMoves: s.turnMoves };
  }

  private undo() {
    if (this.undoStack.length === 0 || this.s.current !== 0 || this.s.phase !== 'move') return;
    const snap = JSON.parse(this.undoStack[0]);
    Object.assign(this.s, snap);
    this.sel = null;
    this.render();
  }

  private clickSource(from: V.From) {
    const s = this.s;
    if (s.current !== 0 || s.phase !== 'move') return;
    const moves = V.legalMoves(s).filter((m) => m.from === from);
    if (!moves.length) { this.sel = null; this.render(); return; }
    // tek hedef varsa doğrudan oyna (çift tıklamayı azaltır)
    const targets = new Set(moves.map((m) => String(m.to)));
    if (this.sel === from && targets.size === 1) { this.doMove(moves[0].from, moves[0].to); return; }
    this.sel = from;
    this.render();
  }

  private clickTarget(to: V.To) {
    if (this.sel === null) return;
    this.doMove(this.sel, to);
  }

  private doMove(from: V.From, to: V.To) {
    const s = this.s;
    try {
      const m = V.move(s, from, to);
      this.host.sfx(m.hit ? 'slap' : 'tile');
      if (m.hit) { this.host.react(1, 'angry', 'Kırdın pulumu!'); this.host.react(0, 'slam'); }
    } catch (e) { this.host.toast((e as Error).message); }
    this.sel = null;
    this.render();
    if (s.phase === 'gameOver' || s.phase === 'matchOver') { this.timer = later(() => this.onGameEnd(), 600); return; }
    if (s.phase === 'move' && s.remaining.length === 0) {
      this.timer = later(() => { if (this.s.phase === 'move' && this.s.current === 0) { V.endTurn(this.s); this.next(); } }, 700);
    }
  }

  private async botTurn() {
    const s = this.s;
    if (Math.random() < 0.3) this.host.react(1, 'think');
    await this.delay(700);
    if (!this.alive) return;
    V.roll(s, this.rng);
    this.host.sfx('dice');
    if (s.dice[0] === s.dice[1] && Math.random() < 0.6) this.host.react(1, 'happy', `Çift ${s.dice[0]}! Gördün mü?`);
    this.render();
    await this.delay(700);
    const seq = chooseSequence(s, 1, [...s.remaining], this.rng, 0.8, this.host.difficulty);
    if (!seq.length) this.host.react(1, 'angry', 'Kapı kapalı, oynayamadım!');
    for (const m of seq) {
      if (!this.alive) return;
      const done = V.move(s, m.from, m.to, m.die);
      this.host.sfx(done.hit ? 'slap' : 'tile');
      if (done.hit) { this.host.react(1, 'goodMove', 'Kırdım! Bara!'); this.host.react(0, 'surprise'); }
      this.render();
      if (s.phase === 'gameOver' || s.phase === 'matchOver') { await this.delay(600); this.onGameEnd(); return; }
      await this.delay(550);
    }
    if (s.phase === 'move') V.endTurn(s);
    this.render();
  }

  private delay(ms: number) { return new Promise<void>((r) => (this.timer = later(() => r(), ms))); }

  // ------------------------------------------------------------ çizim
  private sync3d() {
    const s = this.s;
    this.host.table3d.syncTavla({ points: s.points, bar: s.bar, off: s.off, dice: s.dice });
  }

  private render() {
    this.sync3d();
    const s = this.s;
    const legal = s.current === 0 && s.phase === 'move' ? V.legalMoves(s) : [];
    const sources = new Set(legal.map((m) => String(m.from)));
    const targets = new Set(legal.filter((m) => m.from === this.sel).map((m) => String(m.to)));
    this.boardEl.innerHTML = '';
    const mkPoint = (i: number, top: boolean) => {
      const v = s.points[i];
      const d = h('div', `pt ${top ? 'top' : 'bot'} ${i % 2 ? 'odd' : 'even'}${sources.has(String(i)) ? ' src' : ''}${this.sel === i ? ' sel' : ''}${targets.has(String(i)) ? ' tgt' : ''}`);
      d.appendChild(h('div', 'tri'));
      const stack = h('div', 'stack');
      const n = Math.abs(v);
      const show = Math.min(n, 5);
      for (let k = 0; k < show; k++) {
        const c = h('div', `chk ${v > 0 ? 'w' : 'b'}`);
        if (k === show - 1 && n > 5) c.textContent = String(n);
        stack.appendChild(c);
      }
      d.appendChild(stack);
      d.appendChild(h('div', 'pnum', String(i + 1)));
      d.addEventListener('click', () => (targets.has(String(i)) ? this.clickTarget(i) : this.clickSource(i)));
      return d;
    };
    const top = h('div', 'trow');
    const bot = h('div', 'trow');
    const half = (row: HTMLElement, idxs: number[], isTop: boolean) => {
      const hh = h('div', 'thalf');
      for (const i of idxs) hh.appendChild(mkPoint(i, isTop));
      row.appendChild(hh);
    };
    half(top, [12, 13, 14, 15, 16, 17], true);
    const barTop = h('div', 'bar');
    for (let k = 0; k < s.bar[1]; k++) barTop.appendChild(h('div', 'chk b'));
    top.appendChild(barTop);
    half(top, [18, 19, 20, 21, 22, 23], true);
    half(bot, [11, 10, 9, 8, 7, 6], false);
    const barBot = h('div', `bar${sources.has('bar') ? ' src' : ''}${this.sel === 'bar' ? ' sel' : ''}`);
    for (let k = 0; k < s.bar[0]; k++) barBot.appendChild(h('div', 'chk w'));
    barBot.addEventListener('click', () => this.clickSource('bar'));
    bot.appendChild(barBot);
    half(bot, [5, 4, 3, 2, 1, 0], false);
    this.boardEl.append(top, bot);

    // yan panel: toplanan pullar, zarlar, skor
    this.side.innerHTML = '';
    const offB = h('div', 'off b', `<span>${this.host.names[1]}</span><b>${s.off[1]}</b>/15`);
    const dice = h('div', 'dice');
    if (s.phase === 'opening' && s.openingRolls === null) dice.innerHTML = '<span class="muted">Açılış zarı</span>';
    else if (s.dice.length) {
      const used = [...s.remaining];
      const all = s.dice[0] === s.dice[1] ? [s.dice[0], s.dice[0], s.dice[0], s.dice[0]] : s.dice;
      dice.innerHTML = all.map((d) => { const i = used.indexOf(d); if (i >= 0) { used.splice(i, 1); return `<span class="die">${PIPS[d]}</span>`; } return `<span class="die used">${PIPS[d]}</span>`; }).join('');
    }
    const offW = h('div', `off w${targets.has('off') ? ' tgt' : ''}`, `<span>Sen</span><b>${s.off[0]}</b>/15<small>${targets.has('off') ? 'Topla ⬇' : ''}</small>`);
    offW.addEventListener('click', () => targets.has('off') && this.clickTarget('off'));
    const score = h('div', 'tscore', `Maç (${s.options.target}): <b>${s.score[0]}</b> – <b>${s.score[1]}</b><br><small>Pip: ${V.pipCount(s, 0)} / ${V.pipCount(s, 1)}</small>`);
    this.side.append(offB, dice, offW, score);

    let msg = '';
    if (s.phase === 'opening') msg = '🎲 Açılış: büyük atan başlar.';
    else if (s.current === 0 && s.phase === 'roll') msg = '🟢 Zar at!';
    else if (s.current === 0 && s.phase === 'move') msg = s.bar[0] > 0 ? '🟡 Önce bardaki pulunu oyuna sok.' : this.sel === null ? '🟢 Oynatacağın pulu seç (parlayanlar).' : '🟢 Hedef haneyi seç.';
    else if (s.current === 1) msg = `⏳ ${this.host.names[1]} oynuyor...`;
    this.status.textContent = msg;
    this.btns.innerHTML = '';
    if (s.phase === 'opening') this.btns.appendChild(btn('🎲 Açılış zarı', 'primary glow', () => this.openingRoll()));
    if (s.phase === 'roll' && s.current === 0) this.btns.appendChild(btn('🎲 Zar at', 'primary glow', () => this.roll()));
    if (s.phase === 'move' && s.current === 0 && s.turnMoves.length) this.btns.appendChild(btn('↶ Geri al', 'small', () => this.undo()));
    this.btns.appendChild(btn('Kalk', 'ghost small', () => this.host.exit()));
  }

  private onGameEnd() {
    const s = this.s;
    const r = s.lastResult!;
    const names = this.host.names;
    const kind = r.kind === 'normal' ? 'normal galibiyet' : r.kind === 'mars' ? 'MARS!' : 'KATMERLİ MARS!';
    this.host.react(r.winner, r.kind === 'normal' ? 'happy' : 'win');
    this.host.react(1 - r.winner, r.kind === 'normal' ? 'angry' : 'lose');
    const m = h('div', 'modal');
    const over = s.phase === 'matchOver';
    m.innerHTML = `<div class="panel"><h3>${r.winner === 0 ? '🎉 Oyunu kazandın!' : `${names[1]} kazandı`}</h3>
      <p class="accent-txt">${kind} (+${r.points})</p><p>Skor: <b>${s.score[0]}</b> – <b>${s.score[1]}</b></p>
      ${over ? `<h3>${s.score[0] > s.score[1] ? '🏆 Maçı KAZANDIN!' : `🏆 Maçı ${names[1]} kazandı`}</h3>` : ''}</div>`;
    const row = h('div', 'row-btns');
    if (!over) row.appendChild(btn('Sonraki oyun ▶', 'primary', () => { m.remove(); V.newGame(s); this.render(); }));
    else {
      this.host.matchFinished(s.score[0] > s.score[1]);
      row.appendChild(btn('Yeni maç', 'primary', () => { m.remove(); this.s = V.newTavla(s.options); this.render(); }));
    }
    row.appendChild(btn('Masadan kalk', 'ghost', () => this.host.exit()));
    m.querySelector('.panel')!.appendChild(row);
    this.el.appendChild(m);
  }
}
