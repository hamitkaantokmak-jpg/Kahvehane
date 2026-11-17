import { test, expect } from '@playwright/test';
import { boot, trackErrors, W } from './helpers';

test('Çay isteme: Şükrü servis turunu yapıp çayı oyuncuya getirir', async ({ page }) => {
  test.setTimeout(300_000);
  const errs = trackErrors(page);
  await boot(page, 'gspeed=4');
  await page.keyboard.press('KeyT');
  await page.waitForFunction(() => (window as unknown as W).__game.world.teaRequests.length > 0 || (window as unknown as W).__game.social.playerHasTea);
  await page.waitForFunction(() => (window as unknown as W).__game.social.playerHasTea, null, { timeout: 240_000 });
  const tray = await page.evaluate(() => (window as unknown as W).__game.npcs.find((n: any) => n.id === 'sukru').mode);
  expect(['serve', 'idle', 'walking']).toContain(tray);
  // çayı iç
  await page.keyboard.press('Digit7');
  await page.waitForFunction(() => !(window as unknown as W).__game.social.playerHasTea, null, { timeout: 20_000 });
  expect(errs).toEqual([]);
});

test('Istaka: iki şaplaktan sonra Rıza Dayı ıstakayla karşılık verir', async ({ page }) => {
  test.setTimeout(180_000);
  const errs = trackErrors(page);
  await boot(page, 'gspeed=2');
  const place = async () => page.evaluate(() => {
    const g = (window as unknown as W).__game;
    const n = g.npcs.find((x: any) => x.id === 'riza');
    if (n.c.seated) n.leaveSeat();
    if (n.mode !== 'react' && n.mode !== 'retaliate') { n.c.stopWalking(); n.mode = 'wander'; n.timer = 60; }
    n.c.pos.set(1.5, 0, 4.4);
    g.player.pos.set(1.5, 0, 5.4); g.player.yaw = Math.PI; g.player.targetYaw = Math.PI; g.player.velocity.set(0, 0, 0);
  });
  await place();
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => (window as unknown as W).__game.npcs.find((x: any) => x.id === 'riza').bonkCount === 1);
  await page.waitForTimeout(3500);
  await page.evaluate(() => { const n = (window as unknown as W).__game.npcs.find((x: any) => x.id === 'riza'); n.mode = 'wander'; n.timer = 60; });
  await place();
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => (window as unknown as W).__game.npcs.find((x: any) => x.id === 'riza').bonkCount === 2);
  await page.waitForFunction(() => (window as unknown as W).__game.social.timesBonked > 0, null, { timeout: 60_000 });
  expect(errs).toEqual([]);
});

test('Yürüme, koşma ve masaya oturma (klavye)', async ({ page }) => {
  const errs = trackErrors(page);
  await boot(page);
  const p0 = await page.evaluate(() => (window as unknown as W).__game.player.pos.z);
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(1200);
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');
  const p1 = await page.evaluate(() => (window as unknown as W).__game.player.pos.z);
  expect(p0 - p1).toBeGreaterThan(0.3);
  await page.evaluate(() => { const g = (window as unknown as W).__game; const s = g.kahve.tableById('kart2').seats[0]; g.player.pos.set(s.pos.x, 0, s.pos.z + 0.6); g.player.yaw = Math.PI; g.player.targetYaw = Math.PI; });
  await expect(page.locator('#prompt')).toContainText('Otur');
  await page.keyboard.press('KeyE');
  await expect(page.locator('.select-panel')).toBeVisible();
  await page.locator('.select-panel button:has-text("Masadan kalk")').click();
  expect(await page.evaluate(() => (window as unknown as W).__game.mode)).toBe('explore');
  expect(errs).toEqual([]);
});
