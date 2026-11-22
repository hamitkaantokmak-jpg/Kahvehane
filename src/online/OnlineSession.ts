/**
 * Çevrimiçi masa oturumu: lobi (oda kodu, koltuklar, oyun seçimi), masaya oturan arkadaşların karakterleri,
 * sunucudan gelen oyun durumu ve masa kaosu. Oyun kuralları sunucuda çalışır; burası yalnızca gösterir ve niyet yollar.
 */
import type { Game } from '../core/Game';
import type { Seat } from '../world/Kahvehane';
import type { NPC } from '../npc/NPC';
import type { Character } from '../characters/Character';
import { sanitizeSpec } from '../characters/creator';
import { TableView3D } from '../tables/TableView3D';
import type { GameHost, ReactKind } from '../tables/TableSession';
import type { GameId, Difficulty } from '../games/common/types';
import { GAME_META, DIFFICULTY_TR } from '../games/common/types';
import { h, btn } from '../ui/dom';
import { sfx, SfxName } from '../audio/Sfx';
import { pickLine } from '../npc/personalities';
import { createRoom, roomExists } from './OnlineClient';
import { OnlineNet } from './OnlineNet';
import { seatCamera } from '../core/Game';
import { ChaosKind, ChaosPref, GAMES_OF_KIND, GameAction, OnlineGameId, RoomKind, RoomView, SEATS_OF, ServerMsg, TAUNTS } from './protocol';
import { BOT_SEATS } from './room';
import { actionToAbs, rotateEvent, rotateView, toAbs, toRel } from './rotate';
import { peekTargetOf } from './yanci';
import { tileEl } from '../ui/games/TileView';
import type { Tile, OkeyCtx } from '../games/common/tiles';
import { NetUI, OnlineBatakUI, OnlineKingUI, OnlineOkey101UI, OnlineOkeyUI, OnlinePistiUI, OnlineTavlaUI } from './OnlineUIs';

const PREF_TR: Record<ChaosPref, string> = { calm: 'Sakin', normal: 'Normal', chaos: 'Tam kaos' };
const OBJECTION_LINES = ['İtiraz var! Bu el hileli!', 'Hakem! Kart karıştı!', 'Bir dakika, bir dakika!'];

export type OnlineStart = { create: true } | { code: string } | { resume: OnlineNet };

export class OnlineSession implements GameHost {
  readonly root: HTMLDivElement;
  table3d: TableView3D;
  net: OnlineNet | null = null;
  room: RoomView | null = null;
  /** benim mutlak koltuğum */
  mySeat: number | null = null;
  /** yancısı olduğum koltuk (koltuksuzsam) */
  yanciOf: number | null = null;
  /** görünümün kimin gözünden olduğu: kendi koltuğum ya da yancısı olduğum koltuk */
  get viewSeat(): number | null { return this.mySeat ?? this.yanciOf; }
  private yanciBar: HTMLDivElement | null = null;
  private peekPanel: HTMLDivElement | null = null;
  private badges: HTMLDivElement | null = null;
  private peekCueOn = false;
  /** son hata ve tokatlar (ekranda kısa kalır; testler ve kayıt için) */
  lastError = '';
  readonly slaps: { by: number; yanci: string; ok: boolean }[] = [];
  ui: (NetUI & { el: HTMLElement }) | null = null;
  uiGame: OnlineGameId | null = null;
  names: string[] = [];
  gameId: GameId = 'batak';
  difficulty: Difficulty = 'medium';
  readonly paused = false;
  private bots = new Map<number, NPC>();
  private panel: HTMLDivElement;
  private chaosBar: HTMLDivElement | null = null;
  private status: HTMLDivElement;
  pref: ChaosPref;

  constructor(private game: Game, public seat: Seat, start: OnlineStart) {
    this.root = h('div', 'game-root online-root');
    document.body.classList.add('online-mode');
    game.overlay.appendChild(this.root);
    this.table3d = new TableView3D(seat);
    this.panel = h('div', 'select-panel online-panel');
    this.status = h('div', 'online-status');
    this.root.append(this.panel);
    this.pref = game.settings.chaosIntensity === 'calm' ? 'calm' : game.settings.chaosIntensity === 'chaos' ? 'chaos' : 'normal';
    if ('resume' in start) this.resume(start.resume);
    else this.showJoin(start);
  }

  /** İstemci (bağlantı) ortak kahvehane katmanında yaşar; masa ekranı ona bağlanır */
  get client() { return this.net?.client ?? null; }

