import { Page, expect } from '@playwright/test';

export type W = Window & { __game: any };

/** Konsol hatalarını toplar; test sonunda boş olmalı. */
export function trackErrors(page: Page): string[] {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  return errs;
}

export async function boot(page: Page, query = 'speed=12') {
  await page.goto('/?' + query);
  await page.waitForFunction(() => !!(window as unknown as W).__game && (window as unknown as W).__game.frame > 3);
}

const TABLE_FOR: Record<string, string> = { okey: 'okey2', okey101: 'okey2', tavla: 'tavla2', pisti2: 'kart2', pisti4: 'kart2' };

/** Bir masaya oturup oyunu başlatır. */
export async function openGame(page: Page, gid: string, setup?: string) {
  await page.evaluate((tbl) => { const g = (window as unknown as W).__game; g.sitDown(g.kahve.tableById(tbl).seats[0]); }, TABLE_FOR[gid]);
  const card = page.locator(`.game-card[data-game="${gid}"]`);
  await expect(card).toBeVisible();
  if (setup) await page.evaluate(setup);
  await card.locator('button.primary').click();
  await expect(page.locator('.gui')).toBeVisible();
}

/** Oyun arayüzü üzerinde fonksiyon çalıştır (ui, s parametreleriyle). */
export async function withUI<T>(page: Page, fnBody: string): Promise<T> {
  return page.evaluate((body) => {
    const ui = (window as unknown as W).__game.session.ui;
    // eslint-disable-next-line no-new-func
    return new Function('ui', 's', 'game', body)(ui, ui.s, (window as unknown as W).__game);
  }, fnBody) as Promise<T>;
}
