import { test, expect, Page } from '@playwright/test';
import { boot, openGame, trackErrors, withUI } from './helpers';

async function playUntilHandEnd(page: Page) {
  for (let guard = 0; guard < 80; guard++) {
    if (await page.locator('.modal').count()) return;
    const c = page.locator('.phand .card.playable');
    if (await c.count()) await c.first().click();
    await page.waitForTimeout(100);
  }
}

for (const players of [2, 4] as const) {
  test(`Pişti ${players} kişi: pişti efekti, tam el, puan tablosu, maç sonu`, async ({ page }) => {
    const errs = trackErrors(page);
    await boot(page, 'speed=20');
    await openGame(page, `pisti${players}`);
    // kurgu: yerde tek 5, elimde 5 → PİŞTİ
    await withUI(page, `s.current = 0; s.pile = [{ id: 700, suit: 0, rank: 5 }]; s.hiddenCount = 0; s.hands[0][0] = { id: 701, suit: 1, rank: 5 }; ui.refresh();`);
    await page.locator('.phand .card[data-id="701"]').click();
    await expect(page.locator('.splash')).toContainText('PİŞTİ');
    expect(await withUI(page, 'return s.pistis[0]')).toBe(10);
    await playUntilHandEnd(page);
    const modal = page.locator('.modal');
    await expect(modal).toContainText('El 1 bitti');
    await expect(modal.locator('table.score tr')).toHaveCount(3);
    // kart korunumu
    expect(await withUI(page, 'return s.captured.flat().length')).toBe(52 + 1); // +1: kurgudaki fazladan kart
    // maç sonu: hedefi düşür, bir el daha oyna
    await withUI(page, 's.options.target = 1;');
    await modal.locator('button:has-text("Sonraki el")').click();
    await playUntilHandEnd(page);
    await expect(page.locator('.modal')).toContainText('Maçı');
    expect(errs).toEqual([]);
  });
}
