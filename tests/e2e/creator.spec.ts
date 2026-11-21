import { test, expect } from '@playwright/test';
import { boot, trackErrors, W } from './helpers';

const spec = (page: any) => page.evaluate(() => (window as unknown as W).__game.player.spec);

test('Karakter oluşturucu: C ile açılır, canlı değişir, kaydedilir ve sayfa yenilenince korunur; vazgeç geri alır', async ({ page }) => {
  const errs = trackErrors(page);
  await boot(page);
  await page.evaluate(() => localStorage.removeItem('kahvehane.character.v1'));
  await page.keyboard.press('KeyC');
  await expect(page.locator('.creator .cr-panel')).toBeVisible();
  await expect(page.locator('.cr-panel h2')).toContainText('oluştur');
  const model0 = await page.evaluate(() => (window as unknown as W).__game.player.model.root.uuid);
  // ad + saç + şapka + şablon
  await page.locator('.cr-name input').fill('Kahveci <b>Kaan</b>');
  await page.locator('.cr-tabs button[data-tab="hair"]').click();
  await page.locator('.cr-chips[data-key="hair"] button[data-v="bald"]').click();
  await page.locator('.cr-chips[data-key="hat"] button[data-v="fez"]').click();
  await page.locator('.cr-tabs button[data-tab="outfit"]').click();
  await page.locator('.cr-chips[data-key="template"] button[data-v="memur"]').click();
  await page.waitForFunction(() => (window as unknown as W).__game.player.spec.accessories.includes('tie'));
  // önizleme oyunun kendisi: model yeniden kuruldu ve sahnede tek oyuncu modeli var
  expect(await page.evaluate(() => (window as unknown as W).__game.player.model.root.uuid)).not.toBe(model0);
  expect(await page.evaluate(() => { const g = (window as unknown as W).__game; return g.scene.children.filter((c: any) => c.userData.character === g.player).length; })).toBe(1);
  // oluşturucu açıkken yürüme/etkileşim kapalı
  const p0 = await page.evaluate(() => (window as unknown as W).__game.player.pos.z);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(400); await page.keyboard.up('KeyW');
  expect(await page.evaluate(() => (window as unknown as W).__game.player.pos.z)).toBeCloseTo(p0, 3);
  await page.locator('.cr-panel button:has-text("Kaydet")').click();
  await expect(page.locator('.creator')).toHaveCount(0);
  const saved = await spec(page);
  expect(saved.name).toBe('Kahveci bKaan'); // HTML işaretleri atılır, 16 karakter sınırı
  expect(saved.hair).toBe('bald');
  expect(saved.accessories).toEqual(expect.arrayContaining(['fez', 'tie']));
  // sayfa yenilenince korunur
  await boot(page);
  expect(await spec(page)).toEqual(saved);
  // vazgeç: değişiklik geri alınır, kayıt değişmez
  await page.keyboard.press('KeyC');
  await expect(page.locator('.cr-panel h2')).toHaveText('👤 Karakterin');
  await page.locator('.cr-tools button:has-text("Rastgele")').click();
  await page.waitForFunction((s) => JSON.stringify((window as unknown as W).__game.player.spec) !== s, JSON.stringify(saved));
  await page.locator('.cr-panel button:has-text("Vazgeç")').click();
  expect(await spec(page)).toEqual(saved);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('kahvehane.character.v1')!))).toEqual(saved);
  // yürüme geri gelir
  await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW');
  expect(await page.evaluate(() => (window as unknown as W).__game.player.pos.z)).not.toBeCloseTo(p0, 1);
  expect(errs).toEqual([]);
});

test('Karakter oluşturucu telefonda: menüden açılır, panel ekrana sığar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errs = trackErrors(page);
  await boot(page);
  await page.locator('#menuBtn').click();
  await page.locator('#openCreator').click();
  const box = await page.locator('.cr-panel').boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(391);
  expect(box!.y + box!.height).toBeLessThanOrEqual(845);
  await page.locator('.cr-tabs button[data-tab="voice"]').click();
  await page.locator('.cr-body button:has-text("Bir laf et")').click();
  await page.locator('.cr-panel button:has-text("Kaydet")').click();
  await expect(page.locator('.creator')).toHaveCount(0);
  expect(errs).toEqual([]);
});
