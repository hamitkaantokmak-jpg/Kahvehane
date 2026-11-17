import { test, expect } from '@playwright/test';
import { boot, openGame, trackErrors, W } from './helpers';

/** Masa üstündeki 3D görünüm: parça sayıları + ekran görüntüleri (arayüz gizlenerek). */
for (const gid of ['okey', 'okey101', 'tavla', 'pisti4']) {
  test(`3D masa: ${gid}`, async ({ page }) => {
    const errs = trackErrors(page);
    await boot(page, 'speed=6');
    await openGame(page, gid);
    if (gid === 'tavla') { await page.locator('.gbtns button:has-text("Açılış zarı")').click(); await page.waitForTimeout(1500); }
    else await page.waitForTimeout(6000);
    const count = await page.evaluate(() => {
      let n = 0;
      (window as unknown as W).__game.session.seat.table.live.traverse((o: any) => { if (o.isInstancedMesh) n++; });
      return n;
    });
    expect(count).toBeGreaterThan(0);
    await page.screenshot({ path: `test-results/table3d-ui-${gid}.png` });
    await page.evaluate(() => { (document.querySelector('.game-root') as HTMLElement).style.visibility = 'hidden'; });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `test-results/table3d-${gid}.png` });
    await page.evaluate(() => { (document.querySelector('.game-root') as HTMLElement).style.visibility = ''; });
    expect(errs).toEqual([]);
  });
}
