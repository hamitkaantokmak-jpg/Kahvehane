import { test, expect, Page } from '@playwright/test';
import { boot, openGame, trackErrors, withUI } from './helpers';

async function playUntilHandEnd(page: Page) {
  const until = Date.now() + 120_000;
  while (Date.now() < until) {
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
    // kurgu (kart sayısını koruyarak): yerdeki 4 kart rakip tarafa geçer, yere elimdeki bir kartla aynı değerde tek kart konur
    await page.waitForFunction(() => document.querySelectorAll('.phand .card.playable').length > 0);
    // kurgu (kart sayılarını koruyarak): yerde yalnızca üst kart kalır (diğerleri rakip tarafa),
    // destedeki aynı değerli bir kart elimdeki ilk kartla yer değiştirir → PİŞTİ
    const mine = await withUI<number>(page, `
      // destede aynı değerde iki kart bul (13 değer, 40+ kart → her zaman var)
      let a = -1, b = -1;
      for (let x = 0; x < s.deck.length && b < 0; x++) for (let y = x + 1; y < s.deck.length; y++) if (s.deck[x].rank === s.deck[y].rank && s.deck[x].rank !== 11) { a = x; b = y; break; }
      const d1 = s.deck[a], d2 = s.deck[b];
      const old = s.pile;
      s.deck[a] = old.length ? old.pop() : (s.captured[0].pop() || s.captured[1].pop()); s.captured[1].push(...old);   // yerdeki kartlar: biri desteye, gerisi rakibe
      s.deck[b] = s.hands[0][0]; s.hands[0][0] = d2;       // elime aynı değerli kart
      s.pile = [d1]; s.hiddenCount = 0;
      ui.refresh(); return d2.id;`);
    await page.locator(`.phand .card[data-id="${mine}"]`).click();
    await expect(page.locator('.splash')).toContainText('PİŞTİ');
    expect(await withUI(page, 'return s.pistis[0]')).toBe(10);
    await playUntilHandEnd(page);
    const modal = page.locator('.modal');
    await expect(modal).toContainText('El 1 bitti');
    await expect(modal.locator('table.score tr')).toHaveCount(3);
    // kart korunumu
    expect(await withUI(page, 'return s.captured.flat().length')).toBe(52);
    // maç sonu: hedefi düşür, bir el daha oyna
    await withUI(page, 's.options.target = 1;');
    await modal.locator('button:has-text("Sonraki el")').click();
    await playUntilHandEnd(page);
    await expect(page.locator('.modal')).toContainText('Maçı');
    expect(errs).toEqual([]);
  });
}

test('Pişti masa görünümü: herkes kendi kenarında, aldığın kartlar senin önünde yığılır', async ({ page }) => {
  const errs = trackErrors(page);
  await boot(page);
  await openGame(page, 'pisti4');
  for (const z of ['top', 'left', 'right', 'bottom']) await expect(page.locator(`.ptable .pseat.${z}`)).toBeVisible();
  await expect(page.locator('.pseat.top .oplate')).toContainText('ortak');
  // yerde aynı değerli tek kart + elimde eşi → alırsın (pişti), yığın senin önünde büyür
  const mine = await withUI<number>(page, `
    s.current = 0; s.phase = 'play';
    const c = s.hands[0][0];
    const twin = { id: 9990, suit: (c.suit + 1) % 4, rank: c.rank };
    s.pile = [twin]; s.hiddenCount = 0; ui.refresh(); return c.id;`);
  await expect(page.locator('.pseat.bottom .pcap .pl')).toContainText('0 kart');
  await page.locator(`.phand .card[data-id="${mine}"]`).click();
  await expect(page.locator('.pseat.bottom .pcap .pl')).toContainText('2 kart');
  await expect(page.locator('.pseat.bottom .pcap .pl')).toContainText('pişti');
  await expect(page.locator('.pinfo .pside.me')).toBeVisible();
  expect(errs).toEqual([]);
});
