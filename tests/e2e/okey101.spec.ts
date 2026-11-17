import { test, expect, Page } from '@playwright/test';
import { boot, openGame, trackErrors, withUI } from './helpers';

const PRE = `let id = 900; const T = (c, n) => ({ id: id++, color: c, num: n, fake: false }); s.ctx = { okeyColor: 3, okeyNum: 7 };`;

async function selectIds(page: Page, ids: number[]) {
  for (const id of ids) await page.locator(`.rack .tile[data-id="${id}"]`).click();
}

test('101: per hazırlayıp 101 ile açma, işleme, ceza penceresi, geri koy, el ve seri sonu', async ({ page }) => {
  const errs = trackErrors(page);
  await boot(page);
  await openGame(page, 'okey101');
  // kurgu: A=36 (kırmızı 11-13) B=30 (10'lar) C=36 (9'lar) → 102; on1 seriye işlenir, on2 gruba işlenebilir (cezalı atış)
  const ids = await withUI<Record<string, number[]>>(page, `${PRE}
    const A = [T(0,11),T(0,12),T(0,13)], B = [T(1,10),T(2,10),T(3,10)], C = [T(0,9),T(1,9),T(2,9),T(3,9)];
    const on1 = T(0,10), on2 = T(0,10), x = T(1,1), y = T(2,2), z = T(1,4);
    s.hands[0] = [...A, ...B, ...C, on1, on2, x, y, z];
    s.current = 0; s.phase = 'play';
    ui.rack.slots.fill(null); ui.refresh();
    const I = (a) => a.map((t) => t.id);
    return { A: I(A), B: I(B), C: I(C), on1: [on1.id], on2: [on2.id], x: [x.id], y: [y.id], z: [z.id] };`);
  for (const g of [ids.A, ids.B, ids.C]) {
    await selectIds(page, g);
    await page.locator('.gbtns button:has-text("Per hazırla")').click();
  }
  await expect(page.locator('.stage-sum')).toContainText('102/101');
  await page.locator('.gbtns button:text-is("Aç ✔")').click();
  expect(await withUI(page, 'return [s.opened[0], s.table.length]')).toEqual(['melds', 3]);
  // işleme: 10 → kırmızı 11-13 serisine
  await selectIds(page, ids.on1);
  await page.locator('.meld-table .meld').first().click();
  expect(await withUI(page, 'return s.table[0].tiles.length')).toBe(4);
  // cezalı atış: ikinci kırmızı 10 gruba işlenebilir → kendi penceremiz çıkar, vazgeç
  await selectIds(page, ids.on2);
  await page.locator('.gbtns button:text-is("At")').click();
  await expect(page.locator('.penalty-modal')).toContainText('101 ceza');
  await page.locator('.penalty-modal button:has-text("Vazgeç")').click();
  expect(await withUI(page, 'return s.penalties[0]')).toBe(0);
  // normal atış
  await selectIds(page, ids.on2);
  await selectIds(page, ids.x);
  await page.locator('.gbtns button:text-is("At")').click();
  expect(await withUI(page, 'return s.current')).not.toBe(0);

  // yerden alma + geri koy
  await expect(page.locator('.status')).toContainText('çek', { timeout: 90_000 });
  await withUI(page, `if (!s.discards[3].length) s.discards[3].push({ id: 990, color: 1, num: 12, fake: false }); ui.refresh();`);
  await page.locator('.p101 .pile.clickable').click();
  await expect(page.locator('.gbtns button:has-text("Geri koy")')).toBeVisible();
  await page.locator('.gbtns button:has-text("Geri koy")').click();
  expect(await withUI(page, 'return [s.phase, s.takenDiscard]')).toEqual(['draw', null]);
  await page.locator('.deck.clickable').click();

  // el sonu: tek taş kaldı → at → bitir; seri son el
  const last = await withUI<number>(page, `${PRE} s.options.hands = s.handNo; const t = T(2,2); s.hands[0] = [t]; s.takenDiscard = null; ui.rack.slots.fill(null); ui.refresh(); return t.id;`);
  await selectIds(page, [last]);
  await page.locator('.gbtns button:text-is("At")').click();
  const modal = page.locator('.modal');
  await expect(modal).toContainText('Eli sen bitirdin');
  await expect(modal).toContainText('-101');
  await expect(modal).toContainText('Seriyi');
  expect(errs).toEqual([]);
});

test('101: çift açma ve çift serme', async ({ page }) => {
  const errs = trackErrors(page);
  await boot(page);
  await openGame(page, 'okey101');
  const pairs = await withUI<number[][]>(page, `${PRE}
    const P = [[T(0,1),T(0,1)],[T(1,2),T(1,2)],[T(2,3),T(2,3)],[T(3,4),T(3,4)],[T(0,5),T(0,5)]];
    const extra = [T(1,6), T(1,6), T(2,8), T(3,11)];
    s.hands[0] = [...P.flat(), ...extra]; s.current = 0; s.phase = 'play';
    ui.rack.slots.fill(null); ui.refresh();
    return [...P, [extra[0], extra[1]]].map((p) => p.map((t) => t.id));`);
  for (const p of pairs.slice(0, 5)) {
    for (const id of p) await page.locator(`.rack .tile[data-id="${id}"]`).click();
    await page.locator('.gbtns button:has-text("Per hazırla")').click();
  }
  await expect(page.locator('.stage-sum')).toContainText('5/5 çift');
  await page.locator('.gbtns button:has-text("Çift aç")').click();
  expect(await withUI(page, 'return [s.opened[0], s.table.length]')).toEqual(['pairs', 5]);
  // aynı tur bir çift daha ser
  for (const id of pairs[5]) await page.locator(`.rack .tile[data-id="${id}"]`).click();
  await page.locator('.gbtns button:has-text("Per hazırla")').click();
  await page.locator('.gbtns button:text-is("Ser ✔")').click();
  expect(await withUI(page, 'return s.table.length')).toBe(6);
  expect(errs).toEqual([]);
});
