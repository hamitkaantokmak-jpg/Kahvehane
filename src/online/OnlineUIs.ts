/**
 * Çevrimiçi oyun arayüzleri: yerel arayüzlerin (Batak, King, Pişti) aynısı; tek fark hamleler sunucuya gider,
 * yerel botlar susar ve durum sunucudan gelir (gizli bilgisi çıkarılmış, "ben = 0" olacak şekilde döndürülmüş).
 */
import { BatakUI } from '../ui/games/BatakUI';
import { KingUI } from '../ui/games/KingUI';
import { PistiUI } from '../ui/games/PistiUI';
import type { BatakState, BatakOptions } from '../games/batak/batak';
import type { KingState, KingOptions, Contract } from '../games/king/king';
import type { PistiState, PistiOptions } from '../games/pisti/pisti';
import type { Suit } from '../games/trick/trick';
import { OkeyUI } from '../ui/games/OkeyUI';
import { Okey101UI } from '../ui/games/Okey101UI';
import { TavlaUI } from '../ui/games/TavlaUI';
import * as O from '../games/okey/okey';
import * as K from '../games/okey101/okey101';
import * as V from '../games/tavla/tavla';
import { isJoker } from '../games/common/tiles';
import type { GameHost, GameUI } from '../tables/TableSession';
import type { GameAction, GameEvent } from './protocol';

export interface NetHooks {
  act(a: GameAction): void;
  next(): void;
  toLobby(): void;
}

export interface NetUI extends GameUI {
  applyServer(view: unknown, ev: GameEvent | null): void;
}

const handNo = (s: { handNo: number }) => s.handNo;

function clearModals(el: HTMLElement) { el.querySelectorAll('.modal').forEach((m) => m.remove()); }

export class OnlineBatakUI extends BatakUI implements NetUI {
  constructor(host: GameHost, opts: BatakOptions, private net: NetHooks) {
    super(host, opts);
    this.newMatchLabel = 'Lobiye dön';
  }
  protected botToAct() { return null; }
  protected doBid(b: number | 'pass') { this.net.act({ k: 'bid', b }); }
  protected doTrump(su: Suit) { this.net.act({ k: 'trump', suit: su }); }
  protected humanPlay(id: number) { this.net.act({ k: 'play', id }); }
  protected onNextHand() { this.net.next(); this.host.toast('Diğerleri bekleniyor...'); }
  protected onNewMatch() { this.net.toLobby(); }
  applyServer(view: unknown, ev: GameEvent | null) {
    const v = view as BatakState;
    if (handNo(v) !== handNo(this.s)) clearModals(this.el);
    this.s = v;
    if (ev && ev.seat !== 0) this.host.sfx(ev.action.k === 'play' ? 'card' : 'click');
    if (ev?.trickDone && ev.winner !== undefined && ev.winner !== null && ev.winner !== 0 && Math.random() < 0.2) this.host.react(ev.winner, 'goodMove');
    this.after(!!ev?.trickDone);
  }
}

export class OnlineKingUI extends KingUI implements NetUI {
  constructor(host: GameHost, opts: KingOptions, private net: NetHooks) {
    super(host, opts);
    this.newMatchLabel = 'Lobiye dön';
  }
  protected botToAct() { return null; }
  protected doContract(c: Contract) { this.net.act({ k: 'contract', c }); }
  protected doTrump(su: Suit) { this.net.act({ k: 'trump', suit: su }); }
  protected humanPlay(id: number) { this.net.act({ k: 'play', id }); }
  protected onNextHand() { this.net.next(); this.host.toast('Diğerleri bekleniyor...'); }
  protected onNewMatch() { this.net.toLobby(); }
  applyServer(view: unknown, ev: GameEvent | null) {
    const v = view as KingState;
    if (handNo(v) !== handNo(this.s)) clearModals(this.el);
    this.s = v;
    if (ev && ev.seat !== 0) this.host.sfx(ev.action.k === 'play' ? 'card' : 'click');
    this.after(!!ev?.trickDone);
  }
}

