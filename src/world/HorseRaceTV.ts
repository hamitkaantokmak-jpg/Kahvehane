/**
 * TV'deki at yarışı (oyun katmanı). Saf motor: games/atyarisi/atyarisi.ts (sonuç tohumdan tek seferde belirlenir).
 * Bu sınıf yarışı TV ekranında oynatır, bahisleri (oyun içi sanal para) toplar, ödemeleri yapar, NPC'leri tepki verdirir.
 */
import * as A from '../games/atyarisi/atyarisi';
import type { Game } from '../core/Game';
import { h, btn } from '../ui/dom';
import { pickLine } from '../npc/personalities';
import { sfx } from '../audio/Sfx';
import { balanceOf, credit, debit, PLAYER } from '../economy/Economy';

export const BET_AMOUNTS = [5, 10, 20, 50];

export class HorseRaceTV {
  schedule: A.RaceSchedule;
  field: A.Horse[] = [];
  result: A.RaceResult | null = null;
  bets: A.RaceBet[] = [];
  private raceT = 0;
  private modal: HTMLDivElement | null = null;
  lastPayouts: { who: string; amount: number; win: boolean }[] = [];

  constructor(private game: Game, firstIn = 75) {
    this.schedule = A.newSchedule(Math.floor(game.rng() * 2 ** 31), firstIn);
  }

  get phase() { return this.schedule.phase; }
  get playerBet() { return this.bets.find((b) => b.who === PLAYER) ?? null; }

  /**
   * Maç gecesi (çevrimiçi): odadaki herkes aynı yarışı izler. Tohum sunucudan gelir; bahisler hemen açılır,
   * yarış `inMs` sonra başlar. Bahisler herkesin kendi oyun içi parasıyla; oyuncular arasında para geçmez.
   */
  syncRace(seed: number, inMs: number) {
    // ekranda yarış sürüyorsa bitince başlat (başlama anı korunur)
    if (this.schedule.phase === 'running') { this.pendingSync = { seed, at: performance.now() + inMs }; return; }
    this.pendingSync = null;
    this.closeModal();
    this.schedule.phase = 'betting';
    this.schedule.timer = Math.max(3, inMs / 1000);
    this.schedule.raceNo++;
    this.schedule.seed = seed >>> 0;
    this.openBetting();
  }

  /** Yarışı hemen başlat (test/hata ayıklama) */
  startNow() { this.schedule.phase = 'idle'; this.schedule.timer = 0; }

  private pendingSync: { seed: number; at: number } | null = null;

  update(dt: number) {
    if (this.pendingSync && this.schedule.phase !== 'running') { const p = this.pendingSync; this.syncRace(p.seed, Math.max(3000, p.at - performance.now())); }
    const dur = this.result?.duration ?? 20;
    const next = A.tickSchedule(this.schedule, dt, dur, this.game.rng);
    if (next === 'betting') this.openBetting();
    else if (next === 'running') this.startRace();
    else if (next === 'results') this.finish();
    else if (next === 'idle') { this.game.kahve.tv.overlay = null; this.closeModal(); }
    if (this.schedule.phase === 'running') this.raceT += dt;
  }

  private openBetting() {
    const seed = this.schedule.seed;
    this.field = A.makeField(seed);
    this.result = A.runRace(seed, this.field);
    this.bets = [];
    this.raceT = 0;
    this.game.kahve.tv.overlay = (g, w, hh, t) => this.draw(g, w, hh, t);
    this.game.hud.toast(`📺 At yarışı #${this.schedule.raceNo}: bahisler açıldı! TV'ye gidip E ile bahis yap (${A.SCHEDULE.betting} sn).`, 4);
    sfx.play('tvChannel');
    // NPC bahisleri: Cemal her zaman (sürpriz atlara), diğerleri bazen
    const s = this.game.economy.s;
    for (const n of this.game.npcs) {
      const always = n.id === 'cemal';
      if (!always && this.game.rng() > 0.3) continue;
      const pick = always
        ? [...this.field].sort((a, b) => b.odds - a.odds)[Math.floor(this.game.rng() * 3)] // iddialı: uzun oranlar
        : this.field[Math.floor(this.game.rng() * this.field.length)];
      const amount = always ? 20 : 10;
      if (balanceOf(s, n.id) < amount) continue;
      this.game.economy.tx((st) => debit(st, n.id, amount));
      this.bets.push({ who: n.id, horse: pick.id, amount });
      if (always || this.game.rng() < 0.5) setTimeout(() => n.c.say(`${amount}🪙 ${pick.name}'a! ${always ? 'Bahse girerim kazanır!' : ''}`, 3), 800 + this.game.rng() * 3000);
    }
  }

