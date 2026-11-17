/**
 * Masa oturumu: oyuncu oturduktan sonra oyun seçimi → eksik koltuklara bot NPC yerleştirme →
 * oyun arayüzü → masadan kalkış. Oyun arayüzleri bu sınıfı GameHost olarak kullanır.
 */
import type { Game } from '../core/Game';
import type { Seat } from '../world/Kahvehane';
import type { NPC } from '../npc/NPC';
import { GAME_META, GameId, Difficulty, DIFFICULTY_TR } from '../games/common/types';
import { pickLine } from '../npc/personalities';
import { sfx, SfxName } from '../audio/Sfx';
import { h, btn } from '../ui/dom';
import { OkeyUI } from '../ui/games/OkeyUI';
import { Okey101UI } from '../ui/games/Okey101UI';
import { TavlaUI } from '../ui/games/TavlaUI';
import { PistiUI } from '../ui/games/PistiUI';
import { TableView3D } from './TableView3D';
import * as THREE from 'three';
import { objectionOutcome, NoRepeatPicker, nextKibitzDelay, shouldFlipTable } from '../chaos/eventRules';
import { STAKES, stakeCoins, okeyOutcome, okey101Outcome, pistiOutcome, tavlaOutcome, wantsRaise, Outcome, AppliedTransfer } from '../economy/Betting';

export type ReactKind = 'think' | 'happy' | 'angry' | 'win' | 'lose' | 'goodMove' | 'slam' | 'play' | 'surprise';

export interface GameHost {
  readonly names: string[];
  readonly gameId: GameId;
  readonly difficulty: Difficulty;
  /** Bir katılımcı (ör. kavgaya karıştığı için) masada değilse bot sırası bekler */
  readonly paused: boolean;
  isHuman(i: number): boolean;
  react(i: number, kind: ReactKind, line?: string): void;
  sfx(name: SfxName): void;
  toast(msg: string): void;
  matchFinished(humanWon: boolean | null): void;
  exit(): void;
  /** 3D masaya taş/kart koyma (görsel geri bildirim) */
  table3d: TableView3D;
}

export interface GameUI {
  readonly el: HTMLElement;
  destroy(): void;
  update?(dt: number): void;
}

export interface GameOptions {
  okey101Hands: number;
  okey101Doubling: boolean;
  /** Bahis (çay cinsinden, 0 = yok) */
  stake: number;
  difficulty: Difficulty;
  tavlaKatmerli: boolean;
  tavlaTarget: number;
  pistiTarget: number;
}

export class TableSession implements GameHost {
  readonly root: HTMLDivElement;
  names: string[] = [];
  gameId: GameId = 'okey';
  get difficulty() { return this.options.difficulty; }
  participants: (NPC | 'player')[] = [];
  ui: GameUI | null = null;
  private exitConfirm: HTMLDivElement | null = null;
  readonly table3d: TableView3D;
  options: GameOptions = { difficulty: 'medium', okey101Hands: 3, okey101Doubling: false, stake: 0, tavlaKatmerli: true, tavlaTarget: 5, pistiTarget: 151 };

  constructor(private game: Game, readonly seat: Seat) {
    this.root = h('div', 'game-root');
    game.overlay.appendChild(this.root);
    this.table3d = new TableView3D(seat);
    this.showSelect();
  }

  private get table() { return this.seat.table; }