export class OnlinePistiUI extends PistiUI implements NetUI {
  private endShown = false;
  constructor(host: GameHost, opts: PistiOptions, private net: NetHooks) {
    super(host, opts);
    this.newMatchLabel = 'Lobiye dön';
  }
  protected pump() { /* botlar sunucuda */ }
  protected play(p: number, cardId: number) { if (p === 0 && !this.busy) this.net.act({ k: 'play', id: cardId }); }
  protected onNextHand() { this.net.next(); this.host.toast('Diğerleri bekleniyor...'); }
  protected onNewMatch() { this.net.toLobby(); }
  applyServer(view: unknown, ev: GameEvent | null) {
    const v = view as PistiState;
    if (handNo(v) !== handNo(this.s)) { clearModals(this.el); this.host.table3d.clear(); this.host.sfx('deal'); this.endShown = false; }
    this.s = v;
    if (ev && ev.action.k === 'play') this.host.sfx('card');
    if (ev?.pisti) { this.splash(ev.pisti === 20 ? 'ÇİFT PİŞTİ! +20' : 'PİŞTİ! +10'); this.host.sfx('pisti'); }
    this.render(ev?.trickDone && ev.winner !== null && ev.winner !== undefined ? ev.winner : undefined);
    if (v.phase !== 'play' && !this.endShown) {
      this.endShown = true;
      this.timer = window.setTimeout(() => this.onHandEnd(), 900);
    }
  }
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

// ---------------------------------------------------------------- okey
export class OnlineOkeyUI extends OkeyUI implements NetUI {
  private endShown = false;
  /** ilk sunucu durumu geldi mi (yerel taslak elin yerine geçer) */
  private got = false;
  constructor(host: GameHost, private net: NetHooks) {
    super(host);
    this.newMatchLabel = 'Lobiye dön';
  }
  protected pump() { /* botlar sunucuda */ }
  protected drawDeck() { if (this.myTurn() && this.s.phase === 'draw') this.net.act({ k: 'draw', from: 'deck' }); }
  protected drawLeft() { if (this.myTurn() && O.canTakeDiscard(this.s, 0)) this.net.act({ k: 'draw', from: 'left' }); }
  protected discard(id: number) {
    if (!this.myTurn() || this.s.phase !== 'discard') { this.host.toast(this.s.phase === 'draw' ? 'Önce taş çek (desteden ya da soldan).' : 'Sıra sende değil.'); return; }
    const t = this.s.hands[0].find((x) => x.id === id);
    if (t && isJoker(t, this.s.ctx)) this.host.toast('Okey attın! Rakipler buna çok sevinir.');
    this.rack.selected.clear();
    this.net.act({ k: 'discard', id });
  }
  protected finish(id: number) {
    if (!this.myTurn() || this.s.phase !== 'discard') return;
    if (!O.canFinishWith(this.s, 0, id)) { this.host.toast('Bu taşı atınca el bitmiyor. Perlerini kontrol et.'); return; }
    this.net.act({ k: 'finish', id });
  }
  protected doIndicator() { this.net.act({ k: 'indicator' }); }
  protected onNextHand() { this.net.next(); this.host.toast('Diğerleri bekleniyor...'); }
  protected onNewMatch() { this.net.toLobby(); }
  applyServer(view: unknown, ev: GameEvent | null) {
    const v = view as O.OkeyState;
    const fresh = !this.got || v.handNo !== this.s.handNo;
    this.got = true;
    if (fresh) { clearModals(this.el); this.endShown = false; this.host.sfx('deal'); }
    this.s = v;
    if (fresh) this.resetRack();
    if (ev && ev.seat === 0 && ev.action.k === 'draw') this.rack.highlight = v.lastDrawn;
    if (ev && ev.seat !== 0) {
      const k = ev.action.k;
      if (k === 'finish') { this.host.sfx('tableSlam'); this.host.react(ev.seat, 'win'); }
      else if (k === 'indicator') { this.host.sfx('tile'); this.host.react(ev.seat, 'happy', 'Gösterge bende!'); }
      else { this.host.sfx('tile'); if (k === 'draw' && (ev.action as { from: string }).from === 'left' && Math.random() < 0.3) this.host.react(ev.seat, 'goodMove'); }
    } else if (ev?.action.k === 'finish') { this.host.sfx('tableSlam'); this.host.react(0, 'slam'); }
    this.rack.sync(v.hands[0], v.ctx);
    this.render();
    if (v.phase === 'ended' && !this.endShown) { this.endShown = true; this.onHandEnd(); }
  }
}

// ---------------------------------------------------------------- 101
export class OnlineOkey101UI extends Okey101UI implements NetUI {
  private endShown = false;
  private got = false;
  constructor(host: GameHost, hands: number, doubling: boolean, private net: NetHooks) {
    super(host, hands, doubling);
    this.newMatchLabel = 'Lobiye dön';
  }
  protected pump() { /* botlar sunucuda */ }
  protected drawDeck() { if (this.myTurn && this.s.phase === 'draw') this.net.act({ k: 'draw', from: 'deck' }); }
  protected drawLeft() {
    const s = this.s;
    if (!this.myTurn || s.phase !== 'draw' || !s.discards[3].length) return;
    this.host.toast(s.opened[0] === 'none' ? 'Yerden aldın: bu tur bu taşla açmalısın!' : 'Yerden aldın: bu tur kullanmalısın!');
    this.net.act({ k: 'draw', from: 'left' });
  }
  /** Hazırlanan perleri önce yerel kopyada dene (hata mesajı anında), sonra sunucuya yolla */
  protected commitStaged() {
    const s = this.s;
    if (!this.myTurn || s.phase !== 'play') { this.host.toast(s.phase === 'draw' ? 'Önce taş çek.' : 'Sıra sende değil.'); return; }
    if (!this.staged.length) return;
    const info = this.stagedInfo();
    const groups = this.staged.map((g) => [...g]);
    try {
      const t = clone(s);
      if (s.opened[0] === 'none') {
        if (info.melds && info.pairs) { this.host.toast('Aynı anda hem seri hem çift açılamaz.'); return; }
        const mode = info.pairs ? 'pairs' : 'melds';
        const total = K.open101(t, 0, mode, groups);
        this.net.act({ k: 'open', mode, groups });
        this.host.toast(mode === 'pairs' ? `${groups.length} çiftle açtın!` : `${total} ile açtın!`);
        this.host.react(0, 'slam');
        this.host.sfx('tableSlam');
      } else {
        for (const g of groups) K.layMeld101(t, 0, g);
        for (const g of groups) this.net.act({ k: 'lay', ids: g });
      }
    } catch (e) { this.host.toast((e as Error).message); }
  }
  protected addToMeld(meldId: number) {
    const s = this.s;
    const ids = [...this.rack.selected];
    if (!this.myTurn || s.phase !== 'play') return;
    if (ids.length !== 1) { this.host.toast('İşlemek için ıstakadan tek taş seç, sonra masadaki pere tıkla.'); return; }
    const meld = s.table.find((m) => m.id === meldId);
    const tile = s.hands[0].find((t) => t.id === ids[0]);
    if (!meld || !tile) return;
    const swap = K.jokerSwapSlot(meld, tile, s.ctx) >= 0;
    try {
      const t = clone(s);
      if (swap) K.swapJoker101(t, 0, ids[0], meldId); else K.addToMeld101(t, 0, ids[0], meldId);
    } catch (e) { this.host.toast((e as Error).message); return; }
    this.rack.selected.clear();
    this.net.act(swap ? { k: 'swap', id: ids[0], meld: meldId } : { k: 'add', id: ids[0], meld: meldId });
    if (swap) this.host.toast('Okeyi masadan aldın!');
  }
  protected sendDiscard(id: number) { this.rack.selected.clear(); this.net.act({ k: 'discard', id }); }
  protected doReturn() { this.net.act({ k: 'return' }); }
  protected onNextHand() { this.net.next(); this.host.toast('Diğerleri bekleniyor...'); }
  protected onNewMatch() { this.net.toLobby(); }
  applyServer(view: unknown, ev: GameEvent | null) {
    const v = view as K.Okey101State;
    const fresh = !this.got || v.handNo !== this.s.handNo;
    this.got = true;
    if (fresh) { clearModals(this.el); this.endShown = false; this.host.sfx('deal'); }
    this.s = v;
    if (fresh) this.resetRack();
    if (ev) {
      const k = ev.action.k;
      if (ev.seat === 0 && k === 'draw') { const last = v.hands[0][v.hands[0].length - 1]; if (last) this.rack.highlight = last.id; }
      if (k === 'open') { this.host.sfx('tableSlam'); if (ev.seat !== 0) this.host.react(ev.seat, 'goodMove', 'Açtım!'); }
      else if (k === 'swap') { this.host.sfx('tile'); if (ev.seat !== 0) this.host.react(ev.seat, 'happy', 'Okeyi aldım!'); }
      else if (ev.seat !== 0) this.host.sfx('tile');
      if (ev.penalty) { if (ev.seat === 0) this.host.toast(`+${ev.penalty} ceza yazıldı!`); else this.host.react(ev.seat, 'angry', 'Eyvah, ceza yedim!'); }
      if (k === 'discard' && ev.seat === 0) this.staged = [];
    }
    this.after();
  }
  protected after() {
    this.staged = this.staged.filter((g) => g.every((id) => this.s.hands[0].some((t) => t.id === id)));
    this.rack.sync(this.s.hands[0], this.s.ctx);
    this.render();
    if (this.s.phase === 'ended' && !this.endShown) { this.endShown = true; this.onHandEnd(); }
  }
}

// ---------------------------------------------------------------- tavla
export class OnlineTavlaUI extends TavlaUI implements NetUI {
  private endShown = false;
  private endT = 0;
  constructor(host: GameHost, opts: V.TavlaOptions, private net: NetHooks) {
    super(host, opts);
    this.newMatchLabel = 'Lobiye dön';
  }
  protected next() { this.render(); }
  protected async botTurn() { /* botlar sunucuda */ }
  protected openingRoll() { if (this.s.phase === 'opening') { this.host.sfx('dice'); this.net.act({ k: 'opening' }); } }
  protected roll() {
    if (this.rolling || this.s.phase !== 'roll' || this.s.current !== 0) return;
    this.rolling = true;
    this.host.sfx('dice');
    this.net.act({ k: 'roll' });
  }
  protected undo() { if (this.s.current === 0 && this.s.phase === 'move' && this.s.turnMoves.length) { this.sel = null; this.net.act({ k: 'undo' }); } }
  protected doMove(from: V.From, to: V.To) {
    this.sel = null;
    if (!V.legalMoves(this.s).some((m) => m.from === from && m.to === to)) { this.host.toast('Geçersiz hamle.'); this.render(); return; }
    this.net.act({ k: 'move', from, to });
  }
  protected onNextHand() { this.net.next(); this.host.toast('Rakip bekleniyor...'); }
  protected onNewMatch() { this.net.toLobby(); }
  destroy() { clearTimeout(this.endT); super.destroy(); }
  applyServer(view: unknown, ev: GameEvent | null) {
    const v = view as V.TavlaState;
    const fresh = v.gameNo !== this.s.gameNo;
    if (fresh) { clearModals(this.el); this.endShown = false; }
    this.s = v;
    this.rolling = false;
    if (ev) {
      const k = ev.action.k;
      if (k === 'opening' && v.openingRolls) {
        const [a, b] = v.openingRolls;
        if (ev.seat !== 0) this.host.sfx('dice');
        this.host.toast(`Açılış: Sen ${a} — ${this.host.names[1]} ${b}. ${a > b ? 'Sen başlıyorsun!' : `${this.host.names[1]} başlıyor.`}`);
      } else if (k === 'roll') {
        if (ev.seat !== 0) this.host.sfx('dice');
        if (v.dice[0] === v.dice[1]) { if (ev.seat === 0) this.host.toast(`Çift ${v.dice[0]}! Dört hamle.`); else if (Math.random() < 0.6) this.host.react(1, 'happy', `Çift ${v.dice[0]}! Gördün mü?`); }
      } else if (k === 'move') {
        this.host.sfx(ev.hit ? 'slap' : 'tile');
        if (ev.hit) {
          if (ev.seat === 0) { this.host.react(1, 'angry', 'Kırdın pulumu!'); this.host.react(0, 'slam'); }
          else { this.host.react(1, 'goodMove', 'Kırdım! Bara!'); this.host.react(0, 'surprise'); }
        }
      }
    }
    // zar geldi ama oynanacak hamle yok: biraz gösterip sırayı devret
    clearTimeout(this.endT);
    if (v.current === 0 && v.phase === 'move' && v.remaining.length === 0) {
      if (ev?.action.k === 'roll') this.host.toast('Oynanacak hamle yok, sıra geçiyor.');
      this.endT = window.setTimeout(() => { if (this.s.phase === 'move' && this.s.current === 0) this.net.act({ k: 'end' }); }, 1200);
    }
    this.render();
    if ((v.phase === 'gameOver' || v.phase === 'matchOver') && !this.endShown) {
      this.endShown = true;
      this.timer = window.setTimeout(() => this.onGameEnd(), 600);
    }
  }
}