  /** Oyuncu bahsi (yalnızca nakit; veresiyeyle bahis olmaz) */
  placeBet(horse: number, amount: number): boolean {
    if (this.schedule.phase !== 'betting') { this.game.hud.toast('Şu an bahis alınmıyor.'); return false; }
    if (this.playerBet) { this.game.hud.toast('Bu yarışa zaten bahis yaptın.'); return false; }
    const ok = this.game.economy.tx((s) => debit(s, PLAYER, amount));
    if (!ok) { this.game.hud.toast('Bahis için nakit yetmiyor (veresiyeyle bahis olmaz).'); return false; }
    this.bets.push({ who: PLAYER, horse, amount });
    sfx.play('coin');
    this.game.hud.toast(`🐎 ${this.field[horse].name}'a ${amount}🪙 yatırdın (oran ×${this.field[horse].odds}).`);
    return true;
  }

  openBetUI() {
    if (this.schedule.phase !== 'betting') return;
    this.closeModal();
    const d = h('div', 'modal race-modal');
    const panel = h('div', 'panel');
    panel.appendChild(h('h3', '', `🐎 At yarışı #${this.schedule.raceNo} — bahis`));
    panel.appendChild(h('p', 'muted', 'Oyun içi kahve parasıyla. Kazanırsan yatırdığın × oran kadar alırsın.'));
    let amount = 10;
    const amtRow = h('div', 'stake-row');
    amtRow.appendChild(h('span', '', 'Miktar:'));
    for (const a of BET_AMOUNTS) {
      const b = btn(`${a}🪙`, `small${a === amount ? ' accent' : ''}`, () => { amount = a; amtRow.querySelectorAll('button').forEach((x) => x.classList.remove('accent')); b.classList.add('accent'); });
      amtRow.appendChild(b);
    }
    panel.appendChild(amtRow);
    const list = h('div', 'horse-list');
    for (const hr of this.field) {
      const b = btn(`<span class="hc" style="background:${hr.color}"></span>${hr.name} <b>×${hr.odds}</b>`, 'small horse-btn', () => { if (this.placeBet(hr.id, amount)) this.closeModal(); });
      b.dataset.horse = String(hr.id);
      list.appendChild(b);
    }
    panel.appendChild(list);
    const row = h('div', 'row-btns');
    row.appendChild(btn('Kapat', 'ghost', () => this.closeModal()));
    panel.appendChild(row);
    d.appendChild(panel);
    this.game.overlay.appendChild(d);
    this.modal = d;
  }

  private closeModal() { this.modal?.remove(); this.modal = null; }

  private startRace() {
    this.closeModal();
    this.raceT = 0;
    sfx.play('whoosh');
    // bahis yapanlar TV başına
    for (const b of this.bets) {
      const n = this.game.npcs.find((x) => x.id === b.who);
      n?.goWatchTv();
    }
  }

