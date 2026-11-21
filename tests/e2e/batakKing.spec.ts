import { test, expect, Page } from '@playwright/test';
import { boot, openGame, trackErrors, withUI } from './helpers';

/** İnsan sırası geldikçe oynanabilir ilk kartı oyna; modal çıkana kadar */
async function playUntilModal(page: Page, limit = 150_000) {
  const until = Date.now() + limit;
  while (Date.now() < until) {
    if (await page.locator('.modal').count()) return;
    const c = page.locator('.phand .card.playable');
    if (await c.count()) await c.first().click().catch(() => {});
    await page.waitForTimeout(120);
  }
}

test('Batak: ihale (13 = hemen biter), koz seçimi, kural dışı kart engellenir, el sonu tablosu, sonraki el', async ({ page }) => {
  test.setTimeout(240_000);
  const errs = trackErrors(page);
  await boot(page);
  await openGame(page, 'batak');
  await expect(page.locator('.bid-panel button[data-bid="pass"]')).toBeVisible();
  await expect(page.locator('.bid-panel button[data-bid="4"]')).toHaveCount(0); // en az 5
  await page.locator('.bid-panel button[data-bid="13"]').click();
  await expect(page.locator('.bid-panel button[data-suit]')).toHaveCount(4);
  // kozu en kısa renk yap: elde koz dışı kart kalsın, koz açılmadan kozla açılamaz
  const trump = await withUI<number>(page, 'const n = [0,1,2,3].map((x) => s.hands[0].filter((c) => c.suit === x).length); return n.indexOf(Math.min(...n.filter((v) => v > 0)));');
  await page.locator(`.bid-panel button[data-suit="${trump}"]`).click();
  expect(await withUI(page, 'return [s.phase, s.trump, s.current]')).toEqual(['play', trump, 0]);
  const blocked = page.locator('.phand .card.blocked');
  if (await blocked.count()) { await blocked.first().click(); await expect(page.locator('.toast')).toContainText('Koz açılmadan'); }
  await expect(page.locator('.tcenter .tslot .card')).toHaveCount(0);
  await page.locator('.phand .card.playable').first().click();
  await expect(page.locator('.tslot.bottom .card')).toHaveCount(1);
  // eli bitir
  await playUntilModal(page);
  const modal = page.locator('.modal');
  await expect(modal).toContainText(/ihaleyi tutturdu|battı/);
  const st = await withUI<{ made: boolean; total: number; tricks: number }>(page, 'return { made: s.made, total: s.totals[0], tricks: s.tricksWon[0] }');
  expect(st.total).toBe(st.made ? st.tricks : -13);
  await modal.locator('button:has-text("Sonraki el")').click();
  expect(await withUI(page, 'return [s.handNo, s.phase, s.hands[0].length]')).toEqual([2, 'bid', 13]);
  expect(errs).toEqual([]);
});

test('Batak eşli + el almayan cezalı: ortaklar aynı puanı alır, maç sonunda kazanan takım belli olur', async ({ page }) => {
  test.setTimeout(240_000);
  const errs = trackErrors(page);
  await boot(page);
  await openGame(page, 'batak', `document.querySelector('.game-card[data-game="batak"] input[data-o="batakPartners"]').click(); document.querySelector('.game-card[data-game="batak"] input[data-o="batakZeroPenalty"]').click(); const sel = document.querySelector('.game-card[data-game="batak"] select[data-o="batakHands"]'); sel.value = '3'; sel.dispatchEvent(new Event('change'));`);
  expect(await withUI(page, 'return [s.options.partners, s.options.hands, s.options.zeroPenalty]')).toEqual([true, 3, true]);
  await expect(page.locator('.bid-panel button[data-bid="7"]')).toBeVisible(); // eşlide en az 7
  await expect(page.locator('.pseat.top .oplate')).toContainText('ortak');
  await withUI(page, 's.handNo = 3; ui.refresh();'); // son el
  await page.locator('.bid-panel button[data-bid="pass"]').click();
  // ihale botlarda; gerekirse kozu ben seçerim (herkes pas derse)
  const until = Date.now() + 200_000;
  while (Date.now() < until && !(await page.locator('.modal').count())) {
    if (await page.locator('.bid-panel button[data-suit]').count()) await page.locator('.bid-panel button[data-suit]').first().click();
    else if (await page.locator('.bid-panel button[data-bid]').count()) await page.locator('.bid-panel button[data-bid]').first().click();
    const c = page.locator('.phand .card.playable');
    if (await c.count()) await c.first().click().catch(() => {});
    await page.waitForTimeout(120);
  }
  await expect(page.locator('.modal')).toContainText('Maçı');
  await expect(page.locator('.modal')).toContainText('El almayan cezalı');
  // puanlar kurala uygun: ihaleci olmayan takım hiç el almadıysa ihale kadar eksi
  const chk = await withUI<{ ok: boolean }>(page, `const t = (p) => s.tricksWon[p] + s.tricksWon[(p + 2) % 4]; const b = s.bidder; const other = (b + 1) % 2; const want = t(other) === 0 ? -s.highBid : t(other); return { ok: s.handScores[other] === want };`);
  expect(chk.ok).toBe(true);
  const t = await withUI<number[]>(page, 'return s.totals');
  expect(t[0]).toBe(t[2]);
  expect(t[1]).toBe(t[3]);
  expect(errs).toEqual([]);
});

