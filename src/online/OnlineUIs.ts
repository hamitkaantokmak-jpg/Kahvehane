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
