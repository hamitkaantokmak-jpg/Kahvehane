import { test, expect } from '@playwright/test';
import { boot, openGame, trackErrors, withUI, W } from './helpers';

const place = (id: string) => `
  const g = window.__game; const n = g.npcs.find((x) => x.id === '${id}');
  if (n.c.seated) n.leaveSeat(); n.c.stopWalking(); n.mode = 'inGame';
  n.c.pos.set(1.5, 0, 3.0);
  g.player.pos.set(1.5, 0, 5.0); g.player.yaw = Math.PI; g.player.targetYaw = Math.PI;
  g.rig.yaw = 0.4; g.rig.pitch = 0.2; g.rig.distance = 3;
  g.economy.tx((s) => { s.balances.player = 100; s.debts = {}; s.pricing = { multiplier: 1, remaining: 0 }; });`;

test('Çay fırlatma: ücret, isabet, çaylı yüz, art arda zam, solma; masada oyun etkilenmez', async ({ page }) => {
  test.setTimeout(200_000);
  const errs = trackErrors(page);
  await boot(page, 'speed=6');
  // Nihat sakin karakter: karşılık verme ihtimali düşük → kavga başlatmasın diye inGame modunda tutulur
  await page.evaluate(new Function(place('nihat')) as () => void);
  await page.waitForTimeout(400);
  const t0 = await page.evaluate(() => (window as unknown as W).__game.chaos.tension);
  await page.keyboard.press('KeyG');
  await page.waitForFunction(() => (window as unknown as W).__game.economy.balance === 85);
  await page.waitForFunction(() => (window as unknown as W).__game.npcs.find((n: any) => n.id === 'nihat').c.stain.remaining > 0);
  await page.waitForFunction(() => (window as unknown as W).__game.npcs.find((n: any) => n.id === 'nihat').c.model.stain.visible);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as unknown as W).__game.chaos.tension)).toBeGreaterThan(t0);
  await page.screenshot({ path: 'test-results/tea-splash.png' });
  // bekleme süresi içinde ikinci atış olmaz
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as W).__game.economy.balance)).toBe(85);
  // bekleme bitince aynı hedefe ikinci atış 5🪙 zamlı
  await page.evaluate(() => { (window as unknown as W).__game.social.throwState.cooldown = 0; });
  await page.keyboard.press('KeyG');
  await page.waitForFunction(() => (window as unknown as W).__game.economy.balance === 65);
  // leke solar ve kaybolur
  await page.evaluate(() => { (window as unknown as W).__game.npcs.find((n: any) => n.id === 'nihat').c.stain.remaining = 0.3; });
  await page.waitForFunction(() => !(window as unknown as W).__game.npcs.find((n: any) => n.id === 'nihat').c.model.stain.visible, null, { timeout: 30_000 });
  // ayar kapalıyken fırlatılamaz
  await page.evaluate(() => { const g = (window as unknown as W).__game; g.applySettings({ ...g.settings, teaThrow: 'off' }); g.social.throwState.cooldown = 0; });
  await page.keyboard.press('KeyG');
  await expect(page.locator('.toast')).toContainText('kapalı');
  expect(await page.evaluate(() => (window as unknown as W).__game.economy.balance)).toBe(65);
  await page.evaluate(() => { const g = (window as unknown as W).__game; g.applySettings({ ...g.settings, teaThrow: 'all' }); });
  // oyuncunun yüzü: sil
  await page.evaluate(() => { (window as unknown as W).__game.player.stain.remaining = 20; });
  await page.keyboard.press('Digit8');
  await page.waitForFunction(() => (window as unknown as W).__game.player.stain.remaining === 0);
  expect(errs).toEqual([]);
});

test('Masada çay fırlatma: hedef çaylanır, oyun durumu değişmez', async ({ page }) => {
  const errs = trackErrors(page);
  await boot(page, 'speed=6');
  await openGame(page, 'okey');
  await page.evaluate(() => (window as unknown as W).__game.economy.tx((s: any) => { s.balances.player = 100; s.debts = {}; }));
  const before = await withUI<string>(page, 'return JSON.stringify({ h: s.hands.map((x) => x.map((t) => t.id)), c: s.current, p: s.phase, d: s.deck.length })');
  const target = await page.evaluate(() => (window as unknown as W).__game.session.participants[2].id);
  await page.locator('.throw-btn').click();
  await page.locator('.throw-pick button').nth(1).click();
  await page.waitForFunction((id) => (window as unknown as W).__game.npcs.find((n: any) => n.id === id).c.stain.remaining > 0, target);
  await page.waitForTimeout(500);
  const after = await withUI<string>(page, 'return JSON.stringify({ h: s.hands.map((x) => x.map((t) => t.id)), c: s.current, p: s.phase, d: s.deck.length })');
  expect(after).toBe(before);
  expect(errs).toEqual([]);
});
