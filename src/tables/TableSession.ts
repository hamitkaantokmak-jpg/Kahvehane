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

export type ReactKind = 'think' | 'happy' | 'angry' | 'win' | 'lose' | 'goodMove' | 'slam' | 'play' | 'surprise';

export interface GameHost {
  readonly names: string[];
  readonly gameId: GameId;
  readonly difficulty: Difficulty;
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
  private participants: (NPC | 'player')[] = [];
  ui: GameUI | null = null;
  private exitConfirm: HTMLDivElement | null = null;
  readonly table3d: TableView3D;
  options: GameOptions = { difficulty: 'medium', okey101Hands: 3, tavlaKatmerli: true, tavlaTarget: 5, pistiTarget: 151 };

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
        opts.innerHTML = `<label>El sayısı <select data-o="okey101Hands"><option value="1">1</option><option value="3" selected>3</option><option value="5">5</option><option value="7">7</option></select></label>`;
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
  }

  private createUI(gid: GameId): GameUI {
    switch (gid) {
      case 'okey': return new OkeyUI(this);
      case 'okey101': return new Okey101UI(this, this.options.okey101Hands);
      case 'tavla': return new TavlaUI(this, { target: this.options.tavlaTarget, katmerliMars: this.options.tavlaKatmerli });
      case 'pisti2': return new PistiUI(this, { players: 2, target: this.options.pistiTarget });
      case 'pisti4': return new PistiUI(this, { players: 4, target: this.options.pistiTarget });
    }
  }

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

  update(dt: number) {
    this.ui?.update?.(dt);
    this.table3d.update(dt);
  }
}
