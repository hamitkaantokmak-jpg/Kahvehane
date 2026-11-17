/** Klasik Okey arayüzü: ıstaka, sürükle-bırak, desteden/soldan çekme, atma, bitirme, puan tablosu. */
import * as O from '../../games/okey/okey';
import { decideOkey } from '../../games/okey/okeyBot';
import { createRng } from '../../games/common/rng';
import { isJoker } from '../../games/common/tiles';
import { GameHost, GameUI } from '../../tables/TableSession';
import { h, btn, later } from '../dom';
import { Rack, tileEl } from './TileView';

const KIND_TR: Record<string, string> = { normal: 'normal bitti', okey: 'okey atarak bitti', pairs: 'çiftten bitti', pairsOkey: 'çiftten okey atarak bitti', deckEmpty: 'deste bitti' };

export class OkeyUI implements GameUI {
  readonly el: HTMLDivElement;
  s: O.OkeyState;
  private rng = createRng();
  rack = new Rack();
  private alive = true;
  private botTimer = 0;
  private status!: HTMLDivElement;
  private board!: HTMLDivElement;
  private btns!: HTMLDivElement;
  private myPile!: HTMLDivElement;

  constructor(private host: GameHost) {
    this.el = h('div', 'gui okey');
    this.s = O.newMatch(this.rng, 0);
    this.build();
    this.rack.sync(this.s.hands[0], this.s.ctx);
    this.rack.arrangeMelds(O.OKEY_RULES);
    this.render();
    this.pump();
  }

  private build() {
    this.board = h('div', 'okey-board');
    this.status = h('div', 'status');
    this.btns = h('div', 'gbtns');
    this.el.append(this.board, this.status, this.rack.el, this.btns);
    this.rack.onSelect = () => this.renderButtons();
    this.rack.onChange = () => this.sync3d();
  }

  /** Test kancası: durum dışarıdan değiştirildikten sonra yeniden çiz ve bot döngüsünü sürdür. */
  refresh() {
    this.rack.sync(this.s.hands[0], this.s.ctx); this.render(); if ((this.s.phase as string) !== 'ended') this.pump();
  }

  destroy() {
    this.alive = false;
    clearTimeout(this.botTimer);
    this.el.remove();
  }

  // ------------------------------------------------------------ bot döngüsü
  private pump() {
    if (!this.alive || this.s.phase === 'ended') return;
    if (this.host.isHuman(this.s.current)) return;
    // masadan kalkan (kavgadaki) oyuncu varsa bot sırası bekler
    if (this.host.paused) { clearTimeout(this.botTimer); this.botTimer = later(() => this.pump(), 600); return; }
    clearTimeout(this.botTimer);
    const p = this.s.current;
    if (Math.random() < 0.25) this.host.react(p, 'think');
    this.botTimer = later(() => this.botStep(p), 700 + Math.random() * 600);
  }

  private botStep(p: number) {
    if (!this.alive || this.s.current !== p || this.s.phase === 'ended') return;
    // ilk tur göstergeyi göster
    if (O.canShowIndicator(this.s, p)) {
      O.showIndicator(this.s, p);
      this.host.react(p, 'happy', 'Gösterge bende!');
      this.host.sfx('tile');
    }
    const a = decideOkey(O.viewFor(this.s, p), this.rng, this.host.difficulty);
    try {
      if (a.type === 'drawDeck') { O.drawFromDeck(this.s, p); this.host.sfx('tile'); }
      else if (a.type === 'drawDiscard') { O.drawFromDiscard(this.s, p); this.host.sfx('tile'); if (Math.random() < 0.4) this.host.react(p, 'goodMove'); }
      else if (a.type === 'discard') {
        const t = O.discard(this.s, p, a.tileId);
        this.host.sfx('tile');
        if (isJoker(t, this.s.ctx)) this.host.react(p, 'surprise', 'Okey attım, hata!');
        else if (Math.random() < 0.12) this.host.react(p, 'slam');
        else if (Math.random() < 0.3) this.host.react(p, 'play');
      } else {
        O.finish(this.s, p, a.tileId);
        this.host.sfx('tableSlam');
        this.host.react(p, 'win');
      }
    } catch (e) {
      console.warn('bot hatası', e);
      // güvenli geri dönüş
      if (this.s.phase === 'draw') O.drawFromDeck(this.s, p);
      else O.discard(this.s, p, this.s.hands[p][0].id);
    }
    this.render();
    if ((this.s.phase as string) === 'ended') { this.onHandEnd(); return; }
    if (this.s.phase === 'discard' && this.s.current === p) {
      this.botTimer = later(() => this.botStep(p), 600 + Math.random() * 500);
      return;
    }
    this.pump();
  }

  // ------------------------------------------------------------ insan hamleleri
  private myTurn() { return this.s.current === 0 && this.s.phase !== 'ended'; }

