import { test, expect, Page } from '@playwright/test';
import { trackErrors, W } from './helpers';

const SERVER = 'http://localhost:8788';

async function bootAt(page: Page, query = '') {
  await page.goto(`/?speed=6&server=${encodeURIComponent(SERVER)}${query}`);
  await page.waitForFunction(() => !!(window as unknown as W).__game && (window as unknown as W).__game.frame > 3);
}

/** Ali `table` masasında oda kurar; Veli kart masasından kodla katılır (oda türüne göre doğru masaya geçirilmeli) */
async function setupRoom(A: Page, B: Page, table: string) {
  await bootAt(A);
  await A.evaluate((t) => { const g = (window as unknown as W).__game; g.sitDown(g.kahve.tableById(t).seats[0]); }, table);
  await A.locator('.online-entry button:has-text("Oda kur")').click();
  await A.locator('.online-panel .cr-name input').fill('Ali');
  await A.locator('.online-panel button:has-text("Oda kur ▶")').click();
  const code = (await A.locator('.room-code').first().textContent())!.trim();
  await bootAt(B);
  await B.evaluate(() => { const g = (window as unknown as W).__game; g.sitDown(g.kahve.tableById('kart1').seats[0]); });
  await B.locator('.online-entry .code-input').fill(code);
  await B.locator('.online-entry button:has-text("Koda katıl")').click();
  await B.locator('.online-panel .cr-name input').fill('Veli');
  await B.locator('.online-panel button:has-text("Katıl ▶")').click({ force: true });
  await expect(A.locator('.online-seats')).toContainText('Veli');
  return code;
}

const ui = (p: Page, body: string) => p.evaluate((b) => new Function('ui', 's', b)((window as unknown as W).__game.session.ui, (window as unknown as W).__game.session.ui.s), body);

test('Çevrimiçi okey: okey masasında oda; kart masasından koda katılan okey masasına geçer; taş çek-at birlikte', async ({ browser }) => {
  test.setTimeout(200_000);
  const A = await (await browser.newContext()).newPage();
  const B = await (await browser.newContext()).newPage();
  const errs = [trackErrors(A), trackErrors(B)];
  await setupRoom(A, B, 'okey2');
  // Veli artık bir okey masasında
  expect(await B.evaluate(() => (window as unknown as W).__game.session.seat.table.kind)).toBe('okey');
  // oyun seçimi yalnızca okey ve 101
  await expect(A.locator('.online-games button')).toHaveCount(2);
  await A.locator('.online-games button[data-game="okey"]').click();
  await A.locator('.online-panel button:has-text("Başlat")').click();
  await expect(A.locator('.gui.okey')).toBeVisible();
  await expect(B.locator('.gui.okey')).toBeVisible();
  // Veli'nin ıstakası 14 ya da 15 taş, diğer eller kapalı
  expect(await ui(B, 'return s.hands[0].length')).toBeGreaterThanOrEqual(14);
  expect(await ui(A, 'return s.hands.slice(1).flat().every((t) => t.id < 0)')).toBe(true);
  // sırası gelen çeker ve atar; 8 atış olana kadar
  const discards = (p: Page) => ui(p, 'return s.discards.flat().length') as Promise<number>;
  const step = (p: Page) => ui(p, `if (s.current !== 0 || s.phase === 'ended') return; if (s.phase === 'draw') ui.drawDeck(); else ui.discard(s.hands[0][s.hands[0].length - 1].id);`);
  const until = Date.now() + 120_000;
  while (Date.now() < until && (await discards(A)) < 8) { await step(A); await step(B); await A.waitForTimeout(300); }
  expect(await discards(A)).toBeGreaterThanOrEqual(8);
  await B.waitForTimeout(1200);
  // iki ekranda aynı atılan taşlar (koltuklar döndürülmüş: Ali'nin önü Veli'nin solu)
  const aPiles = await ui(A, 'return s.discards.map((d) => d.map((t) => t.id))') as number[][];
  const bPiles = await ui(B, 'return s.discards.map((d) => d.map((t) => t.id))') as number[][];
  const aOwn = aPiles[0].length ? aPiles[0] : null;
  if (aOwn) expect(bPiles[3]).toEqual(aOwn);
  expect(bPiles.flat().sort()).toEqual(aPiles.flat().sort());
  for (const e of errs) expect(e.filter((x) => !x.includes('WebSocket'))).toEqual([]);
});

test('Çevrimiçi tavla: iki kişilik oda; Veli tahtayı kendi tarafından görür; zar ve hamle karşıya ulaşır', async ({ browser }) => {
  test.setTimeout(200_000);
  const A = await (await browser.newContext()).newPage();
  const B = await (await browser.newContext()).newPage();
  const errs = [trackErrors(A), trackErrors(B)];
  await setupRoom(A, B, 'tavla2');
  expect(await B.evaluate(() => (window as unknown as W).__game.session.seat.table.kind)).toBe('tavla');
  await expect(A.locator('.oseat')).toHaveCount(2);
  await A.locator('.online-panel button:has-text("Başlat")').click();
  await expect(A.locator('.gui.tavla')).toBeVisible();
  await expect(B.locator('.gui.tavla')).toBeVisible();
  // ikisi de kendini beyaz ve başlangıç diziliminde görür
  const start = [-2, 0, 0, 0, 0, 5, 0, 3, 0, 0, 0, -5, 5, 0, 0, 0, -3, 0, -5, 0, 0, 0, 0, 2];
  expect(await ui(A, 'return s.points')).toEqual(start);
  expect(await ui(B, 'return s.points')).toEqual(start);
  // açılış (Ali) → sırası gelen zar atar ve tüm hamlelerini oynar; 3 tur
  await A.locator('.gui.tavla button:has-text("Açılış zarı")').click();
  let moved = 0;
  const until = Date.now() + 120_000;
  while (Date.now() < until && moved < 6) {
    for (const p of [A, B]) {
      const r = await p.evaluate(() => {
        const ui = (window as unknown as W).__game.session.ui;
        const s = ui.s;
        if (s.current !== 0) return 0;
        if (s.phase === 'roll') { ui.roll(); return 0; }
        if (s.phase === 'move' && s.remaining.length) {
          const pts = [...document.querySelectorAll('.gui.tavla .pt.src, .gui.tavla .bar.src')] as HTMLElement[];
          if (!pts.length) return 0;
          pts[0].click();
          const tgt = document.querySelector('.gui.tavla .pt.tgt, .gui.tavla .off.tgt') as HTMLElement | null;
          if (tgt) { tgt.click(); return 1; }
        }
        return 0;
      });
      moved += r;
    }
    await A.waitForTimeout(400);
  }
  expect(moved).toBeGreaterThanOrEqual(6);
  await A.waitForTimeout(1500);
  // iki ekran aynı oyunu görür: Ali'nin tahtası Veli'ninkinin aynası
  const pa = await ui(A, 'return s.points') as number[];
  const pb = await ui(B, 'return s.points') as number[];
  expect(pb).toEqual(pa.map((_, i) => -pa[23 - i] || 0));
  for (const e of errs) expect(e.filter((x) => !x.includes('WebSocket'))).toEqual([]);
});