  private showSelect() {
    this.root.innerHTML = '';
    const panel = h('div', 'select-panel');
    panel.appendChild(h('h2', '', `${this.table.name}`));
    panel.appendChild(h('p', 'muted', 'Ne oynayalım? Eksik oyuncuların yerine müdavimler masaya gelir.'));
    const list = h('div', 'game-list');
    for (const gid of this.table.games) {
      const m = GAME_META[gid];
      const card = h('div', 'game-card');
      card.dataset.game = gid;
      card.innerHTML = `<div class="gc-title">${m.name}</div><div class="gc-desc">${m.description}</div><div class="gc-players">${m.players} oyuncu</div>`;
      const opts = h('div', 'gc-opts');
      if (gid === 'okey101') {
        opts.innerHTML = `<label>El sayısı <select data-o="okey101Hands"><option value="1">1</option><option value="3" selected>3</option><option value="5">5</option><option value="7">7</option></select></label>
          <label class="row"><input type="checkbox" data-o="okey101Doubling"> Katlamalı (yükselen açış)</label>`;
      } else if (gid === 'tavla') {
        opts.innerHTML = `<label>Maç <select data-o="tavlaTarget"><option value="1">1 puan</option><option value="3">3 puan</option><option value="5" selected>5 puan</option></select></label>
          <label class="row"><input type="checkbox" data-o="tavlaKatmerli" checked> Katmerli mars (3 puan)</label>`;
      } else if (gid === 'pisti2' || gid === 'pisti4') {
        opts.innerHTML = `<label>Hedef <select data-o="pistiTarget"><option value="51">51</option><option value="101">101</option><option value="151" selected>151</option></select></label>`;
      }
      opts.querySelectorAll('[data-o]').forEach((el) => {
        el.addEventListener('click', (e) => e.stopPropagation());
        el.addEventListener('change', () => {
          const k = (el as HTMLInputElement).dataset.o as keyof GameOptions;
          const inp = el as HTMLInputElement;
          (this.options as unknown as Record<string, unknown>)[k] = inp.type === 'checkbox' ? inp.checked : Number(inp.value);
        });
      });
      card.appendChild(opts);
      card.appendChild(btn('Oyna ▶', 'primary', () => this.startGame(gid)));
      list.appendChild(card);
    }
    panel.appendChild(list);
    // bahis seçimi (oyun içi sanal kahve parası)
    const stakeRow = h('div', 'stake-row');
    stakeRow.appendChild(h('span', '', 'Bahis:'));
    for (const st of STAKES) {
      const b = btn(st === 0 ? 'Yok' : `${st} çay (${stakeCoins(st)}🪙)`, `small${this.options.stake === st ? ' accent' : ''}`, () => {
        this.options.stake = st;
        stakeRow.querySelectorAll('button').forEach((x) => x.classList.remove('accent'));
        b.classList.add('accent');
      });
      b.dataset.stake = String(st);
      stakeRow.appendChild(b);
    }
    panel.insertBefore(stakeRow, list);
    const diffRow = h('div', 'diff-row');
    diffRow.appendChild(h('span', '', 'Rakip seviyesi:'));
    for (const d of ['easy', 'medium', 'hard'] as Difficulty[]) {
      const b = btn(DIFFICULTY_TR[d], `small${this.options.difficulty === d ? ' accent' : ''}`, () => {
        this.options.difficulty = d;
        diffRow.querySelectorAll('button').forEach((x) => x.classList.remove('accent'));
        b.classList.add('accent');
      });
      b.dataset.diff = d;
      diffRow.appendChild(b);
    }
    panel.insertBefore(diffRow, list);
    panel.appendChild(btn('Masadan kalk', 'ghost', () => this.exit()));
    this.root.appendChild(panel);
  }

  private pickBots(count: number): NPC[] {
    const kind = this.table.kind;
    const all = this.game.npcs.filter((n) => n.mode !== 'inGame');
    // masada zaten oturanlar önce, sonra bu masa türünü sevenler, Şükrü en son
    const score = (n: NPC) => (n.c.seat?.table === this.table ? -10 : 0) + (n.p.favoriteTables.includes(kind) ? -5 : 0) + (n.id === 'sukru' ? 10 : 0) + Math.random();
    return all.sort((a, b) => score(a) - score(b)).slice(0, count);
  }