  private drawDeck() {
    if (!this.myTurn() || this.s.phase !== 'draw') return;
    const t = O.drawFromDeck(this.s, 0);
    this.host.sfx('tile');
    this.rack.highlight = t.id;
    this.after();
  }

  private drawLeft() {
    if (!this.myTurn() || !O.canTakeDiscard(this.s, 0)) return;
    const t = O.drawFromDiscard(this.s, 0);
    this.host.sfx('tile');
    this.rack.highlight = t.id;
    this.after();
  }

  private discard(id: number) {
    if (!this.myTurn() || this.s.phase !== 'discard') { this.host.toast(this.s.phase === 'draw' ? 'Önce taş çek (desteden ya da soldan).' : 'Sıra sende değil.'); return; }
    const t = O.discard(this.s, 0, id);
    this.host.sfx('tile');
    if (isJoker(t, this.s.ctx)) this.host.toast('Okey attın! Rakipler buna çok sevinir.');
    this.rack.selected.clear();
    this.rack.highlight = null;
    this.after();
  }

  private finish(id: number) {
    if (!this.myTurn() || this.s.phase !== 'discard') return;
    if (!O.canFinishWith(this.s, 0, id)) { this.host.toast('Bu taşı atınca el bitmiyor. Perlerini kontrol et.'); return; }
    O.finish(this.s, 0, id);
    this.host.sfx('tableSlam');
    this.host.react(0, 'slam');
    this.after();
  }

  private after() {
    this.rack.sync(this.s.hands[0], this.s.ctx);
    this.render();
    if (this.s.phase === 'ended') { this.onHandEnd(); return; }
    this.pump();
  }

  // ------------------------------------------------------------ çizim
  private sync3d() {
    const s = this.s;
    this.host.table3d.syncOkey({ hands: [s.hands[0]], handCounts: s.hands.map((x) => x.length), rackOrder: this.rack.slots, deckCount: s.deck.length, deckIds: s.deck.map((t) => t.id), indicator: s.indicator, ctx: s.ctx, discards: s.discards });
  }

  private render() {
    this.sync3d();
    const s = this.s;
    const names = this.host.names;
    this.rack.sync(s.hands[0], s.ctx);
    const opp = (i: number, pos: string) => {
      const d = h('div', `opp ${pos}${s.current === i && s.phase !== 'ended' ? ' turn' : ''}`);
      d.innerHTML = `<div class="nm">${names[i]}</div><div class="meta">${s.hands[i].length} taş · <b>${s.scores[i]}</b> puan</div>`;
      return d;
    };
    const pile = (i: number, cls: string, clickable: boolean) => {
      const d = h('div', `pile ${cls}${clickable ? ' clickable' : ''}`);
      const top = s.discards[i][s.discards[i].length - 1];
      if (top) d.appendChild(tileEl(top, s.ctx));
      else d.appendChild(h('div', 'empty', '—'));
      d.appendChild(h('div', 'pl', `${names[i]} (${s.discards[i].length})`));
      if (clickable) d.addEventListener('click', () => this.drawLeft());
      return d;
    };
    this.board.innerHTML = '';
    const top = h('div', 'ob-top');
    top.append(opp(2, 'top'), pile(2, 'p-top', false));
    const mid = h('div', 'ob-mid');
    const leftCol = h('div', 'ob-side');
    leftCol.append(opp(3, 'left'), pile(3, 'p-left', this.myTurn() && s.phase === 'draw' && s.discards[3].length > 0));
    const center = h('div', 'ob-center');
    const deck = h('div', `deck${this.myTurn() && s.phase === 'draw' ? ' clickable glow' : ''}`);
    deck.innerHTML = `<div class="tile back"></div><div class="cnt">${s.deck.length}</div><div class="pl">Deste</div>`;
    deck.addEventListener('click', () => this.drawDeck());
    const ind = h('div', 'indicator');
    ind.appendChild(tileEl(s.indicator, null));
    ind.appendChild(h('div', 'pl', 'Gösterge'));
    const okeyInfo = h('div', 'okeyinfo', `Okey: <b style="color:${['#d62828', '#e9a100', '#1d5fc4', '#222'][s.ctx.okeyColor]}">${s.ctx.okeyNum}</b>`);
    center.append(deck, ind, okeyInfo);
    const rightCol = h('div', 'ob-side');
    rightCol.append(opp(1, 'right'), pile(1, 'p-right', false));
    mid.append(leftCol, center, rightCol);
    this.myPile = pile(0, 'p-mine drop', false);
    this.myPile.querySelector('.pl')!.textContent = 'Atmak için buraya sürükle';
    this.board.append(top, mid, this.myPile);
    this.rack.dropTargets = [{ el: this.myPile, onDrop: (id) => this.discard(id), accept: () => this.myTurn() && s.phase === 'discard' }];
    // durum
    let msg = '';
    if (s.phase === 'ended') msg = 'El bitti.';
    else if (s.current === 0) msg = s.phase === 'draw' ? '🟢 Sıra sende: desteden ya da solundaki ' + names[3] + '\'ın attığı taşı çek.' : '🟢 Bir taş seç ve at (ya da sürükle). Elin hazırsa "Bitir".';
    else msg = `⏳ ${names[s.current]} düşünüyor...`;
    this.status.innerHTML = `${msg} <span class="hand-no">El ${s.handNo}</span>`;
    this.renderButtons();
  }

