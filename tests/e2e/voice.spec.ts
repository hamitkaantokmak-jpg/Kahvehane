import { test, expect } from '@playwright/test';
import { boot, trackErrors, W } from './helpers';

test('NPC mırıltısı: en yakın 3 kişi sesli, diğerleri balon; ağız hareketi; ayarla kapanır', async ({ page }) => {
  const errs = trackErrors(page);
  await boot(page);
  await page.mouse.click(640, 400); // ses kilidini aç (kullanıcı etkileşimi)
  await page.waitForFunction(() => !!(window as unknown as W).__game && (window as unknown as W).__game.voice && (window as any).__game.voice);
  const res = await page.evaluate(() => {
    const g = (window as unknown as W).__game;
    const ctxOk = !!(g as any).voice && !!(window as any).__game;
    g.voice.spoken.length = 0; g.voice.muted.length = 0;
    // 6 NPC'yi oyuncuya farklı uzaklıklara diz, hepsi aynı anda konuşsun
    const ids = ['riza', 'cemal', 'nihat', 'kemal', 'ferhat', 'hasan'];
    ids.forEach((id, i) => { const n = g.npcs.find((x: any) => x.id === id); n.c.stopWalking(); n.mode = 'inGame'; if (n.c.seated) n.c.standUp(); n.c.pos.set(g.player.pos.x + 1 + i * 1.5, 0, g.player.pos.z - 1); });
    g.rig.update(0.016, g.player.pos.clone().setY(1.2));
    ids.forEach((id) => g.npcs.find((x: any) => x.id === id).c.say('Bahse girerim bu çay soğuk!', 3));
    return { ctxOk, spoken: [...g.voice.spoken], muted: [...g.voice.muted], talking: g.npcs.find((x: any) => x.id === 'hasan').c.anim.talking };
  });
  expect(res.ctxOk).toBe(true);
  expect(res.spoken.length).toBeGreaterThan(0);
  expect(res.spoken.length).toBeLessThanOrEqual(3);
  expect(res.spoken).toContain('riza'); // en yakın
  expect(res.muted).toContain('hasan'); // en uzak: yalnızca balon
  expect(res.talking).toBe(true); // sesi olmasa da ağzı oynar
  // ayar kapalıyken hiç ses yok
  const off = await page.evaluate(() => {
    const g = (window as unknown as W).__game;
    g.applySettings({ ...g.settings, npcVoices: false });
    g.voice.spoken.length = 0;
    g.npcs.find((x: any) => x.id === 'riza').c.say('Sessiz mi oldum?', 2);
    return g.voice.spoken.length;
  });
  expect(off).toBe(0);
  expect(errs).toEqual([]);
});
