/**
 * Çevrimiçi masa oturumu: lobi (oda kodu, koltuklar, oyun seçimi), masaya oturan arkadaşların karakterleri,
 * sunucudan gelen oyun durumu ve masa kaosu. Oyun kuralları sunucuda çalışır; burası yalnızca gösterir ve niyet yollar.
 */
import type { Game } from '../core/Game';
import type { Seat } from '../world/Kahvehane';
import type { NPC } from '../npc/NPC';
import { Character } from '../characters/Character';
import { sanitizeSpec } from '../characters/creator';
import { TableView3D } from '../tables/TableView3D';
import type { GameHost, ReactKind } from '../tables/TableSession';
import type { GameId, Difficulty } from '../games/common/types';
import { GAME_META, DIFFICULTY_TR } from '../games/common/types';
import { h, btn } from '../ui/dom';
import { sfx, SfxName } from '../audio/Sfx';
import { pickLine } from '../npc/personalities';
import { OnlineClient, createRoom, roomExists } from './OnlineClient';
import { ChaosKind, ChaosPref, GAMES_OF_KIND, GameAction, OnlineGameId, RoomKind, RoomView, SEATS_OF, ServerMsg, TAUNTS } from './protocol';
import { BOT_SEATS } from './room';
import { actionToAbs, rotateEvent, rotateView, toAbs, toRel } from './rotate';
import { NetUI, OnlineBatakUI, OnlineKingUI, OnlineOkey101UI, OnlineOkeyUI, OnlinePistiUI, OnlineTavlaUI } from './OnlineUIs';

const PREF_TR: Record<ChaosPref, string> = { calm: 'Sakin', normal: 'Normal', chaos: 'Tam kaos' };
const OBJECTION_LINES = ['İtiraz var! Bu el hileli!', 'Hakem! Kart karıştı!', 'Bir dakika, bir dakika!'];

export class OnlineSession implements GameHost {
  readonly root: HTMLDivElement;
  readonly table3d: TableView3D;
  client: OnlineClient | null = null;
  room: RoomView | null = null;
  /** benim mutlak koltuğum */
  mySeat: number | null = null;
  ui: (NetUI & { el: HTMLElement }) | null = null;
  uiGame: OnlineGameId | null = null;
  names: string[] = [];
  gameId: GameId = 'batak';
  difficulty: Difficulty = 'medium';
  readonly paused = false;
  private chars = new Map<string, Character>();
  private bots = new Map<number, NPC>();
  private panel: HTMLDivElement;
  private chaosBar: HTMLDivElement | null = null;
  private status: HTMLDivElement;
  pref: ChaosPref;

  constructor(private game: Game, readonly seat: Seat, start: { create: true } | { code: string }) {
    this.root = h('div', 'game-root online-root');
    document.body.classList.add('online-mode');
    game.overlay.appendChild(this.root);
    this.table3d = new TableView3D(seat);
    this.panel = h('div', 'select-panel online-panel');
    this.status = h('div', 'online-status');
    this.root.append(this.panel);
    this.pref = game.settings.chaosIntensity === 'calm' ? 'calm' : game.settings.chaosIntensity === 'chaos' ? 'chaos' : 'normal';
    this.showJoin(start);
  }

  private get table() { return this.seat.table; }