test('King: oyun seçimi, rıfkı kuralı, ceza yazılır, tablo; kısa King 8 el', async ({ page }) => {
  test.setTimeout(240_000);
  const errs = trackErrors(page);
  await boot(page);
  await openGame(page, 'king', `document.querySelector('.game-card[data-game="king"] input[data-o="kingShort"]').click();`);
  expect(await withUI(page, 'return s.options.short')).toBe(true);
  await expect(page.locator('.bid-panel button[data-contract]')).toHaveCount(7);
  await page.locator('.bid-panel button[data-contract="rifki"]').click();
  expect(await withUI(page, 'return [s.contract, s.phase, s.current]')).toEqual(['rifki', 'play', 0]);
  await expect(page.locator('.tinfo')).toContainText('Rıfkı');
  // kurgu: elimde kupa papazı ve tek maça; maça açılınca rengim yoksa papaz zorunlu
  await withUI(page, `
    const all = s.hands.flat(); const find = (su, r) => all.find((c) => c.suit === su && c.rank === r);
    const K = find(1, 13);
    for (const h of s.hands) { const i = h.indexOf(K); if (i >= 0) h.splice(i, 1); }
    // elimde maça kalmasın (ben açmıyorum: sırayı rakibe ver ve maça açtır)
    const spades = s.hands[0].filter((c) => c.suit === 0);
    s.hands[0] = s.hands[0].filter((c) => c.suit !== 0); s.hands[1].push(...spades);
    s.hands[0].push(K);
    // kart sayılarını dengele
    while (s.hands[0].length < 13) { const d = s.hands[1].find((c) => c.suit !== 0); s.hands[1].splice(s.hands[1].indexOf(d), 1); s.hands[0].push(d); }
    while (s.hands[1].length > 13) { const d = s.hands[1].find((c) => c.suit !== 0 && !(c.suit === 1 && c.rank === 13)); s.hands[1].splice(s.hands[1].indexOf(d), 1); s.hands[2].push(d); }
    s.current = 3; s.trick = [{ player: 3, card: s.hands[3].splice(s.hands[3].findIndex((c) => c.suit === 0) >= 0 ? s.hands[3].findIndex((c) => c.suit === 0) : 0, 1)[0] }];
    s.trick[0].card.suit === 0 || (s.trick[0].card = { ...s.trick[0].card, suit: 0 });
    s.current = 0; ui.refresh();`);
  await expect(page.locator('.phand .card.playable')).toHaveCount(1);
  expect(await withUI(page, 'const id = Number(document.querySelector(".phand .card.playable").dataset.id); return s.hands[0].find((c) => c.id === id).rank')).toBe(13);
  // eli oynayıp bitir
  await playUntilModal(page);
  await expect(page.locator('.modal')).toContainText('Rıfkı bitti');
  await expect(page.locator('.modal .king-score')).toContainText('Rıfkı');
  const sc = await withUI<number[]>(page, 'return s.history[0].scores');
  expect(sc.reduce((a, b) => a + b, 0)).toBe(-320);
  expect(await withUI(page, 'return [s.cezaChosen[0], s.penaltyUses.rifki]')).toEqual([1, 1]);
  await page.locator('.modal button:has-text("Sonraki el")').click();
  expect(await withUI(page, 'return [s.handNo, s.chooser]')).toEqual([2, 1]);
  // maç sonu: son ele atla
  await withUI(page, 's.handNo = 8; ui.refresh();');
  const until = Date.now() + 200_000;
  while (Date.now() < until && !(await page.locator('.modal').count())) {
    if (await page.locator('.bid-panel button.contract:not(.disabled)').count()) await page.locator('.bid-panel button.contract:not(.disabled)').first().click();
    else if (await page.locator('.bid-panel button[data-suit]').count()) await page.locator('.bid-panel button[data-suit]').first().click();
    const c = page.locator('.phand .card.playable');
    if (await c.count()) await c.first().click().catch(() => {});
    await page.waitForTimeout(120);
  }
  await expect(page.locator('.modal')).toContainText("King'i");
  expect(errs).toEqual([]);
});