  startGame(gid: GameId) {
    this.gameId = gid;
    const meta = GAME_META[gid];
    const tableSeats = this.table.seats;
    const mySeat = this.seat.index;
    // oyun içi oyuncu sırası → masa koltuğu
    let seatOrder: number[];
    if (tableSeats.length === 2) seatOrder = [mySeat, 1 - mySeat];
    else if (meta.players === 2) seatOrder = [mySeat, (mySeat + 2) % 4];
    else seatOrder = [0, 1, 2, 3].map((k) => (mySeat + k) % 4);
    // masada bu oyunda yer almayan oturan NPC'leri kaldır
    for (const s of tableSeats) {
      if (s === this.seat || seatOrder.includes(s.index)) continue;
      const n = this.game.npcs.find((x) => x.c.seat === s);
      if (n) n.leaveSeat();
    }
    const bots = this.pickBots(meta.players - 1);
    const assigned = new Map<number, NPC>();
    // koltuğunda zaten oturan bot o koltukta kalsın
    for (let k = 1; k < meta.players; k++) {
      const seat = tableSeats[seatOrder[k]];
      const sitting = bots.find((b) => b.c.seat === seat && ![...assigned.values()].includes(b));
      if (sitting) assigned.set(k, sitting);
    }
    for (let k = 1; k < meta.players; k++) {
      if (assigned.has(k)) continue;
      const free = bots.find((b) => ![...assigned.values()].includes(b))!;
      assigned.set(k, free);
    }
    this.participants = ['player'];
    for (let k = 1; k < meta.players; k++) {
      const seat = tableSeats[seatOrder[k]];
      const npc = assigned.get(k)!;
      if (npc.c.seat === seat) {
        npc.mode = 'inGame';
        npc.c.stopWalking();
        npc.c.anim.posture = 'sit';
      } else {
        const occ = this.game.npcs.find((x) => x.c.seat === seat);
        if (occ) occ.leaveSeat();
        seat.occupant = null;
        npc.teleportToSeat(seat);
      }
      this.participants.push(npc);
      setTimeout(() => { npc.c.say(pickLine(npc.p.lines.joinGame), 2.5); npc.c.anim.play('wave'); }, 400 + k * 500);
    }
    sfx.play('pop');
    this.names = this.participants.map((p) => (p === 'player' ? 'Sen' : p.c.name));
    this.root.innerHTML = '';
    this.table.props.visible = false;
    this.table3d.clear();
    // birinci şahıs masa görünümü: oyuncunun kendi modeli kamerayı kapatmasın
    this.game.player.model.root.visible = false;
    const ui = this.createUI(gid);
    this.ui = ui;
    this.root.appendChild(ui.el);
    this.addThrowButton();
    this.addObjectionButton();
    this.kibitzT = nextKibitzDelay(this.game.rng);
    this.settledGames.clear();
    if (this.options.stake > 0) {
      this.game.hud.toast(`💰 Bahisli masa: kaybeden ${this.options.stake} çay (${stakeCoins(this.options.stake)}🪙) öder.`, 3.5);
      setTimeout(() => this.offerRaise(), 1800);
    }
  }

  /** İtiraz: bota haksızlık iddiası — gerçek hile tespiti yok; yalnızca replik ve gerginlik */
  private addObjectionButton() {
    const b = btn('🙋 İtiraz!', 'small objection-btn', () => {
      const old = this.root.querySelector('.objection-pick');
      if (old) { old.remove(); return; }
      const pick = h('div', 'throw-pick objection-pick');
      for (const p of this.participants) {
        if (p === 'player') continue;
        pick.appendChild(btn(`→ ${p.c.name}`, 'small', () => { pick.remove(); this.object(p); }));
      }
      this.root.appendChild(pick);
    });
    this.root.appendChild(b);
  }