  // ------------------------------------------------------------------ katılma ekranı (ad + bağlan)
  private showJoin(start: { create: true } | { code: string }) {
    const p = this.panel;
    p.innerHTML = '';
    p.appendChild(h('h2', '', '🌐 Arkadaşlarla oyna'));
    p.appendChild(h('p', 'muted', 'create' in start ? 'Bir oda kur, kodu arkadaşlarına gönder. Boş koltuklara müdavimler oturur.' : `<b>${start.code}</b> odasına katılıyorsun.`));
    const nameRow = h('label', 'cr-name', 'Takma adın');
    const name = document.createElement('input');
    name.maxLength = 16;
    name.placeholder = 'Masada görünecek ad';
    const cur = this.game.player.spec.name;
    name.value = cur === 'Sen' ? '' : cur;
    name.addEventListener('keydown', (e) => e.stopPropagation());
    nameRow.appendChild(name);
    p.appendChild(nameRow);
    p.appendChild(this.prefRow());
    p.appendChild(h('p', 'muted small', 'Oyun parası çevrimiçi masada kullanılmaz. Serbest yazışma yok; hazır sözlerle sataşılır. Kaos yalnızca görseldir, oyunu etkilemez.'));
    const row = h('div', 'row-btns');
    const go = btn('create' in start ? 'Oda kur ▶' : 'Katıl ▶', 'primary', async () => {
      const nm = name.value.trim();
      if (!nm) { this.toast('Önce bir takma ad yaz.'); name.focus(); return; }
      go.classList.add('disabled');
      try {
        const code = 'create' in start ? await createRoom(this.table.kind as RoomKind) : start.code;
        if (!('create' in start) && !(await roomExists(code))) throw new Error('Böyle bir oda yok ya da kapanmış.');
        this.connect(code, nm);
      } catch (e) {
        this.toast((e as Error).message || 'Sunucuya ulaşılamadı.');
        go.classList.remove('disabled');
      }
    });
    row.append(btn('Vazgeç', 'ghost', () => this.exit()), go);
    p.appendChild(row);
  }

  private prefRow() {
    const r = h('div', 'stake-row');
    r.appendChild(h('span', '', 'Kaos ayarım:'));
    for (const k of ['calm', 'normal', 'chaos'] as ChaosPref[]) {
      const b = btn(PREF_TR[k], `small${this.pref === k ? ' accent' : ''}`, () => {
        this.pref = k;
        r.querySelectorAll('button').forEach((x) => x.classList.remove('accent'));
        b.classList.add('accent');
        this.client?.send({ t: 'pref', chaos: k });
      });
      b.dataset.pref = k;
      r.appendChild(b);
    }
    r.title = 'Sakin: sana çay atılamaz, sen de çay atamaz ve masa deviremezsin.';
    return r;
  }

  private connect(code: string, name: string) {
    const spec = { ...sanitizeSpec(this.game.player.spec), name };
    const c = new OnlineClient(code, { name, spec, chaos: this.pref });
    this.client = c;
    c.onStatus = (st) => { this.status.textContent = st === 'open' ? '' : st === 'reconnecting' ? '🔌 Bağlantı koptu, yeniden bağlanıyor...' : st === 'closed' ? 'Bağlantı kapandı.' : 'Bağlanıyor...'; };
    c.on((m) => this.onMsg(m));
    this.panel.innerHTML = '<h2>🌐 Bağlanıyor...</h2>';
    this.root.appendChild(this.status);
    try { history.replaceState(null, '', `${location.pathname}?oda=${code}`); } catch { /* yok */ }
  }

  // ------------------------------------------------------------------ sunucu mesajları
  private onMsg(m: ServerMsg) {
    switch (m.t) {
      case 'welcome': this.mySeat = m.seat; this.setRoom(m.room); break;
      case 'room': this.mySeat = m.seat; this.setRoom(m.room); break;
      case 'state': this.onState(m); break;
      case 'chaos': this.onChaos(m); break;
      case 'error': this.toast(m.msg); break;
    }
  }

  private setRoom(r: RoomView) {
    this.room = r;
    this.syncSeats();
    if (!this.ui) this.renderLobby();
  }

  private onState(m: Extract<ServerMsg, { t: 'state' }>) {
    this.mySeat = m.seat;
    const n = SEATS_OF[m.game];
    if (!this.ui || this.uiGame !== m.game) this.startUI(m.game);
    const view = rotateView(m.game, m.view, m.seat);
    this.ui!.applyServer(view, rotateEvent(m.event, m.seat, n));
  }