  private finish() {
    const r = this.result!;
    const pays = A.payouts(this.bets, this.field, r);
    this.lastPayouts = pays;
    this.game.economy.tx((s) => { for (const p of pays) if (p.amount > 0) credit(s, p.who, p.amount); });
    const winner = this.field[r.order[0]];
    const mine = pays.find((p) => p.who === PLAYER);
    this.game.hud.toast(`🏁 Kazanan: ${winner.name} (×${winner.odds})${r.photoFinish ? ' — FOTO FİNİŞ!' : ''}${mine ? (mine.win ? ` · Sen +${mine.amount}🪙!` : ' · Bahsin yattı.') : ''}`, 5);
    if (mine?.win) sfx.play('win');
    // NPC tepkileri
    for (const p of pays) {
      const n = this.game.npcs.find((x) => x.id === p.who);
      if (!n || n.inBrawl) continue;
      if (p.win) { n.c.anim.play('cheer'); n.c.say(pickLine(n.p.lines.win), 3); sfx.play('laugh', n.c.spec.voicePitch); }
      else if (r.photoFinish) {
        n.c.anim.play('angry');
        n.c.say(pickLine(['Hileli! Foto finiş hileli!', 'Burnu önde değildi, tekrar gösterin!', 'Bu yarış satıldı!']), 3);
        sfx.play('angry', n.c.spec.voicePitch);
        this.game.chaos.add(8);
      } else { n.c.anim.play('facepalm'); if (this.game.rng() < 0.5) n.c.say(pickLine(n.p.lines.lose), 2.5); }
    }
  }

  // ------------------------------------------------------------------ TV çizimi
  private draw(g: CanvasRenderingContext2D, W: number, H: number, t: number) {
    const ph = this.schedule.phase;
    g.fillStyle = '#145a32'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff'; g.font = 'bold 14px sans-serif';
    g.fillText(`AT YARIŞI #${this.schedule.raceNo}`, 8, 16);
    if (ph === 'betting') {
      g.fillText(`Bahis: ${Math.ceil(this.schedule.timer)} sn`, W - 92, 16);
      this.field.forEach((hr, i) => {
        const y = 36 + i * 25;
        g.fillStyle = hr.color; g.fillRect(8, y - 12, 14, 14);
        g.fillStyle = '#fff'; g.font = '13px sans-serif'; g.fillText(hr.name, 28, y);
        g.font = 'bold 13px sans-serif'; g.fillText(`×${hr.odds}`, W - 52, y);
      });
      return;
    }
    const r = this.result;
    if (!r) return;
    if (ph === 'running') {
      const time = this.raceT;
      g.fillStyle = '#c8a46e'; g.fillRect(0, 26, W, H - 26);
      for (let i = 0; i < this.field.length; i++) {
        const y = 40 + i * 25;
        g.strokeStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.moveTo(0, y + 10); g.lineTo(W, y + 10); g.stroke();
        const hr = this.field[i];
        const x = 10 + A.positionAt(r, i, time) * (W - 40);
        const bob = Math.abs(Math.sin(t * 14 + i)) * 3;
        g.fillStyle = hr.color;
        g.beginPath(); g.ellipse(x, y - bob, 12, 6, 0, 0, Math.PI * 2); g.fill(); // gövde
        g.beginPath(); g.ellipse(x + 11, y - 5 - bob, 5, 4, -0.5, 0, Math.PI * 2); g.fill(); // kafa
        g.fillStyle = '#222'; g.fillRect(x - 8, y + 4 - bob, 2, 5); g.fillRect(x + 6, y + 4 - bob, 2, 5);
      }
      g.fillStyle = '#fff'; g.fillRect(W - 26, 26, 3, H - 26);
      return;
    }
    // sonuçlar
    g.fillStyle = '#fff'; g.font = 'bold 16px sans-serif';
    if (r.photoFinish) { g.fillStyle = '#ffd43b'; g.fillText('FOTO FİNİŞ!', W - 110, 16); }
    r.order.slice(0, 3).forEach((id, k) => {
      const hr = this.field[id];
      g.fillStyle = hr.color; g.fillRect(14, 40 + k * 40, 22, 22);
      g.fillStyle = '#fff'; g.font = 'bold 18px sans-serif'; g.fillText(`${k + 1}. ${hr.name}`, 44, 58 + k * 40);
    });
  }
}