  /** İtiraz et (test kancası da) */
  object(npc: NPC): boolean {
    const chaos = this.game.chaos;
    if ((chaos.state.cooldowns.objection ?? 0) > 0) { this.toast('Az önce itiraz ettin, biraz sabır!'); return false; }
    const def = chaos.trigger('objection')!;
    const out = objectionOutcome(npc.p.temper, this.game.rng());
    chaos.add(out.tension - def.tension);
    this.game.player.say(pickLine(['İtiraz ediyorum! O taş nereden çıktı?', 'Hakem! Burada bir iş var!', 'Bu nasıl hamle, göreyim kartları!']), 2.5);
    setTimeout(() => {
      npc.c.say(pickLine(npc.p.lines.objectionReply), 3);
      npc.c.anim.play(out.reply === 'angry' ? 'slamTable' : out.reply === 'mock' ? 'laugh' : 'shrug');
      if (out.reply === 'angry') setTimeout(() => sfx.play('tableSlam'), 350);
      if (out.reply === 'mock') sfx.play('laugh', npc.c.spec.voicePitch);
    }, 1100);
    this.lastObjection = out.reply;
    return true;
  }
  lastObjection: string | null = null;

  // ------------------------------------------------------------------ kibitz (izleyici yorumları)
  private kibitzer: NPC | null = null;
  private kibitzT = 10;
  private kibitzPickers = new Map<string, NoRepeatPicker<string>>();
  kibitzLines: string[] = [];

  private updateKibitz(dt: number) {
    if (!this.ui || !this.game.settings.kibitz) { this.releaseKibitzer(); return; }
    const k = this.kibitzer;
    if (k && (k.inBrawl || !['returning', 'wander', 'kibitz'].includes(k.mode as string))) this.kibitzer = null;
    this.kibitzT -= dt;
    if (this.kibitzT > 0) return;
    this.kibitzT = nextKibitzDelay(this.game.rng);
    if (!this.kibitzer) {
      const free = this.game.npcs.filter((n) => !n.inBrawl && n.id !== 'sukru' && ['idle', 'wander', 'tv', 'chat', 'seated'].includes(n.mode) && n.c.seat?.table !== this.table);
      free.sort((a, b) => a.c.pos.distanceTo(this.table.center) - b.c.pos.distanceTo(this.table.center));
      const n = free[0];
      if (!n) return;
      // oyuncunun arkasında durup izler
      if (n.c.seated) n.leaveSeat();
      n.releaseReservations();
      const back = new THREE.Vector3(-Math.sin(this.seat.yaw), 0, -Math.cos(this.seat.yaw));
      const spot = this.seat.pos.clone().addScaledVector(back, 0.9).add(new THREE.Vector3(0.5, 0, 0.3));
      n.mode = 'wander';
      n.c.walkTo(this.game.nav, spot.x, spot.z, () => { n.c.faceTowards(this.table.center); }, 1.3);
      (n as unknown as { timer: number }).timer = 999;
      this.kibitzer = n;
      return;
    }
    const n = this.kibitzer;
    if (n.c.isWalking) return;
    let picker = this.kibitzPickers.get(n.id);
    if (!picker) { picker = new NoRepeatPicker(n.p.lines.kibitz, this.game.rng); this.kibitzPickers.set(n.id, picker); }
    const line = picker.next();
    this.kibitzLines.push(line);
    n.c.faceTowards(this.table.center);
    n.c.say(line, 3);
    n.c.anim.play(this.game.rng() < 0.5 ? 'point' : 'talk');
  }

  private releaseKibitzer() {
    if (this.kibitzer && this.kibitzer.mode === 'wander') (this.kibitzer as unknown as { timer: number }).timer = 1;
    this.kibitzer = null;
  }

