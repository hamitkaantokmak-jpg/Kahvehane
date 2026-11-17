/**
 * Ekonomi durumunu tutan ince katman: saf işlemleri çağırır, her değişiklikte kaydeder ve dinleyiciye bildirir.
 * (DOM/three.js yok; HUD bağlantısı Game içinde.)
 */
import * as E from './Economy';
import * as B from './Betting';
import type { EconomyStore } from './store';
import type { Rng } from '../games/common/rng';

export type MoneyListener = (balance: number, debt: number, delta: number) => void;

export class EconomyController {
  s: E.EconomyState;
  private listeners: MoneyListener[] = [];

  constructor(private store: EconomyStore, npcIds: string[]) {
    this.s = store.load(npcIds);
  }

  onChange(l: MoneyListener) { this.listeners.push(l); l(this.balance, this.debt, 0); }
  get balance() { return E.balanceOf(this.s, E.PLAYER); }
  get debt() { return E.totalDebt(this.s); }

  private commit(before: number) {
    this.store.save(this.s);
    const delta = this.balance - before;
    for (const l of this.listeners) l(this.balance, this.debt, delta);
  }

  /** Değişiklik uygulayan bir işlemi sarar: kaydeder ve dinleyicileri çağırır */
  tx<T>(fn: (s: E.EconomyState) => T): T {
    const before = this.balance;
    const r = fn(this.s);
    this.commit(before);
    return r;
  }

  buy(item: E.Item, allowCredit = true) { return this.tx((s) => E.buy(s, item, allowCredit)); }
  price(item: E.Item) { return E.price(this.s, item); }
  payDebt() { return this.tx((s) => E.payDebt(s)); }
  work() { return this.tx((s) => E.workShift(s)); }
  claimDaily(day: number) { return this.tx((s) => E.claimDaily(s, day)); }
  maybeRaise(rng: Rng) { return this.tx((s) => E.maybeRaise(s, rng)); }
  settle(outcome: B.Outcome | null, stakeTeas: number, ids: string[]) {
    return this.tx((s) => B.applyTransfers(s, B.settle(outcome, stakeTeas, ids)));
  }
  get broke() { return E.isBroke(this.s); }
  get overLimit() { return E.overDebtLimit(this.s); }
  npcBalance(id: string) { return E.balanceOf(this.s, id); }

  update(dt: number): { raiseEnded: boolean } {
    const was = this.s.pricing.multiplier;
    E.updateEconomy(this.s, dt);
    const ended = was > 1 && this.s.pricing.multiplier === 1;
    if (ended) this.commit(this.balance);
    return { raiseEnded: ended };
  }
}
