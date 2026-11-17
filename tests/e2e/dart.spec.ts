import { test, expect } from '@playwright/test';
import { boot, trackErrors, W } from './helpers';

test('Dart 501: tahtaya nişan + güç ile atış, bot atışları, bust kuralı, bahisli bitiş ve ödeme', async ({ page }) => {
  test.setTimeout(240_000);
  const errs = trackErrors(page);
  await boot(page, 'speed=8');
  await page.evaluate(() => { const g = (window as unknown as W).__game; g.economy.tx((s: any) => { s.balances.player = 100; s.debts = {}; }); g.player.pos.set(-6.3, 0, 4.0); g.player.yaw = -Math.PI / 2; g.player.targetYaw = -Math.PI / 2; });
  await expect(page.locator('#prompt')).toContainText('Dart');
  await page.keyboard.press('KeyE');
  await expect(page.locator('.select-panel')).toContainText('Dart');
  await page.locator('.stake-row button[data-stake="3"]').click();
  await page.locator('.select-panel button:has-text("Oyna")').click();
  await expect(page.locator('.dart-score')).toContainText('501');
  // gerçek fare ile: tahtanın merkezine nişan al, basılı tut, bırak
  const center = await page.evaluate(() => {
    const g = (window as unknown as W).__game; const v = g.kahve.dartCenter.clone().project(g.camera);
    return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
  });
  await page.waitForFunction(() => (window as unknown as W).__game.rig.blend > 0.995, null, { timeout: 30_000 }); // kamera geçişi
  const c2 = await page.evaluate(() => {
    const g = (window as unknown as W).__game; const v = g.kahve.dartCenter.clone().project(g.camera);
    return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
  });
  expect(c2.x).toBeGreaterThan(0);
  await page.mouse.move(c2.x, c2.y);
  const aim = await page.evaluate(({ x, y }) => (window as unknown as W).__game.session.boardFromScreen(x, y), c2);
  expect(Math.hypot(aim.x, aim.y)).toBeLessThan(0.2);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await page.mouse.up();
  await page.waitForFunction(() => (window as unknown as W).__game.session.ui.s.throws.length >= 1);
  void center;
  // kalan iki ok: test kancası ile ideal güç
  for (let k = 0; k < 2; k++) {
    await page.waitForFunction(() => { const u = (window as unknown as W).__game.session.ui; return u.s.current === 0 && !u.flying; });
    await page.evaluate(() => (window as unknown as W).__game.session.ui.throwHuman(0.6, { x: 0, y: 0.6 }));
    await page.waitForFunction((n) => (window as unknown as W).__game.session.ui.s.throws.length >= n, k + 2);
  }
  // bot sırası: 3 ok atar ve sıra bana döner
  await page.waitForFunction(() => { const s = (window as unknown as W).__game.session.ui.s; return s.throws.filter((t: any) => t.player === 1).length >= 3 && s.current === 0; }, null, { timeout: 60_000 });
  // bust: kalan 40 iken 60 at
  await page.evaluate(() => { const s = (window as unknown as W).__game.session.ui.s; s.remaining[0] = 40; s.turnStart = 40; });
  await page.evaluate(() => (window as unknown as W).__game.session.ui.fire(0, { x: 0, y: 0.605 })); // üçlü 20 = 60 > 40
  await page.waitForFunction(() => (window as unknown as W).__game.session.ui.s.current === 1, null, { timeout: 20_000 });
  const lastMine = await page.evaluate(() => { const s = (window as unknown as W).__game.session.ui.s; return s.throws.filter((t: any) => t.player === 0).pop(); });
  expect(lastMine.hit.score).toBe(60);
  expect(lastMine.bust).toBe(true);
  expect(await page.evaluate(() => (window as unknown as W).__game.session.ui.s.remaining[0])).toBe(40);
  await expect(page.locator('.dart-log')).toContainText('BUST');
  // bitiş: kalan 40, çift 20'ye isabet → kazandın, bahis ödendi
  await page.waitForFunction(() => (window as unknown as W).__game.session.ui.s.current === 0, null, { timeout: 60_000 });
  const before = await page.evaluate(() => (window as unknown as W).__game.economy.balance);
  await page.evaluate(() => {
    const u = (window as unknown as W).__game.session.ui; u.s.remaining[0] = 40; u.s.turnStart = 40;
    u.host.rng = () => 0.5; // sapmasız
  });
  await page.evaluate(() => { const u = (window as unknown as W).__game.session.ui; u.fire(0, { x: 0, y: 0.976 }); });
  await expect(page.locator('.modal')).toContainText('Kazandın', { timeout: 20_000 });
  await expect(page.locator('.settle-list')).toContainText('15🪙');
  expect(await page.evaluate(() => (window as unknown as W).__game.economy.balance)).toBe(before + 15);
  await page.locator('.modal button:has-text("Bırak")').click();
  expect(await page.evaluate(() => (window as unknown as W).__game.mode)).toBe('explore');
  expect(errs).toEqual([]);
});