  /** Masa devirme: Rıza Dayı gibi çok sinirli biri okeyi kaybederse (görsel/sosyal; sonuç geçerli) */
  private maybeFlipTable() {
    if (this.gameId !== 'okey' && this.gameId !== 'okey101') return;
    const s = (this.ui as unknown as { s: { scores?: number[]; totals: number[] } }).s;
    const winner = this.gameId === 'okey'
      ? s.scores!.indexOf(Math.max(...s.scores!))
      : s.totals.indexOf(Math.min(...s.totals));
    this.participants.forEach((p, i) => {
      if (p === 'player') return;
      if (shouldFlipTable({ temper: p.p.temper, lostMatch: i !== winner, game: this.gameId, anger: p.anger }, this.game.rng())) {
        setTimeout(() => this.game.chaosEvents.tableFlip(this.table, p), 1600);
      }
    });
  }

  /** Masada çay fırlatma: yalnızca görsel/sosyal, oyunu etkilemez */
  private addThrowButton() {
    if (this.game.settings.teaThrow === 'off') return;
    const b = btn('💦 Çay fırlat', 'small throw-btn', () => {
      const old = this.root.querySelector('.throw-pick');
      if (old) { old.remove(); return; }
      const pick = h('div', 'throw-pick');
      for (const p of this.participants) {
        if (p === 'player') continue;
        pick.appendChild(btn(`→ ${p.c.name}`, 'small', () => { pick.remove(); this.game.social.throwTea(p); }));
      }
      this.root.appendChild(pick);
    });
    this.root.appendChild(b);
  }

  /** Bahsi artırmaya meyilli bir NPC (ör. Cemal) iki katına çıkarmayı teklif eder */
  private offerRaise() {
    if (!this.ui) return;
    const npcs = this.participants.filter((p): p is NPC => p !== 'player').sort((a, b) => b.p.betBoldness - a.p.betBoldness);
    const bold = npcs[0];
    if (!bold || !wantsRaise(bold.p.betBoldness, this.options.stake, this.game.rng())) return;
    const next = Math.min(10, this.options.stake * 2);
    const line = pickLine(bold.p.lines.betRaise);
    bold.c.say(line, 3);
    bold.c.anim.play('point');
    const d = h('div', 'modal raise-modal');
    d.innerHTML = `<div class="panel"><h3>${bold.c.name}: "${line}"</h3><p>Bahis <b>${this.options.stake} çay</b> → <b>${next} çay (${stakeCoins(next)}🪙)</b> olsun mu?</p></div>`;
    const row = h('div', 'row-btns');
    row.appendChild(btn('Kabul et', 'primary', () => { d.remove(); this.options.stake = next; this.game.hud.toast(`💰 Bahis ${next} çaya çıktı!`); bold.c.anim.play('cheer'); bold.c.say('İşte bu!', 2); }));
    row.appendChild(btn('Yok, kalsın', 'ghost', () => { d.remove(); bold.c.anim.play('shrug'); bold.c.say('Peki peki, korkma...', 2); }));
    d.querySelector('.panel')!.appendChild(row);
    this.root.appendChild(d);
  }

  private settledGames = new Set<string>();

  /** Oyun sonucunu (kural motoruna dokunmadan) bahis sonucuna çevirir ve ödemeyi yapar */
  private settle(outcome: Outcome | null, key: string) {
    if (this.options.stake <= 0 || this.settledGames.has(key)) return;
    this.settledGames.add(key);
    const ids = this.participants.map((p) => (p === 'player' ? 'player' : p.id));
    const res = this.game.economy.settle(outcome, this.options.stake, ids);
    if (!res.length) return;
    this.showSettlement(res);
  }

  private showSettlement(res: AppliedTransfer[]) {
    const name = (id: string) => (id === 'player' ? 'Sen' : this.game.npcs.find((n) => n.id === id)?.c.name ?? id);
    const lines = res.map((t) => `${name(t.from)} → ${name(t.to)}: ${t.amount}🪙${t.onCredit ? ` (${t.onCredit}🪙 veresiye)` : ''}`);
    this.lastSettlement = lines;
    setTimeout(() => {
      const panel = this.root.querySelector('.modal .panel');
      const box = h('div', 'settle-list', `💰 Hesap:<br>${lines.join('<br>')}`);
      if (panel) panel.insertBefore(box, panel.querySelector('.row-btns'));
      else this.game.hud.toast(`💰 ${lines.join(' · ')}`, 4);
    }, 50);
    this.game.audioCoins();
  }
  lastSettlement: string[] = [];

