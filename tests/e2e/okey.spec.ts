import { test, expect } from '@playwright/test';
import { boot, openGame, trackErrors, withUI } from './helpers';

const RIG_WIN = `
  let id = 900; const T = (c, n) => ({ id: id++, color: c, num: n, fake: false });
  s.ctx = { okeyColor: 3, okeyNum: 7 };
  s.current = 0; s.phase = 'discard';
  s.hands[0] = [T(0,1),T(0,2),T(0,3),T(1,5),T(2,5),T(3,5),T(2,10),T(2,11),T(2,12),T(2,13),T(0,9),T(1,9),T(2,9),T(3,9),T(1,1)];
  ui.rack.slots.fill(null); ui.refresh();
  return s.hands[0][14].id;
`;

test('Klasik Okey: normal tur, Bitir ile el bitirme, sonraki el ve maç sonu', async ({ page }) => {
  const errs = trackErrors(page);
  await boot(page);
  await openGame(page, 'okey');
  await expect(page.locator('.rack .tile')).toHaveCount(15);
  // normal tur: bir taş at → botlar oynar → sıra bana döner, çek + at
  await page.locator('.rack .tile').first().click();
  await page.locator('.gbtns button:text-is("At")').click();
  await expect(page.locator('.status')).toContainText('çek', { timeout: 60_000 });
  await page.locator('.deck.clickable').click();
  await expect(page.locator('.rack .tile')).toHaveCount(15);
  await page.locator('.rack .tile').first().click();
  await page.locator('.gbtns button:text-is("At")').click();
  await expect(page.locator('.status')).toContainText('çek', { timeout: 60_000 });

  // kurgulanmış kazanan el
  const finishId = await withUI<number>(page, RIG_WIN);
  await expect(page.locator('.hint')).toContainText('bitmeye hazır');
  await page.locator(`.rack .tile[data-id="${finishId}"]`).click();
  await page.locator('.gbtns button:has-text("Bitir")').click();
  const modal = page.locator('.modal');
  await expect(modal).toContainText('Eli sen bitirdin');
  await expect(modal.locator('table.score')).toContainText('18');
  await modal.locator('button:has-text("Sonraki el")').click();
  await expect(page.locator('.status')).toContainText('El 2');
  expect(await withUI<number>(page, 'return s.hands[0].length')).toBe(15); // kazanan başlar

  // maç sonu: rakipler 2 puanda
  await withUI(page, 's.scores = [20, 2, 2, 2];');
  const id2 = await withUI<number>(page, RIG_WIN);
  await page.locator(`.rack .tile[data-id="${id2}"]`).click();
  await page.locator('.gbtns button:has-text("Bitir")').click();
  await expect(page.locator('.modal')).toContainText('Maçı KAZANDIN');
  await page.locator('.modal button:has-text("Yeni maç")').click();
  await expect(page.locator('.status')).toContainText('El 1');
  expect(errs).toEqual([]);
});