  private startUI(g: OnlineGameId) {
    this.ui?.destroy();
    this.gameId = g;
    this.uiGame = g;
    const o = this.room?.options;
    this.difficulty = o?.difficulty ?? 'medium';
    this.names = this.relNames(g);
    this.panel.remove();
    this.table.props.visible = false;
    this.table3d.clear();
    this.game.player.model.root.visible = false;
    const net = { act: (a: GameAction) => this.client?.send({ t: 'act', a: actionToAbs(g, a, this.mySeat ?? 0) }), next: () => this.client?.send({ t: 'next' }), toLobby: () => this.backToLobby() };
    if (g === 'batak') this.ui = new OnlineBatakUI(this, { partners: !!o?.batakPartners, hands: o?.batakHands ?? 5, zeroPenalty: !!o?.batakZeroPenalty }, net);
    else if (g === 'king') this.ui = new OnlineKingUI(this, { short: !!o?.kingShort }, net);
    else if (g === 'okey') this.ui = new OnlineOkeyUI(this, net);
    else if (g === 'okey101') this.ui = new OnlineOkey101UI(this, o?.okey101Hands ?? 3, !!o?.okey101Doubling, net);
    else if (g === 'tavla') this.ui = new OnlineTavlaUI(this, { target: o?.tavlaTarget ?? 5, katmerliMars: o?.tavlaKatmerli ?? true }, net);
    else this.ui = new OnlinePistiUI(this, { players: g === 'pisti2' ? 2 : 4, target: o?.pistiTarget ?? 101 }, net);
    this.root.insertBefore(this.ui.el, this.status);
    this.addChaosBar();
  }

  private backToLobby() {
    this.ui?.destroy();
    this.ui = null;
    this.uiGame = null;
    this.chaosBar?.remove();
    this.chaosBar = null;
    this.table3d.clear();
    this.table.props.visible = true;
    this.root.insertBefore(this.panel, this.status);
    this.renderLobby();
  }

  // ------------------------------------------------------------------ lobi
  private renderLobby() {
    const r = this.room;
    if (!r) return;
    const p = this.panel;
    const iAmHost = this.client?.you === r.host;
    p.innerHTML = '';
    const link = `${location.origin}${location.pathname}?oda=${r.code}`;
    const head = h('div', 'room-head');
    head.innerHTML = `<div><div class="muted small">Oda kodu</div><div class="room-code" data-code="${r.code}">${r.code}</div></div>`;
    head.appendChild(btn('🔗 Davet bağlantısını paylaş', 'small accent', async () => {
      const text = `Kahvehane'de masaya gel! Oda kodu: ${r.code}`;
      try {
        if (navigator.share) await navigator.share({ title: 'Kahvehane', text, url: link });
        else { await navigator.clipboard.writeText(`${text} ${link}`); this.toast('Bağlantı kopyalandı.'); }
      } catch { /* vazgeçti */ }
    }));
    p.appendChild(head);
    if (r.lastResult) {
      const res = r.lastResult;
      const w = res.winners.map((i) => res.names[i]).join(' & ');
      p.appendChild(h('div', 'settle-list', `🏆 Son maç (${GAME_META[res.game].name}): <b>${w}</b> kazandı`));
    }
    // koltuklar
    const seats = h('div', 'online-seats');
    r.seats.forEach((s, i) => {
      const d = h('div', `oseat${i === this.mySeat ? ' me' : ''}${s.occ === 'human' && !s.connected ? ' away' : ''}`);
      d.dataset.seat = String(i);
      const tag = s.occ === 'bot' ? '🤖 müdavim' : s.player === r.host ? '👑 oda sahibi' : '🙂 oyuncu';
      d.innerHTML = `<div class="nm">${s.name}${i === this.mySeat ? ' (sen)' : ''}</div><div class="meta">${tag}${s.chaos ? ` · ${PREF_TR[s.chaos]}` : ''}${s.occ === 'human' && !s.connected ? ' · bağlantı yok' : ''}</div>`;
      if (r.phase === 'lobby' && s.occ === 'bot') d.appendChild(btn('Buraya geç', 'small', () => this.client?.send({ t: 'seat', seat: i })));
      seats.appendChild(d);
    });
    p.appendChild(seats);
    if (r.game === 'batak' && r.options.batakPartners) p.appendChild(h('p', 'muted small', 'Eşli batak: karşılıklı koltuklar ortaktır (1-3, 2-4).'));
    // oyun seçimi
    const gameRow = h('div', 'online-games');
    for (const g of GAMES_OF_KIND[r.kind ?? 'kart']) {
      const b = btn(GAME_META[g].name, `small${r.game === g ? ' accent' : ''}${iAmHost ? '' : ' disabled'}`, () => iAmHost && this.client?.send({ t: 'config', game: g, options: {} }));
      b.dataset.game = g;
      gameRow.appendChild(b);
    }
    p.appendChild(h('div', 'cr-title', iAmHost ? 'Oyunu seç' : 'Oyunu oda sahibi seçer'));
    p.appendChild(gameRow);
    if (iAmHost) p.appendChild(this.optionsRow(r));
    p.appendChild(this.prefRow());
    const humans = r.seats.filter((s) => s.occ === 'human').length;
    const row = h('div', 'row-btns');
    row.appendChild(btn('Odadan çık', 'ghost', () => this.exit()));
    if (r.phase === 'playing') row.appendChild(h('span', 'muted', 'Oyun sürüyor...'));
    else if (iAmHost) row.appendChild(btn(`Başlat ▶ (${humans} kişi + ${SEATS_OF[r.game] - humans > 0 ? SEATS_OF[r.game] - humans : 0} müdavim)`, 'primary', () => this.client?.send({ t: 'start' })));
    else row.appendChild(h('span', 'muted', 'Oda sahibinin başlatması bekleniyor...'));
    p.appendChild(row);
  }