  /** Maç sonu sonucunu oyunun durumundan oku (tavla her oyun sonunda ayrı ödenir) */
  private settleMatch() {
    const s = (this.ui as unknown as { s: Record<string, unknown> } | null)?.s;
    if (!s) return;
    if (this.gameId === 'okey') this.settle(okeyOutcome(s.scores as number[]), `okey:${s.handNo}`);
    else if (this.gameId === 'okey101') this.settle(okey101Outcome(s.totals as number[]), `101:${s.handNo}`);
    else if (this.gameId === 'pisti2' || this.gameId === 'pisti4') this.settle(pistiOutcome(s.totals as number[], this.gameId === 'pisti2' ? 2 : 4), `pisti:${s.handNo}`);
  }

  private createUI(gid: GameId): GameUI {
    switch (gid) {
      case 'okey': return new OkeyUI(this);
      case 'okey101': return new Okey101UI(this, this.options.okey101Hands, this.options.okey101Doubling);
      case 'tavla': return new TavlaUI(this, { target: this.options.tavlaTarget, katmerliMars: this.options.tavlaKatmerli });
      case 'pisti2': return new PistiUI(this, { players: 2, target: this.options.pistiTarget });
      case 'pisti4': return new PistiUI(this, { players: 4, target: this.options.pistiTarget });
    }
  }

  /** Kavga vb. nedeniyle masadan kalkmış katılımcılar */
  awayNames(): string[] {
    return this.participants.filter((p): p is NPC => p !== 'player' && (p.awayFromGame || p.inBrawl || p.mode === 'returning')).map((p) => p.c.name);
  }

  get paused(): boolean { return this.awayNames().length > 0; }

  isHuman(i: number) {
    return this.participants[i] === 'player';
  }

  private charOf(i: number) {
    const p = this.participants[i];
    return p === 'player' ? this.game.player : p?.c;
  }

  react(i: number, kind: ReactKind, line?: string) {
    const p = this.participants[i];
    const c = this.charOf(i);
    if (!c) return;
    const npc = p === 'player' ? null : p;
    const lines = npc?.p.lines;
    const say = (arr?: string[]) => { if (line) c.say(line, 2.6); else if (arr && Math.random() < 0.85) c.say(pickLine(arr), 2.6); };
    switch (kind) {
      case 'think':
        c.anim.play('think');
        if (lines && Math.random() < 0.25) say(lines.think);
        break;
      case 'play':
        c.anim.play('leanBack');
        break;
      case 'goodMove':
        c.anim.play(Math.random() < 0.5 ? 'slamTable' : 'point');
        if (Math.random() < 0.5) setTimeout(() => sfx.play('tableSlam'), 350);
        say(lines?.goodMove);
        break;
      case 'slam':
        c.anim.play('slamTable');
        setTimeout(() => sfx.play('tableSlam'), 350);
        break;
      case 'happy':
        c.anim.play('laugh');
        sfx.play('laugh', c.spec.voicePitch);
        say(lines?.goodMove);
        break;
      case 'surprise':
        c.anim.play('surprise');
        sfx.play('surprise', c.spec.voicePitch);
        if (line) c.say(line, 2.5);
        break;
      case 'angry':
        c.anim.play(npc && npc.p.temper > 0.6 ? 'slamTable' : 'angry');
        sfx.play('angry', c.spec.voicePitch);
        say(lines?.lose);
        break;
      case 'win':
        c.anim.play(Math.random() < 0.5 ? 'cheer' : 'bellyDance');
        sfx.play('laugh', c.spec.voicePitch);
        say(lines?.win);
        break;
      case 'lose':
        c.anim.play(npc && npc.p.temper > 0.6 ? 'slamTable' : 'facepalm');
        if (npc && npc.p.temper > 0.6) setTimeout(() => sfx.play('tableSlam'), 350);
        say(lines?.lose);
        break;
    }
  }

