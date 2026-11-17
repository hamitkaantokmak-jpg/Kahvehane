import { test, expect } from '@playwright/test';
import { boot, openGame, trackErrors, withUI, W } from './helpers';

const g = (page: any, body: string) => page.evaluate(new Function(`const g = window.__game; ${body}`) as any);

test('Kaos: Rıza Dayı ilk şaplakta kavga başlatır, oyuncuya karşılık verir, Şükrü yatıştırır; çubuk yükselip düşer', async ({ page }) => {
  test.setTimeout(180_000);
  const errs = trackErrors(page);
  await boot(page, 'gspeed=4');
  await g(page, `
    const n = g.npcs.find((x) => x.id === 'riza');
    if (n.c.seated) n.leaveSeat();
    n.c.stopWalking(); n.mode = 'wander'; n.timer = 60;
    n.c.pos.set(1.5, 0, 4.4);
    g.player.pos.set(1.5, 0, 5.4); g.player.yaw = Math.PI; g.player.targetYaw = Math.PI;`);
  await page.waitForTimeout(500);
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => (window as unknown as W).__game.brawls.active);
  await expect(page.locator('.toast')).toContainText('Kavga çıktı');
  const tension = await page.evaluate(() => (window as unknown as W).__game.chaos.tension);
  expect(tension).toBeGreaterThan(10);
  await expect(page.locator('#tensionFill')).not.toHaveAttribute('style', 'width: 0%;');
  // Rıza ıstakayla karşılık verir
  await page.waitForFunction(() => (window as unknown as W).__game.social.timesBonked > 0, null, { timeout: 60_000 });
  // Şükrü yatıştırır ya da kavga kendiliğinden söner
  await page.waitForFunction(() => !(window as unknown as W).__game.brawls.active, null, { timeout: 90_000 });
  const h = await page.evaluate(() => (window as unknown as W).__game.brawls.history[0]);
  expect(['calmed', 'timeout', 'exhausted']).toContain(h.reason);
  const after = await page.evaluate(() => (window as unknown as W).__game.chaos.tension);
  if (h.reason === 'calmed') expect(after).toBeLessThan(tension + 20);
  expect(errs).toEqual([]);
});

test('Kaos: masadaki bot kavgaya karışınca oyun duraklar, bot masaya dönünce devam eder', async ({ page }) => {
  test.setTimeout(180_000);
  const errs = trackErrors(page);
  await boot(page, 'speed=6&gspeed=2');
  await openGame(page, 'okey');
  // masadaki botlardan biri (sağdaki, 1 numara) ayaktaki bir NPC ile kavgaya girer
  const bot = await page.evaluate(() => { const g = (window as unknown as W).__game; return g.session.participants[1].id; });
  await page.evaluate((bot) => {
    const g = (window as unknown as W).__game;
    const other = g.npcs.find((n: any) => n.mode !== 'inGame' && n.id !== 'sukru');
    other.c.pos.copy(g.npcs.find((n: any) => n.id === bot).c.pos).add({ x: 1, y: 0, z: 1 } as any);
    g.brawls.start(bot, other.id);
  }, bot);
  await expect(page.locator('.pause-banner')).toBeVisible();
  await expect(page.locator('.pause-banner')).toContainText('kavgada');
  // benim hamlem: taş at → sıra bota geçer ama bot oynamaz
  await page.locator('.rack .tile').first().click();
  await page.locator('.gbtns button:text-is("At")').click();
  const turn = await withUI<number>(page, 'return s.turn');
  await page.waitForTimeout(2500);
  expect(await withUI<number>(page, 'return s.turn')).toBe(turn);
  // kavgayı bitir → bot masaya döner, oyun devam eder
  await page.evaluate(() => (window as unknown as W).__game.brawls.brawl.end('calmed'));
  await expect(page.locator('.pause-banner')).toBeHidden({ timeout: 60_000 });
  await page.waitForFunction((t) => (window as unknown as W).__game.session.ui.s.turn > t, turn, { timeout: 60_000 });
  expect(await page.evaluate((bot) => (window as unknown as W).__game.npcs.find((n: any) => n.id === bot).mode, bot)).toBe('inGame');
  expect(errs).toEqual([]);
});

test('Kaos yoğunluğu ayarı kaydedilir ve direktöre uygulanır', async ({ page }) => {
  const errs = trackErrors(page);
  await boot(page);
  await page.keyboard.press('Escape');
  await page.locator('select[data-k="chaosIntensity"]').selectOption('chaos');
  expect(await page.evaluate(() => (window as unknown as W).__game.chaos.state.intensity)).toBe('chaos');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kahvehane.settings.v1')!).chaosIntensity)).toBe('chaos');
  await page.reload();
  await page.waitForFunction(() => (window as unknown as W).__game?.frame > 3);
  expect(await page.evaluate(() => (window as unknown as W).__game.chaos.state.intensity)).toBe('chaos');
  expect(errs).toEqual([]);
});