  private optionsRow(r: RoomView) {
    const o = r.options;
    const d = h('div', 'gc-opts online-opts');
    const send = (patch: Record<string, unknown>) => this.client?.send({ t: 'config', game: r.game, options: patch });
    const sel = (label: string, key: string, values: (number | string)[], cur: number | string, fmt: (v: number | string) => string = String) => {
      const l = h('label', '', `${label} `);
      const s = document.createElement('select');
      for (const v of values) { const op = document.createElement('option'); op.value = String(v); op.textContent = fmt(v); if (v === cur) op.selected = true; s.appendChild(op); }
      s.addEventListener('change', () => send({ [key]: typeof cur === 'number' ? Number(s.value) : s.value }));
      l.appendChild(s);
      return l;
    };
    const chk = (label: string, key: string, cur: boolean) => {
      const l = h('label', 'row');
      const c = document.createElement('input');
      c.type = 'checkbox'; c.checked = cur;
      c.addEventListener('change', () => send({ [key]: c.checked }));
      l.append(c, document.createTextNode(` ${label}`));
      return l;
    };
    if (r.game === 'batak') d.append(sel('El sayısı', 'batakHands', [3, 5, 7, 11], o.batakHands), chk('Eşli', 'batakPartners', o.batakPartners), chk('El almayan cezalı', 'batakZeroPenalty', o.batakZeroPenalty));
    if (r.game === 'king') d.append(chk('Kısa King (8 el)', 'kingShort', o.kingShort));
    if (r.game.startsWith('pisti')) d.append(sel('Hedef', 'pistiTarget', [51, 101, 151], o.pistiTarget));
    if (r.game === 'okey101') d.append(sel('El sayısı', 'okey101Hands', [1, 3, 5, 7], o.okey101Hands ?? 3), chk('Katlamalı', 'okey101Doubling', !!o.okey101Doubling));
    if (r.game === 'tavla') d.append(sel('Maç', 'tavlaTarget', [1, 3, 5, 7], o.tavlaTarget ?? 5, (v) => `${v} puan`), chk('Katmerli mars', 'tavlaKatmerli', o.tavlaKatmerli ?? true));
    d.append(sel('Müdavim seviyesi', 'difficulty', ['easy', 'medium', 'hard'], o.difficulty, (v) => DIFFICULTY_TR[v as Difficulty]));
    return d;
  }

  // ------------------------------------------------------------------ masadaki karakterler
  private n() { return this.uiGame ? SEATS_OF[this.uiGame] : this.room?.phase === 'playing' ? SEATS_OF[this.room.game] : this.room?.seats.length ?? 4; }

  /** Göreli koltuk → masadaki fiziksel koltuk */
  private tableSeat(rel: number, n: number): Seat {
    const off = n === 2 && this.table.seats.length === 4 ? rel * 2 : rel;
    return this.table.seats[(this.seat.index + off) % this.table.seats.length];
  }

  private relNames(g: OnlineGameId): string[] {
    const n = SEATS_OF[g];
    return [...Array(n).keys()].map((rel) => (rel === 0 ? 'Sen' : this.room?.seats[toAbs(rel, this.mySeat ?? 0, n)]?.name ?? '?'));
  }