  /** Salonda dolaşırken masaya geri dönüldü: var olan bağlantıyla devam */
  private resume(net: OnlineNet) {
    this.net = net;
    net.attach(this);
    this.root.appendChild(this.status);
    this.panel.innerHTML = '<h2>🌐 Masaya dönülüyor...</h2>';
    if (net.room) this.onMsg({ t: 'room', room: net.room, seat: net.mySeat });
    if (net.lastState && net.room?.phase === 'playing') this.onMsg(net.lastState);
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
        const code = 'create' in start ? await createRoom(this.table.kind as RoomKind, this.table.id) : start.code;
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
    this.game.net?.close();
    const net = new OnlineNet(this.game, code, { name, spec, chaos: this.pref });
    this.game.net = net;
    this.net = net;
    const c = net.client;
    net.attach(this);
    c.onStatus = (st) => { this.status.textContent = st === 'open' ? '' : st === 'reconnecting' ? '🔌 Bağlantı koptu, yeniden bağlanıyor...' : st === 'closed' ? 'Bağlantı kapandı.' : 'Bağlanıyor...'; };
    this.panel.innerHTML = '<h2>🌐 Bağlanıyor...</h2>';
    this.root.appendChild(this.status);
    try { history.replaceState(null, '', `${location.pathname}?oda=${code}`); } catch { /* yok */ }
  }

  // ------------------------------------------------------------------ sunucu mesajları
  onMsg(m: ServerMsg) {
    switch (m.t) {
      case 'welcome': this.mySeat = m.seat; this.setRoom(m.room); break;
      case 'room': this.mySeat = m.seat; this.setRoom(m.room); break;
      case 'state': this.onState(m); break;
      case 'chaos': this.onChaos(m); break;
      case 'error': this.lastError = m.msg; this.toast(m.msg); break;
      case 'peekView': this.onPeekView(m); break;
      case 'peekCue': this.peekCueOn = m.on; this.renderBadges(); if (m.on) sfx.play('pop'); break;
      case 'slap': this.onSlap(m); break;
      case 'point': this.onPoint(m); break;
    }
  }

  private setRoom(r: RoomView) {
    this.room = r;
    const wasYanci = this.yanciOf;
    this.yanciOf = this.mySeat === null ? r.watchers?.find((w) => w.player === this.net?.you)?.yanci ?? null : null;
    // yancılık bitti/değişti: oyun ekranı yeniden kurulur
    if (this.ui && wasYanci !== this.yanciOf) this.backToLobby();
    this.syncSeats();
    this.renderBadges();
    if (!this.ui) this.renderLobby();
  }

  private onState(m: Extract<ServerMsg, { t: 'state' }>) {
    if (m.yanci) { this.mySeat = null; this.yanciOf = m.seat; } else { this.mySeat = m.seat; this.yanciOf = null; }
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
    const yanci = this.yanciOf !== null;
    const net = { act: (a: GameAction) => (yanci ? this.toast('Yancısın: oynayamazsın, ama taşa dokunarak sahibine işaret edebilirsin.') : this.client?.send({ t: 'act', a: actionToAbs(g, a, this.viewSeat ?? 0) })), next: () => this.client?.send({ t: 'next' }), toLobby: () => this.backToLobby() };
    if (g === 'batak') this.ui = new OnlineBatakUI(this, { partners: !!o?.batakPartners, hands: o?.batakHands ?? 5, zeroPenalty: !!o?.batakZeroPenalty }, net);
    else if (g === 'king') this.ui = new OnlineKingUI(this, { short: !!o?.kingShort }, net);
    else if (g === 'okey') this.ui = new OnlineOkeyUI(this, net);
    else if (g === 'okey101') this.ui = new OnlineOkey101UI(this, o?.okey101Hands ?? 3, !!o?.okey101Doubling, net);
    else if (g === 'tavla') this.ui = new OnlineTavlaUI(this, { target: o?.tavlaTarget ?? 5, katmerliMars: o?.tavlaKatmerli ?? true }, net);
    else this.ui = new OnlinePistiUI(this, { players: g === 'pisti2' ? 2 : 4, target: o?.pistiTarget ?? 101 }, net);
    this.root.insertBefore(this.ui.el, this.status);
    if (yanci) this.addYanciBar(); else this.addChaosBar();
    this.renderBadges();
  }

