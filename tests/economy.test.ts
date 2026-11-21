import { describe, it, expect } from 'vitest';
import * as E from '../src/economy/Economy';
import * as B from '../src/economy/Betting';
import { MemoryEconomyStore, LocalEconomyStore } from '../src/economy/store';
import { createRng } from '../src/games/common/rng';

const ids4 = ['player', 'riza', 'cemal', 'nihat'];

describe('Ekonomi: cüzdan, fiyat, veresiye', () => {
  it('başlangıç bakiyeleri ve satın alma', () => {
    const s = E.newEconomy(['riza']);
    expect(E.balanceOf(s, 'player')).toBe(E.START_BALANCE);
    expect(E.balanceOf(s, 'riza')).toBe(E.NPC_START);
    const r = E.buy(s, 'tea');
    expect(r.ok && r.paid).toBe(5);
    expect(E.balanceOf(s, 'player')).toBe(E.START_BALANCE - 5);
    expect(() => E.credit(s, 'player', -1)).toThrow();
  });

  it('para yetmezse veresiyeye yazılır, sınır aşılamaz', () => {
    const s = E.newEconomy();
    s.balances.player = 3;
    const r = E.buy(s, 'tea');
    expect(r).toMatchObject({ ok: true, paid: 3, onCredit: 2 });
    expect(E.totalDebt(s)).toBe(2);
    // sınıra kadar veresiye
    for (let i = 0; i < 7; i++) expect(E.buy(s, 'tea').ok).toBe(true); // 2 + 35 = 37
    expect(E.totalDebt(s)).toBe(37);
    const no = E.buy(s, 'tea'); // 42 > 40
    expect(no.ok).toBe(false);
    expect(E.totalDebt(s)).toBe(37);
    expect(E.buy(s, 'tea', false).ok).toBe(false);
  });

  it('borç ödeme önce kahvehaneye', () => {
    const s = E.newEconomy(['riza']);
    s.debts = { sukru: 10, riza: 20 };
    s.balances.player = 15;
    expect(E.payDebt(s)).toBe(15);
    expect(s.debts).toEqual({ riza: 15 });
    expect(E.balanceOf(s, 'riza')).toBe(E.NPC_START + 5);
  });

  it('Şükrü zammı deterministik, süresi bitince fiyat normale döner', () => {
    const a = E.newEconomy(), b = E.newEconomy();
    const ra = createRng(4), rb = createRng(4);
    const seqA = Array.from({ length: 20 }, () => E.maybeRaise(a, ra, 0.5));
    const seqB = Array.from({ length: 20 }, () => E.maybeRaise(b, rb, 0.5));
    expect(seqA).toEqual(seqB);
    const s = E.newEconomy();
    expect(E.maybeRaise(s, () => 0.1)).toBe(true);
    expect(s.pricing.multiplier).toBeGreaterThan(1);
    expect(E.price(s, 'tea')).toBeGreaterThan(5);
    expect(E.maybeRaise(s, () => 0)).toBe(false); // zam sürerken yeni zam yok
    E.updateEconomy(s, 1000);
    expect(E.price(s, 'tea')).toBe(5);
  });

  it('günlük bonus: aynı gün bir kez', () => {
    const s = E.newEconomy();
    const day = E.dayNumber(Date.UTC(2026, 10, 17, 12));
    expect(E.claimDaily(s, day)).toBe(E.DAILY_BONUS);
    expect(E.claimDaily(s, day)).toBe(0);
    expect(E.claimDaily(s, day + 1)).toBe(E.DAILY_BONUS);
    expect(E.balanceOf(s, 'player')).toBe(E.START_BALANCE + 2 * E.DAILY_BONUS);
    // saat dilimi: UTC+3'te gece yarısı
    expect(E.dayNumber(Date.UTC(2026, 10, 17, 22), -180)).toBe(E.dayNumber(Date.UTC(2026, 10, 18, 1)));
  });

  it('iflas koruması: bulaşık işi önce borcu düşer, bekleme süresi var, oyuncu atılmaz', () => {
    const s = E.newEconomy();
    s.balances.player = 0;
    s.debts = { sukru: E.DEBT_LIMIT };
    expect(E.isBroke(s)).toBe(true);
    const w = E.workShift(s)!;
    expect(w.toDebt).toBe(E.WORK_PAY);
    expect(s.debts.sukru).toBe(E.DEBT_LIMIT - E.WORK_PAY);
    expect(E.workShift(s)).toBe(null);
    E.updateEconomy(s, E.WORK_COOLDOWN);
    s.debts = {};
    E.workShift(s);
    expect(E.balanceOf(s, 'player')).toBe(E.WORK_PAY);
    expect(E.isBroke(s)).toBe(false);
  });

  it('kalıcılık: kaydet/yükle ve eski kaydı tamamlama', () => {
    const st = new MemoryEconomyStore();
    const s = st.load(['riza']);
    s.balances.player = 42;
    s.debts.sukru = 7;
    st.save(s);
    const s2 = st.load(['riza', 'cemal']);
    expect(s2.balances.player).toBe(42);
    expect(s2.debts.sukru).toBe(7);
    expect(s2.balances.cemal).toBe(E.NPC_START); // yeni NPC eklenir
    const fake: Record<string, string> = { 'kahvehane.economy.v1': '{"balances":{"player":9}}' };
    const ls = new LocalEconomyStore({ getItem: (k) => fake[k] ?? null, setItem: (k, v) => { fake[k] = v; } });
    const s3 = ls.load([]);
    expect(s3.balances.player).toBe(9);
    expect(s3.stats.spent).toBe(0);
    const broken = new LocalEconomyStore({ getItem: () => '{bozuk', setItem: () => {} });
    expect(broken.load([]).balances.player).toBe(E.START_BALANCE);
  });
});