  /** Koltuklara arkadaşların karakterlerini ve müdavimleri yerleştir */
  private syncSeats() {
    const r = this.room;
    if (!r || this.mySeat === null) return;
    const n = this.n();
    const keepChars = new Set<string>();
    const keepBots = new Set<number>();
    for (let abs = 0; abs < Math.min(n, r.seats.length); abs++) {
      if (abs === this.mySeat) continue;
      const rel = toRel(abs, this.mySeat, n);
      const seat = this.tableSeat(rel, n);
      const s = r.seats[abs];
      if (s.occ === 'human' && s.player && s.spec) {
        keepChars.add(s.player);
        let c = this.chars.get(s.player);
        if (!c) {
          c = new Character({ ...sanitizeSpec(s.spec), id: `online-${s.player}`, name: s.name });
          c.bubbleHost = this.game.bubbles;
          this.game.scene.add(c.model.root);
          this.chars.set(s.player, c);
        }
        if (c.seat !== seat) { const occ = this.game.npcs.find((x) => x.c.seat === seat); if (occ) occ.leaveSeat(); seat.occupant = null; c.sitOn(seat); }
      } else {
        keepBots.add(abs);
        const want = BOT_SEATS[abs].id;
        let npc = this.bots.get(abs);
        if (!npc || npc.id !== want) {
          npc?.releaseFromGame();
          npc = this.game.npcs.find((x) => x.id === want) ?? this.game.npcs.find((x) => x.id !== 'sukru' && ![...this.bots.values()].includes(x));
          if (!npc) continue;
          this.bots.set(abs, npc);
          if (npc.c.seat !== seat) { const occ = this.game.npcs.find((x) => x.c.seat === seat && x !== npc); if (occ) occ.leaveSeat(); seat.occupant = null; npc.teleportToSeat(seat); }
          npc.mode = 'inGame';
        }
      }
    }
    for (const [pid, c] of this.chars) if (!keepChars.has(pid)) { this.game.scene.remove(c.model.root); if (c.seat) c.seat.occupant = null; this.chars.delete(pid); }
    for (const [abs, npc] of this.bots) if (!keepBots.has(abs)) { npc.releaseFromGame(); this.bots.delete(abs); }
    if (this.uiGame) this.names = this.relNames(this.uiGame);
  }

  private charAtRel(rel: number): Character | null {
    if (rel === 0) return this.game.player;
    const r = this.room;
    if (!r || this.mySeat === null) return null;
    const abs = toAbs(rel, this.mySeat, this.n());
    const s = r.seats[abs];
    if (s?.occ === 'human' && s.player) return this.chars.get(s.player) ?? null;
    return this.bots.get(abs)?.c ?? null;
  }

  // ------------------------------------------------------------------ kaos
  private addChaosBar() {
    this.chaosBar?.remove();
    const bar = h('div', 'online-chaos');
    const pick = (kind: ChaosKind, label: string) => {
      const old = this.root.querySelector('.throw-pick');
      if (old) { old.remove(); return; }
      const box = h('div', 'throw-pick');
      const n = this.n();
      for (let rel = 1; rel < n; rel++) box.appendChild(btn(`→ ${this.names[rel]}`, 'small', () => { box.remove(); this.sendChaos(kind, toAbs(rel, this.mySeat ?? 0, n)); }));
      box.dataset.kind = label;
      this.root.appendChild(box);
    };
    const taunts = () => {
      const old = this.root.querySelector('.taunt-pick');
      if (old) { old.remove(); return; }
      const box = h('div', 'throw-pick taunt-pick');
      TAUNTS.forEach((t, i) => box.appendChild(btn(t, 'small', () => { box.remove(); this.client?.send({ t: 'chaos', kind: 'taunt', phrase: i }); })));
      this.root.appendChild(box);
    };
    const mk = (icon: string, label: string, fn: () => void, kind: string) => { const b = btn(`${icon}<span class="lb"> ${label}</span>`, 'small', fn); b.dataset.chaos = kind; return b; };
    bar.append(
      mk('💬', 'Laf at', taunts, 'taunt'),
      mk('🙋', 'İtiraz', () => pick('objection', 'itiraz'), 'objection'),
      mk('👊', 'Masaya vur', () => this.sendChaos('slam'), 'slam'),
      mk('💦', 'Çay at', () => pick('tea', 'çay'), 'tea'),
      mk('🌪️', 'Masayı devir', () => this.sendChaos('flip'), 'flip'),
    );
    this.root.appendChild(bar);
    this.chaosBar = bar;
  }

