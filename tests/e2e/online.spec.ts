import { test, expect, Page } from '@playwright/test';
import { trackErrors, W } from './helpers';

const SERVER = 'http://localhost:8788';

async function bootAt(page: Page, query: string) {
  await page.goto(`/?speed=6&server=${encodeURIComponent(SERVER)}${query}`);
  await page.waitForFunction(() => !!(window as unknown as W).__game && (window as unknown as W).__game.frame > 3);
}

/** Sıra bende ise bir hamle yap (ihale: pas/ilk, koz: ilk, kart: oynanabilir ilk) */
async function stepIfMyTurn(page: Page) {
  const pass = page.locator('.bid-panel button[data-bid="pass"]');
  if (await pass.count()) { await pass.click().catch(() => {}); return; }
  const bid = page.locator('.bid-panel button[data-bid]');
  if (await bid.count()) { await bid.first().click().catch(() => {}); return; }
  const suit = page.locator('.bid-panel button[data-suit]');
  if (await suit.count()) { await suit.first().click().catch(() => {}); return; }
  const card = page.locator('.phand .card.playable');
  if (await card.count()) await card.first().click().catch(() => {});
}

test('Çevrimiçi: oda kur, davet bağlantısıyla katıl, batak oyna; laf ve çay öbür ekrana ulaşır', async ({ browser }) => {
  test.setTimeout(240_000);
  const A = await (await browser.newContext()).newPage();
  const B = await (await browser.newContext()).newPage();
  const errsA = trackErrors(A), errsB = trackErrors(B);
  // Ali oda kurar
  await bootAt(A, '');
  await A.evaluate(() => { const g = (window as unknown as W).__game; g.sitDown(g.kahve.tableById('kart2').seats[0]); });
  await A.locator('.online-entry button:has-text("Oda kur")').click();
  await A.locator('.online-panel .cr-name input').fill('Ali');
  await A.locator('.online-panel button:has-text("Oda kur ▶")').click();
  const code = (await A.locator('.room-code').first().textContent())!.trim();
  expect(code).toMatch(/^[A-Z]{4}$/);
  // Veli davet bağlantısıyla gelir
  await bootAt(B, `&oda=${code}`);
  await B.locator('.invite-modal button:has-text("Masaya otur")').click();
  await B.locator('.online-panel .cr-name input').fill('Veli');
  await B.locator('.online-panel button:has-text("Katıl ▶")').click();
  await expect(B.locator('.oseat.me')).toContainText('Veli');
  await expect(A.locator('.online-seats')).toContainText('Veli');
  // yalnızca oda sahibi başlatır
  await expect(B.locator('.online-panel')).toContainText('Oda sahibinin başlatması bekleniyor');
  await A.locator('.online-panel button:has-text("Başlat")').click();
  await expect(A.locator('.trick-table')).toBeVisible();
  await expect(B.locator('.trick-table')).toBeVisible();
  // Veli'nin ekranında Ali kendi karakteriyle masada oturuyor
  expect(await B.evaluate(() => (window as unknown as W).__game.scene.children.some((c: any) => c.userData.character?.spec.name === 'Ali'))).toBe(true);
  // birlikte oyna: en az 2 el alınana kadar
  const sum = (p: Page) => p.evaluate(() => { const s = (window as unknown as W).__game.session.ui.s; return s.tricksWon.reduce((a: number, b: number) => a + b, 0); });
  const until = Date.now() + 150_000;
  while (Date.now() < until && (await sum(A)) < 2) { await stepIfMyTurn(A); await stepIfMyTurn(B); await A.waitForTimeout(250); }
  expect(await sum(A)).toBeGreaterThanOrEqual(2);
  await B.waitForTimeout(800);
  expect(await sum(B)).toBe(await sum(A));
  // iki ekran aynı ihaleyi görür (göreli koltuklar farklı ama ihale aynı)
  const bidA = await A.evaluate(() => (window as unknown as W).__game.session.ui.s.highBid);
  expect(await B.evaluate(() => (window as unknown as W).__game.session.ui.s.highBid)).toBe(bidA);
  // Veli'nin eli Ali'de kapalı görünür
  expect(await A.evaluate(() => (window as unknown as W).__game.session.ui.s.hands.slice(1).flat().every((c: any) => c.rank === 0))).toBe(true);
  // laf at: Veli'nin ekranında Ali'nin balonu
  await A.locator('.online-chaos button[data-chaos="taunt"]').click();
  await A.locator('.taunt-pick button').first().click();
  await expect(B.locator('.bubble').filter({ hasText: 'Hadi oyna' })).toBeVisible({ timeout: 10_000 });
  // çay at: Veli'nin yüzü çaylanır
  await A.waitForTimeout(2600);
  await A.locator('.online-chaos button[data-chaos="tea"]').click();
  await A.locator('.throw-pick button:has-text("Veli")').click();
  await B.waitForFunction(() => (window as unknown as W).__game.player.stain.remaining > 0, null, { timeout: 40_000 });
  expect(errsA.filter((e) => !e.includes('WebSocket'))).toEqual([]);
  expect(errsB.filter((e) => !e.includes('WebSocket'))).toEqual([]);
});
