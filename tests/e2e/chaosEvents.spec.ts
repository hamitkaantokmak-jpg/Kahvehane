import { test, expect } from '@playwright/test';
import { boot, openGame, trackErrors, withUI, W } from './helpers';

const G = (page: any, fn: string) => page.evaluate(new Function(`const g = window.__game; ${fn}`) as any);

test('Olaylar: TV\'de gol, kedi, elektrik kesintisi (karanlıkta okey oynanır)', async ({ page }) => {
  test.setTimeout(240_000);
  const errs = trackErrors(page);
  await boot(page, 'speed=6&gspeed=3');
  // gol
  await G(page, `g.chaosEvents.tvGoal();`);
  expect(await page.evaluate(() => (window as unknown as W).__game.kahve.tv.overlay !== null)).toBe(true);
  await page.waitForFunction(() => (window as unknown as W).__game.kahve.tv.overlay === null, null, { timeout: 30_000 });
  // kedi
  const t0 = await page.evaluate(() => (window as unknown as W).__game.chaos.tension);
  await G(page, `g.chaosEvents.catVisit();`);
  await expect(page.locator('.toast')).toContainText('kedi');
  await page.waitForFunction(() => (window as unknown as W).__game.chaosEvents.cat?.phase === 'onTable', null, { timeout: 90_000 });
  expect(await page.evaluate(() => (window as unknown as W).__game.chaos.tension)).toBeGreaterThan(t0);
  await page.waitForFunction(() => (window as unknown as W).__game.chaosEvents.cat === null, null, { timeout: 120_000 });
  // elektrik kesintisi sırasında okey oynanabilir
  await openGame(page, 'okey');
  await G(page, `g.chaosEvents.powerCut();`);
  await page.waitForFunction(() => (window as unknown as W).__game.kahve.powerFactor < 0.3, null, { timeout: 20_000 });
  await page.locator('.rack .tile').first().click();
  await page.locator('.gbtns button:text-is("At")').click();
  expect(await withUI<number>(page, 'return s.discards[0].length')).toBe(1);
  await G(page, 'for (const t of g.chaosEvents.timed) t.t = Math.max(t.t, t.dur - 0.3);'); // olayın sonuna ileri sar
  await page.waitForFunction(() => (window as unknown as W).__game.kahve.powerFactor === 1, null, { timeout: 60_000 });
  const log = await page.evaluate(() => (window as unknown as W).__game.chaosEvents.log);
  for (const e of ['tvGoal', 'cat', 'powerCut']) expect(log).toContain(e);
  expect(errs).toEqual([]);
});

test('Masa kaosu: itiraz (bekleme süreli), kibitz yorumu, Rıza okeyi kaybedince masayı devirir ama sonuç geçerli', async ({ page }) => {
  test.setTimeout(200_000);
  const errs = trackErrors(page);
  await boot(page, 'speed=6');
  await openGame(page, 'okey');
  // itiraz
  const t0 = await page.evaluate(() => (window as unknown as W).__game.chaos.tension);
  await page.locator('.objection-btn').click();
  await page.locator('.objection-pick button').first().click();
  expect(await page.evaluate(() => (window as unknown as W).__game.session.lastObjection)).not.toBe(null);
  expect(await page.evaluate(() => (window as unknown as W).__game.chaos.tension)).toBeGreaterThan(t0);
  expect(await page.evaluate(() => (window as unknown as W).__game.session.object((window as unknown as W).__game.session.participants[1]))).toBe(false);
  // kibitz
  await G(page, `g.session.kibitzT = 0;`);
  await page.waitForFunction(() => { const s = (window as unknown as W).__game.session; s.kibitzT = Math.min(s.kibitzT, 0.2); return s.kibitzLines.length > 0; }, null, { timeout: 90_000 });
  // masa devirme: Rıza masada ve kaybediyor
  const rizaIdx = await page.evaluate(() => (window as unknown as W).__game.session.participants.findIndex((p: any) => p !== 'player' && p.id === 'riza'));
  test.skip(rizaIdx < 0, 'Rıza bu masaya gelmedi');
  const before = await withUI<string>(page, 's.scores = [20, 6, 8, 10]; return JSON.stringify(s.scores);');
  await G(page, `g.rng = () => 0.01; g.session.matchFinished(true);`);
  await page.waitForFunction(() => (window as unknown as W).__game.chaosEvents.log.includes('tableFlip'), null, { timeout: 20_000 });
  expect(await withUI<string>(page, 'return JSON.stringify(s.scores)')).toBe(before);
  expect(errs).toEqual([]);
});