  private sendChaos(kind: ChaosKind, target?: number) {
    this.client?.send({ t: 'chaos', kind, ...(target !== undefined ? { target } : {}) });
  }

  /** Gelen kaos olayı: yalnızca görsel/sosyal */
  onChaos(m: Extract<ServerMsg, { t: 'chaos' }>) {
    if (this.mySeat === null) return;
    const n = this.n();
    const fromRel = toRel(m.from, this.mySeat, n);
    const from = this.charAtRel(fromRel);
    const to = m.target !== undefined ? this.charAtRel(toRel(m.target, this.mySeat, n)) : null;
    if (!from) return;
    switch (m.kind) {
      case 'taunt': from.say(TAUNTS[m.phrase ?? 0] ?? '', 3); from.anim.play('point'); break;
      case 'objection': from.say(pickLine(OBJECTION_LINES), 2.8); from.anim.play('angry'); sfx.play('angry', from.spec.voicePitch); if (to) setTimeout(() => to.anim.play('shrug'), 500); break;
      case 'slam': from.anim.play('slamTable'); setTimeout(() => { sfx.play('tableSlam'); this.game.rig.shake(0.06, 0.25); }, 350); break;
      case 'tea': if (to) this.game.social.launch(from, to, () => { if (to === this.game.player) this.game.hud.toast(`💦 ${this.names[fromRel]} sana çay attı!`); }); break;
      case 'flip': this.game.chaosEvents.tableFlip(this.table, { c: from, id: `online-${m.from}` } as unknown as NPC); break;
    }
  }

  // ------------------------------------------------------------------ GameHost
  isHuman(i: number) { return i === 0; }

  react(i: number, kind: ReactKind, line?: string) {
    const c = this.charAtRel(i);
    if (!c) return;
    const anim: Record<ReactKind, Parameters<Character['anim']['play']>[0]> = {
      think: 'think', happy: 'laugh', angry: 'angry', win: 'cheer', lose: 'facepalm', goodMove: 'point', slam: 'slamTable', play: 'leanBack', surprise: 'surprise',
    };
    c.anim.play(anim[kind]);
    if (line) c.say(line, 2.5);
  }

  sfx(name: SfxName) { sfx.play(name); }
  toast(msg: string) { this.game.hud.toast(msg); }

  matchFinished(humanWon: boolean | null) {
    if (humanWon !== null) this.game.recordResult(this.gameId, humanWon);
    if (humanWon) { this.game.player.anim.play('cheer'); sfx.play('win'); }
    else if (humanWon === false) sfx.play('lose');
  }

  exit() {
    this.client?.close();
    this.client = null;
    this.ui?.destroy();
    this.ui = null;
    for (const c of this.chars.values()) { this.game.scene.remove(c.model.root); if (c.seat) c.seat.occupant = null; }
    this.chars.clear();
    for (const npc of this.bots.values()) npc.releaseFromGame();
    this.bots.clear();
    this.table.props.visible = true;
    this.table3d.clear();
    this.game.player.model.root.visible = true;
    this.root.remove();
    document.body.classList.remove('online-mode');
    try { history.replaceState(null, '', location.pathname); } catch { /* yok */ }
    this.game.standUp();
  }

  requestExit() {
    const d = h('div', 'modal');
    d.innerHTML = `<div class="panel"><h3>Odadan çıkılsın mı?</h3><p class="muted">Oyun sürüyorsa koltuğuna bir müdavim geçer.</p></div>`;
    const row = h('div', 'row-btns');
    row.append(btn('Çık', 'danger', () => { d.remove(); this.exit(); }), btn('Kal', 'primary', () => d.remove()));
    d.querySelector('.panel')!.appendChild(row);
    this.root.appendChild(d);
  }

  update(dt: number) {
    this.table3d.update(dt);
    for (const c of this.chars.values()) c.update(dt, this.game.kahve.collision, [], true);
  }

  /** test: istemci olayı yokmuş gibi bir sunucu mesajı uygula */
  inject(m: ServerMsg) { this.onMsg(m); }
}

