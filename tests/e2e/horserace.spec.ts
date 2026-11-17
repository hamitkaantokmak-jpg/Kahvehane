import { test, expect } from '@playwright/test';
import { boot, trackErrors, W } from './helpers';

test('TV at yarışı: bahis aç, oyuncu ve Cemal bahis yapar, yarış oynar, kazanan oranla ödenir', async ({ page }) => {
  test.setTimeout(150_000);
  const errs = trackErrors(page);
  await boot(page);
  await page.evaluate(() => { const g = (window as unknown as W).__game; g.economy.tx((s: any) => { s.balances.player = 100; s.balances.cemal = 150; s.debts = {}; }); g.race.startNow(); });
  await page.waitForFunction(() => (window as unknown as W).__game.race.phase === 'betting');
  // Cemal her zaman bahis yapar
  expect(await page.evaluate(() => (window as unknown as W).__game.race.bets.some((b: any) => b.who === 'cemal'))).toBe(true);
  // TV'ye git ve E
  await page.evaluate(() => { const g = (window as unknown as W).__game; g.player.pos.set(0.5, 0, -5.0); g.player.yaw = Math.PI; g.player.targetYaw = Math.PI; });
  await expect(page.locator('#prompt')).toContainText('bahis');
  await page.keyboard.press('KeyE');
  await expect(page.locator('.race-modal')).toBeVisible();
  // en düşük oranlı (favori) ata 20
  const fav = await page.evaluate(() => [...(window as unknown as W).__game.race.field].sort((a: any, b: any) => a.odds - b.odds)[0].id);
  await page.locator('.race-modal .stake-row button:has-text("20🪙")').click();
  await page.locator(`.race-modal .horse-btn[data-horse="${fav}"]`).click();
  await page.waitForFunction(() => (window as unknown as W).__game.economy.balance === 80);
  // determinizm: sonuç tohumdan
  const det = await page.evaluate(async () => {
    const g = (window as unknown as W).__game;
    const path = '/src/games/atyarisi/atyarisi.ts';
    const A = await import(/* @vite-ignore */ path);
    const r = A.runRace(g.race.schedule.seed, A.makeField(g.race.schedule.seed));
    return JSON.stringify(r.order) === JSON.stringify(g.race.result.order);
  });
  expect(det).toBe(true);
  // yarışı başlat ve TV'de oynat
  await page.evaluate(() => { (window as unknown as W).__game.race.schedule.timer = 0; });
  await page.waitForFunction(() => (window as unknown as W).__game.race.phase === 'running');
  await page.waitForTimeout(1500);
  await page.evaluate(() => { (window as unknown as W).__game.race.schedule.timer = 0; });
  await page.waitForFunction(() => (window as unknown as W).__game.race.phase === 'results');
  await expect(page.locator('.toast')).toContainText('Kazanan');
  const res = await page.evaluate(() => { const r = (window as unknown as W).__game.race; return { winner: r.result.order[0], odds: r.field.map((h: any) => h.odds), bal: (window as unknown as W).__game.economy.balance, pays: r.lastPayouts }; });
  if (res.winner === fav) expect(res.bal).toBe(80 + Math.floor(20 * res.odds[fav]));
  else expect(res.bal).toBe(80);
  expect(res.pays.find((p: any) => p.who === 'player').win).toBe(res.winner === fav);
  expect(errs).toEqual([]);
});
