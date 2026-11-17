import { test, expect, devices, Page } from '@playwright/test';
import { boot, openGame, trackErrors, W } from './helpers';

const iphone = devices['iPhone 13'];
test.use({ viewport: iphone.viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: iphone.userAgent });

async function touchDrag(page: Page, from: [number, number], to: [number, number], steps = 12, holdMs = 900) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from[0], y: from[1], id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    const x = from[0] + ((to[0] - from[0]) * i) / steps, y = from[1] + ((to[1] - from[1]) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] });
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function fits(page: Page, sel: string) {
  const vw = page.viewportSize()!;
  const boxes = await page.locator(sel).evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom]; }));
  expect(boxes.length).toBeGreaterThan(0);
  for (const [l, r, t, b] of boxes) {
    expect(l, sel).toBeGreaterThanOrEqual(-1);
    expect(r, sel).toBeLessThanOrEqual(vw.width + 1);
    expect(t, sel).toBeGreaterThanOrEqual(-1);
    expect(b, sel).toBeLessThanOrEqual(vw.height + 1);
  }
}

test('Mobil: joystick ile yürüme, kamera kaydırma, etkileşim düğmesi', async ({ page }) => {
  const errs = trackErrors(page);
  await boot(page);
  await expect(page.locator('.mobile-btns')).toBeVisible();
  const p0 = await page.evaluate(() => { const p = (window as unknown as W).__game.player.pos; return [p.x, p.z]; });
  await touchDrag(page, [90, 650], [90, 580]); // ileri
  const p1 = await page.evaluate(() => { const p = (window as unknown as W).__game.player.pos; return [p.x, p.z]; });
  expect(Math.hypot(p1[0] - p0[0], p1[1] - p0[1])).toBeGreaterThan(0.2);
  const y0 = await page.evaluate(() => (window as unknown as W).__game.rig.yaw);
  await touchDrag(page, [300, 400], [220, 400], 8, 100); // kamera
  const y1 = await page.evaluate(() => (window as unknown as W).__game.rig.yaw);
  expect(Math.abs(y1 - y0)).toBeGreaterThan(0.05);
  // etkileşim düğmesi ile otur
  await page.evaluate(() => { const g = (window as unknown as W).__game; const s = g.kahve.tableById('okey3').seats[0]; g.player.pos.set(s.pos.x, 0, s.pos.z + 0.6); g.player.yaw = Math.PI; g.player.targetYaw = Math.PI; });
  await page.waitForTimeout(300);
  await page.locator('.mb.big').tap();
  await expect(page.locator('.select-panel')).toBeVisible();
  await fits(page, '.select-panel');
  expect(errs).toEqual([]);
});

for (const orient of ['dikey', 'yatay'] as const) {
  for (const gid of ['okey', 'okey101', 'tavla', 'pisti2', 'pisti4']) {
    test(`Mobil ${orient}: ${gid} arayüzü ekrana sığıyor`, async ({ page }) => {
      if (orient === 'yatay') await page.setViewportSize({ width: 844, height: 390 });
      const errs = trackErrors(page);
      await boot(page);
      await openGame(page, gid);
      const sels: Record<string, string[]> = {
        okey: ['.rack', '.gbtns button', '.ob-center', '.status'],
        okey101: ['.rack', '.gbtns button', '.meld-table', '.status'],
        tavla: ['.tboard', '.tside', '.gbtns button'],
        pisti2: ['.ptable', '.phand', '.gbtns button'],
        pisti4: ['.ptable', '.phand', '.gbtns button'],
      };
      await page.waitForTimeout(500);
      for (const s of sels[gid]) await fits(page, s);
      await page.screenshot({ path: `test-results/mobil-${orient}-${gid}.png` });
      expect(errs).toEqual([]);
    });
  }
}