  sfx(name: SfxName) { sfx.play(name); }
  toast(msg: string) { this.game.hud.toast(msg); }

  matchFinished(humanWon: boolean | null) {
    if (humanWon !== null) this.game.recordResult(this.gameId, humanWon);
    if (this.gameId !== 'tavla') this.settleMatch();
    this.maybeFlipTable();
    // diğer katılımcılar tepki verir
    this.participants.forEach((p, i) => {
      if (p === 'player') return;
      setTimeout(() => this.react(i, humanWon ? 'lose' : 'win'), 300 + i * 400);
    });
    if (humanWon) { this.game.player.anim.play('cheer'); sfx.play('win'); }
    else if (humanWon === false) { this.game.player.anim.play('facepalm'); sfx.play('lose'); }
  }

  /** Oyundan çık → oyun seçimine dön */
  backToSelect() {
    this.ui?.destroy();
    this.ui = null;
    this.releaseBots();
    this.table.props.visible = true;
    this.table3d.clear();
    this.showSelect();
  }

  private releaseBots() {
    this.releaseKibitzer();
    this.game.player.model.root.visible = true;
    for (const p of this.participants) if (p !== 'player') p.releaseFromGame();
    this.participants = [];
  }

  requestExit() {
    if (!this.ui) { this.exit(); return; }
    if (this.exitConfirm) { this.exitConfirm.remove(); this.exitConfirm = null; return; }
    const d = h('div', 'modal');
    d.innerHTML = `<div class="panel"><h3>Oyunu bırakıp masadan kalkılsın mı?</h3><p class="muted">Yarım kalan maç sayılmaz.</p></div>`;
    const panel = d.querySelector('.panel')!;
    const row = h('div', 'row-btns');
    row.appendChild(btn('Kalk', 'danger', () => { d.remove(); this.exitConfirm = null; this.exit(); }));
    row.appendChild(btn('Oyuna dön', 'primary', () => { d.remove(); this.exitConfirm = null; }));
    row.appendChild(btn('Başka oyun seç', 'ghost', () => { d.remove(); this.exitConfirm = null; this.backToSelect(); }));
    panel.appendChild(row);
    this.root.appendChild(d);
    this.exitConfirm = d;
  }

  exit() {
    this.ui?.destroy();
    this.ui = null;
    this.releaseBots();
    this.table.props.visible = true;
    this.table3d.clear();
    this.root.remove();
    this.game.standUp();
  }

  private pauseBanner: HTMLDivElement | null = null;

  update(dt: number) {
    this.updateKibitz(dt);
    // tavla: her oyunun sonucu (normal/mars/katmerli) ayrı ödenir
    if (this.ui && this.gameId === 'tavla') {
      const s = (this.ui as unknown as { s: { lastResult: { winner: 0 | 1; kind: 'normal' | 'mars' | 'katmerli' } | null; gameNo: number } }).s;
      if (s.lastResult) this.settle(tavlaOutcome(s.lastResult.winner, s.lastResult.kind), `tavla:${s.gameNo}`);
    }
    if (this.ui) {
      if (!this.pauseBanner) { this.pauseBanner = h('div', 'pause-banner'); this.root.appendChild(this.pauseBanner); }
      const away = this.awayNames();
      this.pauseBanner.classList.toggle('show', away.length > 0);
      if (away.length) this.pauseBanner.textContent = `⏸ Oyun bekliyor: ${away.join(', ')} kavgada!`;
    }
    this.ui?.update?.(dt);
    this.table3d.update(dt);
  }
}
