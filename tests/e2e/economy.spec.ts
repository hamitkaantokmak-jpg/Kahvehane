import { test, expect } from '@playwright/test';
import { boot, trackErrors, withUI, W } from './helpers';

const RIG_WIN = `
  let id = 900; const T = (c, n) => ({ id: id++, color: c, num: n, fake: false });
  s.ctx = { okeyColor: 3, okeyNum: 7 }; s.current = 0; s.phase = 'discard';
  s.hands[0] = [T(0,1),T(0,2),T(0,3),T(1,5),T(2,5),T(3,5),T(2,10),T(2,11),T(2,12),T(2,13),T(0,9),T(1,9),T(2,9),T(3,9),T(1,1)];
  ui.rack.slots.fill(null); ui.refresh(); return s.hands[0][14].id;`;

test('Bahisli okey: maç bitince kaybeden öder, bakiye sayfa yenilenince korunur', async ({ page }) => {
  const errs = trackErrors(page);
  await boot(page);
  await page.evaluate(() => localStorage.removeItem('kahvehane.economy.v1'));
  await page.reload();
  await page.waitForFunction(() => (window as unknown as W).__game?.frame > 3);
  const start = await page.evaluate(() => (window as unknown as W).__game.economy.balance);
  await page.evaluate(() => { const g = (window as unknown as W).__game; g.sitDown(g.kahve.tableById('okey2').seats[0]); });
  await page.locator('.stake-row button[data-stake="5"]').click();
  await page.locator('.game-card[data-game="okey"] button.primary').click();
  // bahis artırma teklifi gelirse reddet
  const raise = page.locator('.raise-modal button:has-text("Yok, kalsın")');
  await page.waitForTimeout(2500);
  if (await raise.count()) await raise.click();
  const loserId = await withUI<string>(page, 's.scores = [20, 2, 6, 8]; return game.session.participants[1].id;');
  const loserBefore = await page.evaluate((id) => (window as unknown as W).__game.economy.npcBalance(id), loserId);
  const tile = await withUI<number>(page, RIG_WIN);
  await page.locator(`.rack .tile[data-id="${tile}"]`).click();
  await page.locator('.gbtns button:has-text("Bitir")').click();
  await expect(page.locator('.modal')).toContainText('Maçı KAZANDIN');
  await expect(page.locator('.settle-list')).toContainText('25🪙');
  const after = await page.evaluate(() => (window as unknown as W).__game.economy.balance);
  expect(after).toBe(start + 25);
  expect(await page.evaluate((id) => (window as unknown as W).__game.economy.npcBalance(id), loserId)).toBe(loserBefore - 25);
  await expect(page.locator('#moneyBal')).toHaveText(String(after));
  await page.reload();
  await page.waitForFunction(() => (window as unknown as W).__game?.frame > 3);
  expect(await page.evaluate(() => (window as unknown as W).__game.economy.balance)).toBe(after);
  expect(errs).toEqual([]);
});

test('Çay parası, veresiye, sınır dolunca Şükrü çay getirmez, bulaşık ve borç ödeme', async ({ page }) => {
  const errs = trackErrors(page);
  await boot(page);
  await page.evaluate(() => { const e = (window as unknown as W).__game.economy; e.tx((s: any) => { s.balances.player = 7; s.debts = {}; s.pricing = { multiplier: 1, remaining: 0 }; s.workCooldown = 0; }); });
  // 1. çay: nakit
  await page.keyboard.press('KeyT');
  await page.waitForFunction(() => (window as unknown as W).__game.economy.balance === 2);
  // 2. çay: 2 nakit + 3 veresiye (çay yolda olduğu için talebi temizle)
  await page.evaluate(() => { (window as unknown as W).__game.world.teaRequests.length = 0; });
  await page.keyboard.press('KeyT');
  await page.waitForFunction(() => (window as unknown as W).__game.economy.debt === 3);
  await expect(page.locator('#moneyDebt')).toHaveText('📒 3');
  // sınırı doldur → Şükrü getirmez
  await page.evaluate(() => { const g = (window as unknown as W).__game; g.economy.tx((s: any) => { s.debts.sukru = 39; }); g.world.teaRequests.length = 0; });
  await page.keyboard.press('KeyT');
  await page.waitForTimeout(1200);
  // talep kuyruğa girmedi, borç değişmedi (çay verilmedi)
  expect(await page.evaluate(() => [(window as unknown as W).__game.world.teaRequests.length, (window as unknown as W).__game.economy.debt])).toEqual([0, 39]);
  // iflas: semaverde bulaşık yıka
  await page.evaluate(() => { const g = (window as unknown as W).__game; g.player.pos.set(-7.2, 0, -4.6); g.player.yaw = -Math.PI / 2; g.player.targetYaw = -Math.PI / 2; });
  await expect(page.locator('#prompt')).toContainText('Bulaşık yıka');
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => (window as unknown as W).__game.economy.debt === 27);
  // borç öde: para ver, Şükrü'ye konuş
  await page.evaluate(() => {
    const g = (window as unknown as W).__game;
    g.economy.tx((s: any) => { s.balances.player = 50; });
    const sk = g.npcs.find((n: any) => n.id === 'sukru');
    sk.c.stopWalking(); sk.mode = 'inGame';
    sk.c.pos.set(0, 0, 3); g.player.pos.set(0, 0, 3.9); g.player.yaw = Math.PI; g.player.targetYaw = Math.PI;
  });
  await expect(page.locator('#prompt')).toContainText('borcunu öde');
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => (window as unknown as W).__game.economy.debt === 0 && (window as unknown as W).__game.economy.balance === 23);
  expect(errs).toEqual([]);
});