describe('Bahis hesapları', () => {
  it('okey: en düşük puanlı öder, en yüksek alır', () => {
    const t = B.settle(B.okeyOutcome([20, 2, 14, 10]), 5, ids4);
    expect(t).toEqual([{ from: 'riza', to: 'player', amount: 25 }]);
    expect(B.okeyOutcome([5, 5, 5, 5])).toBe(null);
    // eşit kaybedenler ayrı ayrı öder
    const t2 = B.settle(B.okeyOutcome([20, 0, 0, 10]), 3, ids4);
    expect(t2.map((x) => x.from)).toEqual(['riza', 'cemal']);
    expect(t2.every((x) => x.to === 'player' && x.amount === 15)).toBe(true);
  });

  it('101: en yüksek toplam öder, en düşük alır', () => {
    const t = B.settle(B.okey101Outcome([-101, 404, 50, 202]), 10, ids4);
    expect(t).toEqual([{ from: 'riza', to: 'player', amount: 50 }]);
  });

  it('tavla: normal 1×, mars 2×, katmerli mars 3×', () => {
    const ids = ['player', 'cemal'];
    expect(B.settle(B.tavlaOutcome(0, 'normal'), 3, ids)).toEqual([{ from: 'cemal', to: 'player', amount: 15 }]);
    expect(B.settle(B.tavlaOutcome(0, 'mars'), 3, ids)[0].amount).toBe(30);
    expect(B.settle(B.tavlaOutcome(1, 'katmerli'), 3, ids)).toEqual([{ from: 'player', to: 'cemal', amount: 45 }]);
  });

  it('pişti: 2 kişide kaybeden, 4 kişide kaybeden takımın her üyesi öder; kazanana bölünür', () => {
    expect(B.settle(B.pistiOutcome([40, 160], 2), 5, ['player', 'nihat'])).toEqual([{ from: 'player', to: 'nihat', amount: 25 }]);
    const t = B.settle(B.pistiOutcome([160, 40], 4), 5, ids4);
    // kaybeden taraf 1 (riza, nihat) → kazanan taraf 0 (player, cemal), her biri 25'i ikiye böler
    expect(t).toEqual([
      { from: 'riza', to: 'player', amount: 13 }, { from: 'riza', to: 'cemal', amount: 12 },
      { from: 'nihat', to: 'player', amount: 13 }, { from: 'nihat', to: 'cemal', amount: 12 },
    ]);
    expect(B.pistiOutcome([50, 50], 4)).toBe(null);
  });

  it('batak ve king: en düşük toplam öder, en yüksek alır; eşli batakta ortaklar birlikte', () => {
    expect(B.kingOutcome([650, -320, -1200, 100])).toEqual({ payers: [2], winners: [0], multiplier: 1 });
    expect(B.batakOutcome([12, 5, 3, 9])).toEqual({ payers: [2], winners: [0], multiplier: 1 });
    expect(B.batakOutcome([14, -7, 14, -7])).toEqual({ payers: [1, 3], winners: [0, 2], multiplier: 1 });
    expect(B.kingOutcome([0, 0, 0, 0])).toBe(null);
  });

  it('bahis yoksa transfer yok', () => {
    expect(B.settle(B.okeyOutcome([20, 2, 14, 10]), 0, ids4)).toEqual([]);
  });

  it('transfer uygulama: NPC elindekini öder, oyuncunun eksiği alacaklıya veresiye yazılır', () => {
    const s = E.newEconomy(['riza', 'cemal']);
    s.balances.riza = 10;
    const r1 = B.applyTransfers(s, [{ from: 'riza', to: 'player', amount: 25 }]);
    expect(r1[0].amount).toBe(10);
    expect(E.balanceOf(s, 'riza')).toBe(0);
    expect(E.balanceOf(s, 'player')).toBe(E.START_BALANCE + 10);
    s.balances.player = 5;
    s.debts = { sukru: 39 };
    const r2 = B.applyTransfers(s, [{ from: 'player', to: 'cemal', amount: 45 }]);
    expect(r2[0].onCredit).toBe(40);
    expect(s.debts.cemal).toBe(40);
    expect(E.balanceOf(s, 'cemal')).toBe(E.NPC_START + 5);
  });

  it('cesur NPC bahsi artırmak ister', () => {
    expect(B.wantsRaise(0.9, 5, 0.5)).toBe(true);
    expect(B.wantsRaise(0.1, 5, 0.5)).toBe(false);
    expect(B.wantsRaise(0.9, 0, 0)).toBe(false);
    expect(B.wantsRaise(0.9, 10, 0)).toBe(false);
  });
});

import { EconomyController } from '../src/economy/EconomyController';
import { PERSONALITIES } from '../src/npc/roster';

describe('EconomyController', () => {
  it('her işlemde kaydeder ve dinleyiciye fark bildirir', () => {
    const st = new MemoryEconomyStore();
    const c = new EconomyController(st, ['riza']);
    const seen: number[] = [];
    c.onChange((_b, _d, delta) => seen.push(delta));
    c.buy('tea');
    expect(seen).toEqual([0, -5]);
    expect(JSON.parse(st.data!).balances.player).toBe(E.START_BALANCE - 5);
    const r = c.settle(B.okeyOutcome([2, 20, 10, 10]), 3, ['player', 'riza', 'x', 'y']);
    expect(r[0]).toMatchObject({ from: 'player', to: 'riza', amount: 15 });
    expect(c.npcBalance('riza')).toBe(E.NPC_START + 15);
  });
  it('Cemal bahsi artırmaya en meyilli NPC', () => {
    const max = Object.values(PERSONALITIES).sort((a, b) => b.betBoldness - a.betBoldness)[0];
    expect(max.id).toBe('cemal');
  });
});
