import { test, expect, Page } from '@playwright/test';
import { boot, openGame, trackErrors, withUI } from './helpers';

async function playMyMoves(page: Page) {
  for (let k = 0; k < 6; k++) {
    const src = page.locator('.pt.src, .bar.src');
    if (!(await src.count())) return;
    await src.first().click();
    const tgt = page.locator('.pt.tgt, .off.tgt');
    if (!(await tgt.count())) { await src.first().click(); }
    if (!(await tgt.count())) return;
    await tgt.first().click();
  }
}

test('Tavla: bardan giriş, geri al, toplama, mars ve maç sonu', async ({ page }) => {
  const errs = trackErrors(page);
  await boot(page);
  await openGame(page, 'tavla');
  // açılış: kurgulanmış — sıra bende, bir pulum barda
  await withUI(page, `s.phase = 'roll'; s.current = 0; s.points[23] = 1; s.bar[0] = 1; ui.forceDice = [3, 5]; ui.refresh();`);
  await page.locator('.gbtns button:has-text("Zar at")').click();
  await expect(page.locator('.bar.src')).toBeVisible();
  expect(await page.locator('.pt.src').count()).toBe(0); // bar zorunlu
  await page.locator('.bar.src').click();
  await page.locator('.pt.tgt').first().click();
  expect(await withUI(page, 'return s.bar[0]')).toBe(0);
  // geri al
  await page.locator('.gbtns button:has-text("Geri al")').click();
  expect(await withUI(page, 'return [s.bar[0], s.remaining.length]')).toEqual([1, 2]);
  await playMyMoves(page);
  await expect(page.locator('.status')).toContainText('Zar at', { timeout: 60_000 });

  // oyun sonu: tek pulum kaldı, rakip hiç toplamadı → mars; hedef 1 → maç sonu
  await withUI(page, `s.points = Array(24).fill(0); s.points[0] = 1; s.off = [14, 0]; s.bar = [0, 0]; s.points[23] = -15;
    s.options.target = 1; s.phase = 'roll'; s.current = 0; ui.forceDice = [6, 5]; ui.refresh();`);
  await page.locator('.gbtns button:has-text("Zar at")').click();
  await page.locator('.pt.src').first().click();
  await page.locator('.off.tgt').click();
  const modal = page.locator('.modal');
  await expect(modal).toContainText('Oyunu kazandın');
  await expect(modal).toContainText('MARS');
  await expect(modal).toContainText('Maçı KAZANDIN');
  await modal.locator('button:has-text("Yeni maç")').click();
  await expect(page.locator('.gbtns button:has-text("Açılış zarı")')).toBeVisible();
  expect(errs).toEqual([]);
});

test('Tavla: baştan sona tam oyun (bot rakibe karşı)', async ({ page }) => {
  test.setTimeout(600_000);
  const errs = trackErrors(page);
  await boot(page, 'speed=40');
  await openGame(page, 'tavla');
  await page.locator('.gbtns button:has-text("Açılış zarı")').click();
  for (let guard = 0; guard < 400; guard++) {
    if (await page.locator('.modal').count()) break;
    const roll = page.locator('.gbtns button:has-text("Zar at")');
    if (await roll.count()) { await roll.click(); await page.waitForTimeout(150); }
    await playMyMoves(page);
    await page.waitForTimeout(120);
  }
  await expect(page.locator('.modal')).toContainText(/kazandı|kazandın/);
  const st = await withUI<{ off: number[]; score: number[] }>(page, 'return { off: s.off, score: s.score }');
  expect(Math.max(...st.off)).toBe(15);
  expect(st.score[0] + st.score[1]).toBeGreaterThan(0);
  expect(errs).toEqual([]);
});

test('Tavla masa görünümü: rakip karşıda, sen altta; zarlar tahtanın ortasında, toplanan pullar yanda', async ({ page }) => {
  const errs = trackErrors(page);
  await boot(page);
  await openGame(page, 'tavla');
  await expect(page.locator('.tplate.opp .oplate')).toBeVisible();
  await expect(page.locator('.tplate.me .oplate')).toContainText('Sen');
  await withUI(page, `s.phase = 'roll'; s.current = 0; s.openingRolls = [6, 1]; ui.forceDice = [6, 5]; ui.refresh();`);
  await page.locator('.gbtns button:has-text("Zar at")').click();
  await expect(page.locator('.tboard .tmid .dice .die')).toHaveCount(2);
  await expect(page.locator('.tplate.me .oplate.turn')).toBeVisible();
  await withUI(page, `s.off = [7, 3]; ui.refresh();`);
  await expect(page.locator('.tside .off.w .offstack i.w')).toHaveCount(7);
  await expect(page.locator('.tside .off.b .offstack i.b')).toHaveCount(3);
  expect(errs).toEqual([]);
});
