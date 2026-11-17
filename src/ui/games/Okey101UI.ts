/** 101 Okey arayüzü: per hazırlama (seri/çift), el açma, masaya per serme, taş işleme, ceza uyarıları, seri maç. */
import * as K from '../../games/okey101/okey101';
import { decideDraw101, stepTurn101 } from '../../games/okey101/okey101Bot';
import { createRng } from '../../games/common/rng';
import { Tile, isJoker, isPair } from '../../games/common/tiles';
import { GameHost, GameUI } from '../../tables/TableSession';
import { h, btn, later } from '../dom';
import { Rack, tileEl } from './TileView';

export class Okey101UI implements GameUI {
  readonly el: HTMLDivElement;
  s: K.Okey101State;
  private rng = createRng();
  rack = new Rack();
  private alive = true;
  private botTimer = 0;
  private status!: HTMLDivElement;
  private board!: HTMLDivElement;
  private tableEl!: HTMLDivElement;
  private stageEl!: HTMLDivElement;
  private btns!: HTMLDivElement;
  /** Hazırlanan perler (taş id grupları) */
  private staged: number[][] = [];

  constructor(private host: GameHost, hands: number, doubling = false) {
    this.el = h('div', 'gui okey okey101');
    this.s = K.newMatch101(this.rng, { hands, doubling }, 0);
    this.rack.multiSelect = true;
    this.board = h('div', 'okey-board compact');
    this.tableEl = h('div', 'meld-table');
    this.stageEl = h('div', 'stage');
    this.status = h('div', 'status');
    this.btns = h('div', 'gbtns');
    this.el.append(this.board, this.tableEl, this.stageEl, this.status, this.rack.el, this.btns);
    this.rack.onSelect = () => this.renderButtons();
    this.rack.onChange = () => this.sync3d();
    this.rack.sync(this.s.hands[0], this.s.ctx);
    this.rack.arrangeMelds(K.RULES_101);
    this.render();
    this.pump();
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

  private get myTurn() { return this.s.current === 0 && this.s.phase !== 'ended'; }

  // ------------------------------------------------------------ botlar
  private pump() {
    if (!this.alive || this.s.phase === 'ended' || this.host.isHuman(this.s.current)) return;
    // masadan kalkan (kavgadaki) oyuncu varsa bot sırası bekler
    if (this.host.paused) { clearTimeout(this.botTimer); this.botTimer = later(() => this.pump(), 600); return; }
    const p = this.s.current;
    if (this.botBusy) return;
    if (Math.random() < 0.3) this.host.react(p, 'think');
    clearTimeout(this.botTimer);
    this.botTimer = later(() => this.botTurn(p), 800 + Math.random() * 600);
  }

  private botBusy = false;

  private async botTurn(p: number) {
    if (!this.alive || this.s.current !== p || this.botBusy) return;
    this.botBusy = true;
    try { await this.botTurnInner(p); } finally { this.botBusy = false; }
    if (this.alive && this.s.phase !== 'ended') this.pump();
  }

  private async botTurnInner(p: number) {
    const s = this.s;
    try {
      if (s.phase === 'draw') {
        const d = decideDraw101(K.view101(s, p), this.host.difficulty);
        if (d === 'discard') K.drawDiscard101(s, p); else K.drawDeck101(s, p);
        this.host.sfx('tile');
        this.render();
      }
      // her eylemden sonra yeniden planla (aynı tur serilen perlere de işleyebilsin)
      for (let step = 0; step < 40 && s.current === p && s.phase === 'play'; step++) {
        const a = stepTurn101(K.view101(s, p), this.rng, this.host.difficulty);
        if (!a) { K.returnDiscard101(s, p); K.drawDeck101(s, p); continue; }
        await new Promise<void>((r) => (this.botTimer = later(() => r(), 650)));
        if (!this.alive) return;
        if (a.type === 'open') {
          const total = K.open101(s, p, a.mode, a.groups);
          this.host.react(p, 'goodMove', a.mode === 'pairs' ? 'Çiftten açtım!' : `${total} ile açtım!`);
          this.host.sfx('tableSlam');
        } else if (a.type === 'lay') { K.layMeld101(s, p, a.ids); this.host.sfx('tile'); }
        else if (a.type === 'add') { K.addToMeld101(s, p, a.tileId, a.meldId); this.host.sfx('tile'); }
        else if (a.type === 'swap') { K.swapJoker101(s, p, a.tileId, a.meldId); this.host.sfx('tile'); this.host.react(p, 'happy', 'Okeyi aldım!'); }
        else {
          const r = K.discard101(s, p, a.tileId);
          this.host.sfx('tile');
          if (r.penalty) this.host.react(p, 'angry', 'Eyvah, ceza yedim!');
        }
        this.render();
        if ((s.phase as string) === 'ended') break;
      }
    } catch (e) {
      console.warn('101 bot hatası', e);
      if (s.current === p && s.phase !== 'ended') {
        if (s.takenDiscard !== null && !s.actedThisTurn) { K.returnDiscard101(s, p); }
        if (s.phase === 'draw') K.drawDeck101(s, p);
        if (s.current === p && s.takenDiscard === null) K.discard101(s, p, s.hands[p][0].id);
      }
    }
    this.render();
    if (s.phase === 'ended') { this.onHandEnd(); return; }
    this.pump();
  }

  // ------------------------------------------------------------ insan
  private tilesOf(ids: number[]): Tile[] {
    return ids.map((id) => this.s.hands[0].find((t) => t.id === id)!).filter(Boolean);
  }

  private stageSelected() {
    const ids = [...this.rack.selected];
    if (!ids.length) { this.host.toast('Önce ıstakadan taş seç (tıklayarak).'); return; }
    const tiles = this.tilesOf(ids);
    const pairMode = this.s.opened[0] === 'pairs' || (this.s.opened[0] === 'none' && ids.length === 2);
    if (ids.length === 2 && pairMode) {
      if (!isPair(tiles[0], tiles[1], this.s.ctx)) { this.host.toast('Bu iki taş çift değil.'); return; }
    } else if (!K.checkMeld(tiles, this.s.ctx)) { this.host.toast('Geçersiz per: seri (aynı renk ardışık 3+) ya da grup (aynı sayı farklı renk 3-4) olmalı.'); return; }
    this.staged.push(ids);
    this.rack.selected.clear();
    this.host.sfx('click');
    this.render();
  }

  private stagedInfo() {
    let melds = 0, pairs = 0, value = 0;
    for (const g of this.staged) {
      const tiles = this.tilesOf(g);
      if (g.length === 2) { pairs++; value += K.pairValue(tiles[0], tiles[1], this.s.ctx); }
      else { melds++; value += K.checkMeld(tiles, this.s.ctx)?.value ?? 0; }
    }
    return { melds, pairs, value };
  }

  private commitStaged() {
    const s = this.s;
    if (!this.myTurn || s.phase !== 'play') { this.host.toast(s.phase === 'draw' ? 'Önce taş çek.' : 'Sıra sende değil.'); return; }
    if (!this.staged.length) return;
    const info = this.stagedInfo();
    try {
      if (s.opened[0] === 'none') {
        if (info.melds && info.pairs) { this.host.toast('Aynı anda hem seri hem çift açılamaz.'); return; }
        const mode = info.pairs ? 'pairs' : 'melds';
        const total = K.open101(s, 0, mode, this.staged);
        this.host.toast(mode === 'pairs' ? `${this.staged.length} çiftle açtın!` : `${total} ile açtın!`);
        this.host.react(0, 'slam');
        this.host.sfx('tableSlam');
      } else {
        for (const g of this.staged) K.layMeld101(s, 0, g);
        this.host.sfx('tile');
      }
      this.staged = [];
    } catch (e) {
      this.host.toast((e as Error).message);
    }
    this.after();
  }

  private addToMeld(meldId: number) {
    const s = this.s;
    const ids = [...this.rack.selected];
    if (!this.myTurn || s.phase !== 'play') return;
    if (ids.length !== 1) { this.host.toast('İşlemek için ıstakadan tek taş seç, sonra masadaki pere tıkla.'); return; }
    try {
      const meld = s.table.find((m) => m.id === meldId)!;
      const tile = s.hands[0].find((t) => t.id === ids[0])!;
      if (K.jokerSwapSlot(meld, tile, s.ctx) >= 0) {
        K.swapJoker101(s, 0, ids[0], meldId);
        this.host.sfx('tile');
        this.host.toast('Okeyi masadan aldın!');
        this.host.react(0, 'slam');
        this.rack.selected.clear();
        this.after();
        return;
      }
      K.addToMeld101(s, 0, ids[0], meldId);
      this.host.sfx('tile');
      this.rack.selected.clear();
    } catch (e) { this.host.toast((e as Error).message); }
    this.after();
  }

  private discard(id: number, confirmed = false) {
    const s = this.s;
    const err = K.canDiscard101(s, 0);
    if (err) { this.host.toast(err); return; }
    if (this.staged.some((g) => g.includes(id))) { this.host.toast('Bu taş hazırlanan perde.'); return; }
    const pen = K.discardPenalty(s, 0, id);
    const tile = s.hands[0].find((t) => t.id === id)!;
    if (pen && !confirmed) {
      const m = h('div', 'modal penalty-modal');
      m.innerHTML = `<div class="panel"><h3>⚠️ ${pen} ceza!</h3><p>${isJoker(tile, s.ctx) ? 'Okey atmak cezalıdır.' : 'Bu taş masadaki bir pere işlenebilir; atarsan ceza yazılır.'} Yine de atılsın mı?</p></div>`;
      const row = h('div', 'row-btns');
      row.appendChild(btn('Vazgeç', 'primary', () => m.remove()));
      row.appendChild(btn('Yine de at', 'danger', () => { m.remove(); this.discard(id, true); }));
      m.querySelector('.panel')!.appendChild(row);
      this.el.appendChild(m);
      return;
    }
    const r = K.discard101(s, 0, id);
    this.host.sfx('tile');
    if (r.penalty) this.host.toast(`+${r.penalty} ceza yazıldı!`);
    this.staged = [];
    this.rack.selected.clear();
    this.after();
  }

  private after() {
    this.staged = this.staged.filter((g) => g.every((id) => this.s.hands[0].some((t) => t.id === id)));
    this.rack.sync(this.s.hands[0], this.s.ctx);
    this.render();
    if (this.s.phase === 'ended') { this.onHandEnd(); return; }
    this.pump();
  }

  // ------------------------------------------------------------ çizim
  private sync3d() {
    const s = this.s;
    this.host.table3d.syncOkey({ hands: [s.hands[0]], handCounts: s.hands.map((x) => x.length), rackOrder: this.rack.slots, deckCount: s.deck.length, deckIds: s.deck.map((t) => t.id), indicator: s.indicator, ctx: s.ctx, discards: s.discards, melds: s.table.map((m) => ({ owner: m.owner, tiles: m.tiles })) });
  }

  private render() {
    this.sync3d();
    const s = this.s;
    const names = this.host.names;
    this.rack.disabledIds = new Set(this.staged.flat());
    this.rack.sync(s.hands[0], s.ctx);
    const openTxt = (o: K.OpenType) => (o === 'none' ? 'açmadı' : o === 'pairs' ? 'çift açtı' : 'açtı');
    this.board.innerHTML = '';
    const players = h('div', 'p101');
    for (let i = 1; i < 4; i++) {
      const d = h('div', `opp${s.current === i && s.phase !== 'ended' ? ' turn' : ''}`);
      const top = s.discards[i][s.discards[i].length - 1];
      d.innerHTML = `<div class="nm">${names[i]}</div><div class="meta">${s.hands[i].length} taş · ${openTxt(s.opened[i])} · ${s.totals[i]}</div>`;
      const pile = h('div', `pile mini${i === 3 && this.myTurn && s.phase === 'draw' && top ? ' clickable glow' : ''}`);
      if (top) pile.appendChild(tileEl(top, s.ctx, { small: true }));
      if (i === 3) pile.addEventListener('click', () => {
        if (!this.myTurn || s.phase !== 'draw' || !top) return;
        K.drawDiscard101(s, 0);
        this.host.sfx('tile');
        this.host.toast(s.opened[0] === 'none' ? 'Yerden aldın: bu tur bu taşla açmalısın!' : 'Yerden aldın: bu tur kullanmalısın!');
        this.after();
      });
      d.appendChild(pile);
      players.appendChild(d);
    }
    const center = h('div', 'ob-center');
    const deck = h('div', `deck${this.myTurn && s.phase === 'draw' ? ' clickable glow' : ''}`);
    deck.innerHTML = `<div class="tile back small"></div><div class="cnt">${s.deck.length}</div>`;
    deck.addEventListener('click', () => {
      if (!this.myTurn || s.phase !== 'draw') return;
      const t = K.drawDeck101(s, 0);
      this.rack.highlight = t.id;
      this.host.sfx('tile');
      this.after();
    });
    const ind = h('div', 'indicator');
    ind.appendChild(tileEl(s.indicator, null, { small: true }));
    center.append(deck, ind);
    const mine = h('div', `pile mini p-mine drop`);
    const myTop = s.discards[0][s.discards[0].length - 1];
    if (myTop) mine.appendChild(tileEl(myTop, s.ctx, { small: true }));
    mine.appendChild(h('div', 'pl', 'At'));
    players.append(center, mine);
    this.board.appendChild(players);
    this.rack.dropTargets = [{ el: mine, onDrop: (id) => this.discard(id), accept: () => this.myTurn && s.phase === 'play' }];

    // masadaki perler
    this.tableEl.innerHTML = '';
    if (!s.table.length) this.tableEl.appendChild(h('div', 'muted', 'Masada henüz açılmış per yok. Açmak için 101 puan ya da 5 çift gerekir.'));
    for (const m of s.table) {
      const md = h('div', `meld ${m.kind}${this.myTurn && s.opened[0] !== 'none' && this.rack.selected.size === 1 && m.kind !== 'pair' ? ' target' : ''}`);
      md.title = `${names[m.owner]} — tıkla: seçili taşı işle`;
      md.appendChild(h('span', 'owner', names[m.owner].split(' ')[0]));
      for (const t of m.tiles) md.appendChild(tileEl(t, s.ctx, { small: true }));
      md.addEventListener('click', () => this.addToMeld(m.id));
      this.tableEl.appendChild(md);
    }
    // hazırlık alanı
    this.stageEl.innerHTML = '';
    if (this.staged.length) {
      const info = this.stagedInfo();
      const wrap = h('div', 'staged-list');
      this.staged.forEach((g, gi) => {
        const gd = h('div', 'meld staged');
        for (const t of this.tilesOf(g)) gd.appendChild(tileEl(t, s.ctx, { small: true }));
        gd.appendChild(btn('✕', 'x', () => { this.staged.splice(gi, 1); this.render(); }));
        wrap.appendChild(gd);
      });
      const need = s.opened[0] === 'none' ? (info.pairs ? `${info.pairs}/${K.pairMin(s)} çift` : `${info.value}/${K.openMin(s)}`) : `${this.staged.length} per`;
      this.stageEl.append(h('div', `stage-sum${s.opened[0] === 'none' && (info.value >= K.openMin(s) || info.pairs >= K.pairMin(s)) ? ' ok' : ''}`, `Hazırlanan: <b>${need}</b>`), wrap);
    }
    let msg: string;
    if (s.phase === 'ended') msg = 'El bitti.';
    else if (s.current === 0) {
      if (s.phase === 'draw') msg = '🟢 Desteden ya da solundaki taşı çek.';
      else if (s.takenDiscard !== null) msg = '🟡 Yerden aldığın taşı kullan (per hazırla + aç/ser) ya da "Geri koy".';
      else if (s.opened[0] === 'none') msg = '🟢 Perleri seçip "Per hazırla" ile ekle, 101\'e ulaşınca "Aç". Ya da bir taş at.';
      else msg = '🟢 Per ser, masadaki perlere taş işle (taş seç → pere tıkla), sonra bir taş at.';
    } else msg = `⏳ ${names[s.current]} oynuyor...`;
    this.status.innerHTML = `${msg} <span class="hand-no">El ${s.handNo}/${s.options.hands}${s.options.doubling ? ` · Açış: ${K.openMin(s)} / ${K.pairMin(s)} çift` : ''} · Toplam: ${s.totals[0]}${s.penalties[0] ? ` · Ceza: ${s.penalties[0]}` : ''}</span>`;
    this.renderButtons();
  }

  private renderButtons() {
    const s = this.s;
    this.btns.innerHTML = '';
    const play = this.myTurn && s.phase === 'play';
    const sel = [...this.rack.selected];
    this.btns.appendChild(btn('Seri diz', 'small', () => this.rack.arrangeMelds(K.RULES_101)));
    this.btns.appendChild(btn('Çift diz', 'small', () => this.rack.arrangePairs()));
    this.btns.appendChild(btn('+ Per hazırla', play && sel.length >= 2 ? 'small accent' : 'small disabled', () => this.stageSelected()));
    if (this.staged.length) {
      const info = this.stagedInfo();
      const label = s.opened[0] === 'none' ? (info.pairs ? 'Çift aç' : 'Aç') : 'Ser';
      const ok = s.opened[0] !== 'none' || info.value >= K.openMin(s) || info.pairs >= K.pairMin(s);
      this.btns.appendChild(btn(`${label} ✔`, play && ok ? 'primary glow' : 'primary disabled', () => this.commitStaged()));
    }
    this.btns.appendChild(btn('At', play && sel.length === 1 ? 'primary' : 'primary disabled', () => sel.length === 1 && this.discard(sel[0])));
    if (play && s.takenDiscard !== null && !s.actedThisTurn) this.btns.appendChild(btn('Geri koy', 'small', () => { K.returnDiscard101(s, 0); this.after(); }));
    this.btns.appendChild(btn('Kalk', 'ghost small', () => this.host.exit()));
  }

  private onHandEnd() {
    const s = this.s;
    const r = s.result!;
    const names = this.host.names;
    if (r.winner !== null) this.host.react(r.winner, 'win');
    const m = h('div', 'modal');
    let rows = '';
    for (let i = 0; i < 4; i++) rows += `<tr class="${i === r.winner ? 'win' : ''}"><td>${names[i]}</td><td>${s.opened[i] === 'none' ? 'açmadı' : s.opened[i] === 'pairs' ? 'çift' : 'seri'}</td><td>${r.points[i] > 0 ? '+' : ''}${r.points[i]}</td><td><b>${s.totals[i]}</b></td></tr>`;
    const extras = [r.elden ? 'ELDEN bitti (×2)' : '', r.okeyFinish ? 'OKEY atarak bitti (×2)' : ''].filter(Boolean).join(' · ');
    const title = r.winner === null ? 'Deste bitti' : r.winner === 0 ? '🎉 Eli sen bitirdin!' : `${names[r.winner]} eli bitirdi!`;
    const mw = K.matchWinner101(s);
    m.innerHTML = `<div class="panel"><h3>${title}</h3>${extras ? `<p class="accent-txt">${extras}</p>` : ''}
      <table class="score"><tr><th>Oyuncu</th><th>Durum</th><th>Bu el</th><th>Toplam</th></tr>${rows}</table>
      <p class="muted">Düşük puan iyidir. El ${s.handNo}/${s.options.hands}</p>
      ${s.matchOver ? `<h3>${mw === 0 ? '🏆 Seriyi KAZANDIN!' : `🏆 Seriyi ${names[mw]} kazandı`}</h3>` : ''}</div>`;
    const row = h('div', 'row-btns');
    if (!s.matchOver) row.appendChild(btn('Sonraki el ▶', 'primary', () => { m.remove(); K.nextHand101(s, this.rng); this.staged = []; this.rack.slots.fill(null); this.rack.sync(s.hands[0], s.ctx); this.rack.arrangeMelds(K.RULES_101); this.render(); this.host.sfx('deal'); this.pump(); }));
    else {
      this.host.matchFinished(mw === 0);
      row.appendChild(btn('Yeni seri', 'primary', () => { m.remove(); this.s = K.newMatch101(this.rng, s.options, 0); this.staged = []; this.rack.slots.fill(null); this.rack.sync(this.s.hands[0], this.s.ctx); this.rack.arrangeMelds(K.RULES_101); this.render(); this.pump(); }));
    }
    row.appendChild(btn('Masadan kalk', 'ghost', () => this.host.exit()));
    m.querySelector('.panel')!.appendChild(row);
    this.el.appendChild(m);
  }
}