  private renderButtons() {
    const s = this.s;
    this.btns.innerHTML = '';
    const sel = [...this.rack.selected][0];
    this.btns.appendChild(btn('Seri diz', 'small', () => this.rack.arrangeMelds(O.OKEY_RULES)));
    this.btns.appendChild(btn('Çift diz', 'small', () => this.rack.arrangePairs()));
    this.btns.appendChild(btn('Sırala', 'small', () => this.rack.arrangeSorted()));
    if (O.canShowIndicator(s, 0)) {
      this.btns.appendChild(btn('Gösterge göster', 'small accent', () => { O.showIndicator(s, 0); this.host.sfx('tile'); this.host.toast('Göstergeyi gösterdin: rakipler 1 puan kaybetti.'); this.render(); }));
    }
    const canAct = this.myTurn() && s.phase === 'discard' && sel !== undefined;
    const at = btn('At', canAct ? 'primary' : 'primary disabled', () => sel !== undefined && this.discard(sel));
    this.btns.appendChild(at);
    const canFinish = canAct && !!O.canFinishWith(s, 0, sel!);
    const finishBtn = btn('Bitir 🏁', canFinish ? 'accent glow' : 'accent disabled', () => sel !== undefined && this.finish(sel));
    this.btns.appendChild(finishBtn);
    // ipucu: herhangi bir taşla bitebiliyor muyum?
    if (this.myTurn() && s.phase === 'discard' && !canFinish && s.hands[0].some((t) => O.canFinishWith(s, 0, t.id))) {
      this.btns.appendChild(h('span', 'hint', '💡 Elin bitmeye hazır!'));
    }
    this.btns.appendChild(btn('Kalk', 'ghost small', () => this.host.exit()));
  }

  private onHandEnd() {
    const s = this.s;
    const r = s.result!;
    const names = this.host.names;
    if (r.winner !== null && r.winner !== 0) this.host.react(0, 'lose');
    if (r.winner !== null) s.hands.forEach((_, i) => { if (i !== r.winner && i !== 0 && Math.random() < 0.6) setTimeout(() => this.host.react(i, 'angry'), 600 + i * 300); });
    const m = h('div', 'modal');
    const title = r.winner === null ? 'Deste bitti — el berabere' : r.winner === 0 ? '🎉 Eli sen bitirdin!' : `${names[r.winner]} ${KIND_TR[r.kind]}!`;
    let rows = '';
    for (let i = 0; i < 4; i++) rows += `<tr class="${i === r.winner ? 'win' : ''}"><td>${names[i]}</td><td>${r.deductions[i] ? '−' + r.deductions[i] : '—'}</td><td><b>${s.scores[i]}</b></td></tr>`;
    const over = s.matchOver;
    const mw = O.matchWinner(s);
    m.innerHTML = `<div class="panel"><h3>${title}</h3>${r.winner !== null ? `<p class="muted">Tür: ${KIND_TR[r.kind]}</p>` : ''}
      <table class="score"><tr><th>Oyuncu</th><th>Bu el</th><th>Puan</th></tr>${rows}</table>
      ${over ? `<h3>${mw === 0 ? '🏆 Maçı KAZANDIN!' : `🏆 Maçı ${names[mw]} kazandı`}</h3>` : ''}</div>`;
    const row = h('div', 'row-btns');
    if (!over) row.appendChild(btn('Sonraki el ▶', 'primary', () => { m.remove(); O.nextHand(s, this.rng); this.rack.slots.fill(null); this.rack.sync(s.hands[0], s.ctx); this.rack.arrangeMelds(O.OKEY_RULES); this.render(); this.host.sfx('deal'); this.pump(); }));
    else {
      this.host.matchFinished(mw === 0);
      row.appendChild(btn('Yeni maç', 'primary', () => { m.remove(); this.s = O.newMatch(this.rng, 0); this.rack.slots.fill(null); this.rack.sync(this.s.hands[0], this.s.ctx); this.rack.arrangeMelds(O.OKEY_RULES); this.render(); this.pump(); }));
    }
    row.appendChild(btn('Masadan kalk', 'ghost', () => this.host.exit()));
    m.querySelector('.panel')!.appendChild(row);
    this.el.appendChild(m);
  }
}