  private backToLobby() {
    this.ui?.destroy();
    this.ui = null;
    this.uiGame = null;
    this.chaosBar?.remove();
    this.chaosBar = null;
    this.yanciBar?.remove();
    this.yanciBar = null;
    this.peekPanel?.remove();
    this.peekPanel = null;
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
      // yancı modu (okey masası): her koltuğa bir yancı
      if (r.kind === 'okey') {
        const y = r.watchers?.find((w) => w.yanci === i);
        if (y) d.appendChild(h('div', 'meta yanci-of', `🧍 ${y.player === this.net?.you ? 'Sen' : y.name} yancı`));
        else if (i !== this.mySeat && (r.phase === 'lobby' || this.mySeat === null)) {
          const b = btn('🧍 Yancı ol', 'small', () => this.client?.send({ t: 'yanci', seat: i }));
          b.dataset.yanci = String(i);
          d.appendChild(b);
        }
      }
      seats.appendChild(d);
    });
    p.appendChild(seats);
    if (r.kind === 'okey') {
      const idle = (r.watchers ?? []).filter((w) => w.yanci === null);
      if (idle.length) p.appendChild(h('p', 'muted small', `Ayakta bekleyen: ${idle.map((w) => (w.player === this.net?.you ? 'sen' : w.name)).join(', ')} — bir koltuğa "Yancı ol".`));
      p.appendChild(h('p', 'muted small', 'Yancı, sahibinin ıstakasını görür ve ona taş işaret eder; sağdakinin eline gizlice bakabilir ama yakalanırsa tokadı yer!'));
      if (this.yanciOf !== null) p.appendChild(btn('Yancılığı bırak', 'small ghost', () => this.client?.send({ t: 'yanci', seat: null })));
    }
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
    row.appendChild(btn('🚶 Kalk, dolaş', 'small', () => this.leaveTable()));
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

  /** Mutlak koltuk → fiziksel sandalye (odanın masası; eski odalarda oturulan masa, bana göre) */
  private tableSeat(abs: number, n: number): Seat {
    const ph = this.net?.physSeat(abs, n);
    if (ph) return ph;
    const rel = toRel(abs, this.viewSeat ?? 0, n);
    const off = n === 2 && this.table.seats.length === 4 ? rel * 2 : rel;
    return this.table.seats[(this.seat.index + off) % this.table.seats.length];
  }

  /** Oyuncu odadaki koltuk numarasına karşılık gelen sandalyede otursun (herkes aynı yerleşimi görür) */
  private ensureMySeat(n: number) {
    if (this.yanciOf !== null) { this.placeAsYanci(n); return; }
    if (this.mySeat === null) { this.placeStanding(); return; }
    if (!this.net?.table) return;
    const want = this.tableSeat(this.mySeat, n);
    const wasStanding = this.yanciPlacedAt !== null;
    this.yanciPlacedAt = null;
    if (want === this.seat && !wasStanding && this.game.player.seat === want) return;
    const p = this.game.player;
    if (want.occupant && want.occupant !== p.id) {
      const npc = this.game.npcs.find((x) => x.c.seat === want);
      if (npc) npc.leaveSeat();
      else return; // bir arkadaş oturuyor; sunucu düzeltir
      want.occupant = null;
    }
    p.standUp();
    p.sitOn(want);
    this.seat = want;
    this.game.world.reservedTable = want.table.id;
    this.game.rig.setFixed(...seatCamera(want));
    this.table3d.clear();
    this.table3d = new TableView3D(want);
  }

  private relNames(g: OnlineGameId): string[] {
    const n = SEATS_OF[g];
    const v = this.viewSeat ?? 0;
    return [...Array(n).keys()].map((rel) => (rel === 0 && this.yanciOf === null ? 'Sen' : (this.room?.seats[toAbs(rel, v, n)]?.name ?? '?') + (rel === 0 ? ' (yancısısın)' : '')));
  }

  /** Yancı: sahibinin yanında ayakta durur, kamera sahibinin gözünden bakar */
  private yanciPlacedAt: string | null = null;
  private placeAsYanci(n: number) {
    const owner = this.yanciOf!;
    const ownerSeat = this.tableSeat(owner, n);
    const key = `${ownerSeat.table.id}:${ownerSeat.index}`;
    if (this.yanciPlacedAt === key) return;
    this.yanciPlacedAt = key;
    const p = this.game.player;
    p.standUp();
    const place = this.net?.yanciPlace(owner);
    if (place) { p.pos.copy(place.pos); p.yaw = place.yaw; }
    this.seat = ownerSeat;
    this.game.world.reservedTable = ownerSeat.table.id;
    this.game.rig.setFixed(...seatCamera(ownerSeat));
    this.table3d.clear();
    this.table3d = new TableView3D(ownerSeat);
  }

  /** Koltuksuz (henüz yancı değil): masanın yanında ayakta bekler */
  private placeStanding() {
    if (this.yanciPlacedAt === 'idle') return;
    this.yanciPlacedAt = 'idle';
    const p = this.game.player;
    const t = this.seat.table;
    p.standUp();
    const away = this.seat.pos.clone().sub(t.center).setY(0).normalize();
    p.pos.copy(this.seat.pos).addScaledVector(away, 0.7).setY(0);
    p.yaw = Math.atan2(t.center.x - p.pos.x, t.center.z - p.pos.z);
  }

  /** Koltuklara müdavimleri yerleştir (arkadaşların karakterlerini ortak kahvehane katmanı yönetir) */
  private syncSeats() {
    const r = this.room;
    if (!r || this.viewSeat === null) return;
    const n = this.n();
    this.ensureMySeat(n);
    const keepBots = new Set<number>();
    for (let abs = 0; abs < Math.min(n, r.seats.length); abs++) {
      if (abs === this.mySeat) continue;
      const seat = this.tableSeat(abs, n);
      const s = r.seats[abs];
      if (s.occ === 'human') continue;
      keepBots.add(abs);
      const want = BOT_SEATS[abs].id;
      let npc = this.bots.get(abs);
      if (!npc || npc.id !== want || npc.c.seat !== seat) {
        if (npc && npc.id !== want) npc.releaseFromGame();
        npc = this.game.npcs.find((x) => x.id === want) ?? this.game.npcs.find((x) => x.id !== 'sukru' && ![...this.bots.values()].includes(x));
        if (!npc) continue;
        this.bots.set(abs, npc);
        if (npc.c.seat !== seat) {
          const occ = this.game.npcs.find((x) => x.c.seat === seat && x !== npc);
          if (occ) occ.leaveSeat();
          // sandalyede oyuncu ya da bir arkadaş oturuyorsa (sunucu yerleşimi henüz güncellenmediyse) dokunma
          if (seat.occupant && seat.occupant !== npc.c.id) continue;
          npc.teleportToSeat(seat);
        }
        npc.mode = 'inGame';
      }
    }
    for (const [abs, npc] of this.bots) if (!keepBots.has(abs)) { npc.releaseFromGame(); this.bots.delete(abs); }
    if (this.uiGame) this.names = this.relNames(this.uiGame);
  }

  private charAtRel(rel: number): Character | null {
    if (rel === 0 && this.yanciOf === null) return this.game.player;
    const r = this.room;
    if (!r || this.viewSeat === null) return null;
    const abs = toAbs(rel, this.viewSeat, this.n());
    const s = r.seats[abs];
    if (s?.occ === 'human' && s.player) return this.net?.charOf(s.player) ?? null;
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
      mk('🚶', 'Kalk, dolaş', () => this.leaveTable(), 'stand'),
    );
    this.root.appendChild(bar);
    this.chaosBar = bar;
  }

  private sendChaos(kind: ChaosKind, target?: number) {
    this.client?.send({ t: 'chaos', kind, ...(target !== undefined ? { target } : {}) });
  }

  /** Gelen kaos olayı: yalnızca görsel/sosyal */
  onChaos(m: Extract<ServerMsg, { t: 'chaos' }>) {
    if (this.viewSeat === null) return;
    const n = this.n();
    const fromRel = toRel(m.from, this.viewSeat, n);
    const from = this.charAtRel(fromRel);
    const to = m.target !== undefined ? this.charAtRel(toRel(m.target, this.viewSeat, n)) : null;
    if (!from) return;
    switch (m.kind) {
      case 'taunt': from.say(TAUNTS[m.phrase ?? 0] ?? '', 3); from.anim.play('point'); break;
      case 'objection': from.say(pickLine(OBJECTION_LINES), 2.8); from.anim.play('angry'); sfx.play('angry', from.spec.voicePitch); if (to) setTimeout(() => to.anim.play('shrug'), 500); break;
      case 'slam': from.anim.play('slamTable'); setTimeout(() => { sfx.play('tableSlam'); this.game.rig.shake(0.06, 0.25); }, 350); break;
      case 'tea': if (to) this.game.social.launch(from, to, () => { if (to === this.game.player) this.game.hud.toast(`💦 ${this.names[fromRel]} sana çay attı!`); }); break;
      case 'flip': this.game.chaosEvents.tableFlip(this.table, { c: from, id: `online-${m.from}` } as unknown as NPC); break;
    }
  }

  // ------------------------------------------------------------------ yancı modu
  /** Yancının çubuğu: gizlice bak (basılı tut), yancılığı bırak, kalk */
  private addYanciBar() {
    this.yanciBar?.remove();
    const bar = h('div', 'online-chaos yanci-bar');
    const peek = btn('👀<span class="lb"> Gizlice bak (basılı tut)</span>', 'small accent', () => {});
    peek.dataset.peek = '1';
    const on = (e: Event) => { e.preventDefault(); this.client?.send({ t: 'peek', on: true }); peek.classList.add('down'); };
    const off = () => { if (!peek.classList.contains('down')) return; peek.classList.remove('down'); this.client?.send({ t: 'peek', on: false }); };
    peek.addEventListener('pointerdown', on);
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) peek.addEventListener(ev, off);
    bar.append(peek, btn('🧍<span class="lb"> Yancılığı bırak</span>', 'small', () => this.client?.send({ t: 'yanci', seat: null })), btn('🚶<span class="lb"> Kalk, dolaş</span>', 'small', () => this.leaveTable()));
    this.root.appendChild(bar);
    this.yanciBar = bar;
    this.ui?.el.classList.add('yanci-view');
    // ıstakada taşa dokun → sahibine işaret
    const rack = (this.ui as unknown as { rack?: { onSelect: () => void; selected: Set<number> } }).rack;
    if (rack) rack.onSelect = () => {
      const id = [...rack.selected][0];
      rack.selected.clear();
      if (id === undefined) return;
      this.client?.send({ t: 'point', id });
      this.toast('👆 Sahibine bu taşı gösterdin.');
    };
    this.peekPanel = h('div', 'peek-panel');
    this.peekPanel.style.display = 'none';
    this.root.appendChild(this.peekPanel);
  }

  /** Gizlice bakılan elin görünen taşları (yalnızca yancıda) */
  private onPeekView(m: Extract<ServerMsg, { t: 'peekView' }>) {
    const p = this.peekPanel;
    if (!p) return;
    const ctx = (this.ui as unknown as { s?: { ctx?: OkeyCtx } }).s?.ctx ?? null;
    const who = this.room?.seats[m.seat]?.name ?? '?';
    p.style.display = '';
    p.innerHTML = `<div class="pk-title">👀 Gizlice bakıyorsun · ${who}: <b>${m.tiles.length}</b>/${m.total} taş gördün</div>`;
    const row = h('div', 'pk-row');
    for (const t of m.tiles as Tile[]) row.appendChild(tileEl(t, ctx, { small: true }));
    p.appendChild(row);
  }

  /** Sahibi ve bakılan oyuncu için yancı rozetleri (+ tokat düğmesi) */
  private renderBadges() {
    const r = this.room;
    if (!this.ui || !r || r.kind !== 'okey' || this.mySeat === null) { this.badges?.remove(); this.badges = null; return; }
    const n = this.n();
    const mine = r.watchers?.find((w) => w.yanci === this.mySeat && w.connected);
    const peeker = r.watchers?.find((w) => w.connected && w.yanci !== null && peekTargetOf(w.yanci, n) === this.mySeat);
    if (!mine && !peeker) { this.badges?.remove(); this.badges = null; return; }
    if (!this.badges) { this.badges = h('div', 'yanci-badges'); this.root.appendChild(this.badges); }
    const b = this.badges;
    b.innerHTML = '';
    if (mine) b.appendChild(h('div', 'yb', `🧍 <b>${mine.name}</b> yancın — taş gösterebilir`));
    if (peeker) {
      const owner = r.seats[peeker.yanci!]?.name ?? '?';
      const d = h('div', `yb peeker${this.peekCueOn ? ' cue' : ''}`, `🧍 <b>${peeker.name}</b> yanında (yancı · ${owner})${this.peekCueOn ? ' — 👀 <b>ELİNE BAKIYOR!</b>' : ''}`);
      const slap = btn('👋 Tokat at', 'small danger', () => this.client?.send({ t: 'catch' }));
      slap.dataset.slap = '1';
      d.appendChild(slap);
      b.appendChild(d);
    }
  }

  private onSlap(m: Extract<ServerMsg, { t: 'slap' }>) {
    this.slaps.push({ by: m.by, yanci: m.yanci, ok: m.ok });
    const n = this.n();
    const by = this.viewSeat !== null ? this.charAtRel(toRel(m.by, this.viewSeat, n)) : null;
    const y = this.net?.charOf(m.yanci) ?? null;
    const meYanci = m.yanci === this.net?.you;
    const meBy = m.by === this.mySeat;
    if (by && y) { by.faceTowards(y.pos); by.anim.play('swing'); }
    setTimeout(() => {
      if (m.ok) {
        sfx.play('slap');
        this.game.rig.shake(meYanci ? 0.08 : 0.03, 0.2);
        if (y) { y.anim.play('surprise'); y.anim.hitImpulse(0.9); y.say(pickLine(['Ay! Bakmıyordum ki!', 'Tamam tamam, bakmam!', 'Elim kaydı, gözüm kaydı!']), 2.2); }
        by?.say(pickLine(['Gözünü elimden çek!', 'Yakaladım seni!', 'Yancılığını bil!']), 2.2);
        if (meYanci) this.toast('👋 Yakalandın! Bu el bir daha bakamazsın.');
        else if (meBy) this.toast('👋 Yakaladın! Yancı bu el bakamaz.');
      } else {
        sfx.play('whoosh');
        by?.say(pickLine(['Hmm, bakmıyormuş...', 'Ben sandım ki...']), 2);
        y?.say(pickLine(['Ne yaptım ben şimdi?', 'Masumum!']), 2);
        if (meBy) this.toast('Boşa tokat! Bir süre tekrar atamazsın.');
      }
    }, 300);
    if (meYanci && this.peekPanel) this.peekPanel.style.display = 'none';
    this.peekCueOn = false;
    this.renderBadges();
  }

  /** Yancım bir taşı işaret etti (yalnızca bende görünür) */
  private onPoint(m: Extract<ServerMsg, { t: 'point' }>) {
    const el = this.ui?.el.querySelector(`.rack [data-id="${m.id}"]`) as HTMLElement | null;
    if (!el) return;
    el.classList.add('pointed');
    setTimeout(() => el.classList.remove('pointed'), 3000);
    const who = this.room?.watchers?.find((w) => w.player === m.from)?.name ?? 'Yancın';
    this.toast(`👆 ${who} bu taşı gösteriyor.`);
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

  /** Masa ekranını kapat (bağlantı ayrı yönetilir) */
  private teardown() {
    this.ui?.destroy();
    this.ui = null;
    this.uiGame = null;
    this.chaosBar = null;
    this.yanciBar = null;
    this.peekPanel = null;
    this.badges = null;
    for (const npc of this.bots.values()) npc.releaseFromGame();
    this.bots.clear();
    this.table.props.visible = true;
    this.table3d.clear();
    this.game.player.model.root.visible = true;
    this.root.remove();
    document.body.classList.remove('online-mode');
  }

  /** Odadan tamamen çık */
  exit() {
    this.teardown();
    this.net?.close();
    this.net = null;
    try { history.replaceState(null, '', location.pathname); } catch { /* yok */ }
    this.game.standUp();
  }

  /** Masadan kalk ama odada kal: kahvehanede arkadaşlarla dolaş, sonra "Masaya dön" */
  leaveTable() {
    if (!this.net) { this.exit(); return; }
    const net = this.net;
    this.teardown();
    this.net = null;
    this.game.standUp();
    net.detach();
    this.game.hud.toast(this.room?.phase === 'playing' ? '🚶 Masadan kalktın. Dönmezsen bir süre sonra yerine müdavim oynar.' : '🚶 Salonda dolaşıyorsun. Masaya dönmek için üstteki "Masaya dön".', 4);
  }

  requestExit() {
    const d = h('div', 'modal');
    d.innerHTML = `<div class="panel"><h3>Masadan kalkılsın mı?</h3><p class="muted">Kalkıp salonda dolaşabilir ya da odadan tamamen çıkabilirsin. Oyun sürüyorsa koltuğuna bir müdavim geçer.</p></div>`;
    const row = h('div', 'row-btns');
    row.append(btn('Odadan çık', 'danger', () => { d.remove(); this.exit(); }), btn('🚶 Kalk, dolaş', '', () => { d.remove(); this.leaveTable(); }), btn('Kal', 'primary', () => d.remove()));
    d.querySelector('.panel')!.appendChild(row);
    this.root.appendChild(d);
  }

  update(dt: number) {
    this.table3d.update(dt);
  }

  /** test: istemci olayı yokmuş gibi bir sunucu mesajı uygula */
  inject(m: ServerMsg) { this.onMsg(m); }
}

