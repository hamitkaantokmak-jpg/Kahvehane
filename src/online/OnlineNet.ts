/**
 * Ortak kahvehane (çevrimiçi 2. aşama): odaya bağlılık masadan bağımsızdır. Oyuncu masadan kalkıp dolaşabilir;
 * odadaki arkadaşlar kahvehanede yürür görünür, el kol hareketleri ve salonda çay herkese ulaşır, çaya karşılık
 * kavgaya dönüşür (yalnızca görsel), ortak gerginlik çubuğu dolunca herkeste aynı olay yaşanır, "maç gecesi"nde
 * herkes TV'de aynı at yarışını izler. Masadaki oyun ekranı (OnlineSession) bu nesneye bağlanır ve ayrılır.
 */
import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { Seat } from '../world/Kahvehane';
import { Character } from '../characters/Character';
import type { ActionName } from '../characters/Animator';
import { sanitizeSpec } from '../characters/creator';
import { h, btn } from '../ui/dom';
import { sfx } from '../audio/Sfx';
import { pickLine } from '../npc/personalities';
import { levelOf } from '../chaos/ChaosDirector';
import { OnlineClient, Identity } from './OnlineClient';
import type { RoomView, ServerMsg, ClientMsg } from './protocol';
import { SEATS_OF } from './protocol';
import type { Presence, SalonEmote } from './salon';

/** Masadaki oyun ekranı (OnlineSession) bu arayüzle bağlanır */
export interface NetSessionHook {
  onMsg(m: ServerMsg): void;
}

const EMOTE_ANIM: Record<SalonEmote, ActionName> = {
  wave: 'wave', laugh: 'laugh', clap: 'clap', bellyDance: 'bellyDance', slamTable: 'slamTable', laf: 'point', drink: 'drink', wipe: 'facepalm',
};
const EMOTE_LINE: Partial<Record<SalonEmote, string[]>> = {
  wave: ['Selamün aleyküm!', 'Hayırlı akşamlar!', 'Merhaba ahali!'],
  laf: ['Bu bıyıkla mı okey oynuyorsun?', 'Çayın soğudu, tıpkı şansın gibi!', 'Zarın da senin gibi yorgun!'],
};
const BRAWL_LINES = ['Sen bana çay mı attın?!', 'Gel bakalım buraya!', 'Gömleğim gitti be!', 'Tutmayın beni!', 'Bu çayın hesabını vereceksin!'];
const CHEER_LINES = ['Oha, kavga var!', 'Ayırın şunları!', 'Çay savaşı başladı!', 'Aman kardeşim, sakin!'];

/** Uzaktaki bir arkadaşın kahvehanedeki karakteri */
interface Avatar {
  c: Character;
  pid: string;
  /** hedef konum (son gelen) */
  target: Presence | null;
  /** masada oturduğu koltuk (dolaşmıyorsa) */
  seat: Seat | null;
}

export class OnlineNet {
  readonly client: OnlineClient;
  room: RoomView | null = null;
  mySeat: number | null = null;
  /** son oyun durumu mesajı (masaya dönünce hemen çizmek için) */
  lastState: Extract<ServerMsg, { t: 'state' }> | null = null;
  tension = 0;
  session: NetSessionHook | null = null;
  readonly avatars = new Map<string, Avatar>();
  private chip: HTMLDivElement | null = null;
  private sendT = 0;
  private lastSent: { x: number; z: number; yaw: number; roam: boolean; at: number } | null = null;
  private brawlT = 0;
  private brawlTimers: number[] = [];
  closed = false;

  constructor(private game: Game, readonly code: string, id: Identity) {
    this.client = new OnlineClient(code, id);
    this.client.on((m) => this.onMsg(m));
  }

  get you() { return this.client.you; }
  send(m: ClientMsg) { this.client.send(m); }

  // ------------------------------------------------------------------ masa ekranı bağla/ayır
  attach(s: NetSessionHook) {
    this.session = s;
    this.chip?.remove();
    this.chip = null;
    this.sendPresence(true);
  }

  detach() {
    this.session = null;
    this.sendPresence(true);
    this.renderChip();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.client.close();
    this.chip?.remove();
    this.chip = null;
    for (const a of this.avatars.values()) this.removeAvatar(a);
    this.avatars.clear();
    this.brawlTimers.forEach((t) => clearTimeout(t));
    if (this.game.net === this) this.game.net = null;
    if (this.game.mode === 'explore') this.game.world.reservedTable = null;
  }

  // ------------------------------------------------------------------ mesajlar
  private onMsg(m: ServerMsg) {
    switch (m.t) {
      case 'welcome': this.mySeat = m.seat; this.room = m.room; this.syncAvatars(); break;
      case 'room': this.mySeat = m.seat; this.room = m.room; this.syncAvatars(); if (!this.session) this.renderChip(); break;
      case 'state': {
        const fresh = !this.lastState;
        this.lastState = m;
        if (!this.session && fresh) this.game.hud.toast('🎴 Masada oyun başladı! "Masaya dön" ile otur; dönmezsen yerine müdavim oynar.', 4);
        break;
      }
      case 'pos': this.onPos(m); break;
      case 'emote': this.onEmote(m.p, m.id); break;
      case 'salonTea': this.onSalonTea(m.from, m.to); break;
      case 'brawl': this.onBrawl(m.ids, m.ms); break;
      case 'tension': this.tension = m.v; break;
      case 'event': this.onEvent(m.id); break;
      case 'race': this.game.race.syncRace(m.seed, m.in); this.game.hud.toast('📺 MAÇ GECESİ! Herkes TV başına: aynı yarışı birlikte izliyorsunuz.', 4); break;
      case 'error': if (!this.session) this.game.hud.toast(m.msg); break;
    }
    if (m.t === 'room' && this.room?.phase === 'lobby') this.lastState = null;
    if (this.session && ['welcome', 'room', 'state', 'chaos', 'error'].includes(m.t)) this.session.onMsg(m);
  }

  // ------------------------------------------------------------------ masa ve koltuklar
  /** Odanın masası (eski odalarda yok) */
  get table() {
    const id = this.room?.table;
    return id ? this.game.kahve.tableById(id) ?? null : null;
  }

  /** Oyun içi (mutlak) koltuk → odanın masasındaki fiziksel sandalye */
  physSeat(abs: number, n = this.seatCount): Seat | null {
    const t = this.table;
    if (!t) return null;
    const idx = n === 2 && t.seats.length === 4 ? abs * 2 : abs;
    return t.seats[idx % t.seats.length];
  }

  get seatCount() {
    const r = this.room;
    if (!r) return 4;
    return r.phase === 'playing' ? SEATS_OF[r.game] : r.seats.length;
  }

  // ------------------------------------------------------------------ arkadaşların karakterleri
  charOf(pid: string | undefined | null): Character | null {
    if (!pid) return null;
    if (pid === this.you) return this.game.player;
    return this.avatars.get(pid)?.c ?? null;
  }

  private syncAvatars() {
    const r = this.room;
    if (!r) return;
    const keep = new Set<string>();
    r.seats.forEach((s, abs) => {
      if (s.occ !== 'human' || !s.player || s.player === this.you || !s.connected || !s.spec) return;
      keep.add(s.player);
      let a = this.avatars.get(s.player);
      if (!a) {
        const c = new Character({ ...sanitizeSpec(s.spec), id: `online-${s.player}`, name: s.name });
        c.bubbleHost = this.game.bubbles;
        this.game.scene.add(c.model.root);
        a = { c, pid: s.player, target: null, seat: null };
        this.avatars.set(s.player, a);
        // dolaşan biri ilk kez görünürken kapıda belirir
        c.pos.set(0, 0, 4.6);
      }
      if (s.roam) this.unseat(a);
      else {
        const seat = this.physSeat(abs);
        if (seat && a.seat !== seat) this.seatAvatar(a, seat);
      }
    });
    for (const [pid, a] of this.avatars) if (!keep.has(pid)) { this.removeAvatar(a); this.avatars.delete(pid); }
  }

  private seatAvatar(a: Avatar, seat: Seat) {
    this.unseat(a);
    if (seat.occupant && seat.occupant !== a.c.id) {
      const n = this.game.npcs.find((x) => x.c.seat === seat);
      if (n) n.leaveSeat();
      seat.occupant = null;
    }
    a.c.sitOn(seat);
    a.seat = seat;
  }

  private unseat(a: Avatar) {
    if (!a.seat) return;
    a.c.standUp();
    a.seat = null;
  }

  private removeAvatar(a: Avatar) {
    this.unseat(a);
    this.game.scene.remove(a.c.model.root);
  }

  private onPos(m: Extract<ServerMsg, { t: 'pos' }>) {
    const a = this.avatars.get(m.p);
    if (!a) return;
    a.target = { x: m.x, z: m.z, yaw: m.yaw, m: m.m, roam: m.roam };
    if (m.roam && a.seat) this.unseat(a);
    // ilk konum ya da çok uzaksa ışınla
    if (m.roam && a.c.pos.distanceTo(new THREE.Vector3(m.x, 0, m.z)) > 4) a.c.pos.set(m.x, 0, m.z);
  }

  /** Arkadaşın el kol hareketi */
  private onEmote(pid: string, id: SalonEmote) {
    const c = this.charOf(pid);
    if (!c) return;
    c.anim.play(EMOTE_ANIM[id]);
    const lines = EMOTE_LINE[id];
    if (lines) c.say(pickLine(lines), 2.2);
    if (id === 'slamTable') setTimeout(() => sfx.play('tableSlam'), 380);
    if (id === 'laugh') sfx.play('laugh', c.spec.voicePitch);
    if (id === 'clap') sfx.play('clap');
    // yakındaki müdavimler de tepki verir
    for (const n of this.game.npcs) if (n.c.pos.distanceTo(c.pos) < 4 && Math.random() < 0.4) setTimeout(() => n.onEmoteNearby(id === 'laf' ? 'laugh' : id === 'bellyDance' || id === 'clap' || id === 'wave' || id === 'slamTable' ? id : 'laugh'), 500 + Math.random() * 600);
  }

  /** Salonda çay: herkes uçan bardağı görür; isabet eden çaylanır */
  private onSalonTea(from: string, to: string) {
    const a = this.charOf(from), b = this.charOf(to);
    if (!a || !b) return;
    this.game.social.launch(a, b, () => {
      if (b === this.game.player) {
        this.game.hud.toast(`💦 ${a.name} sana çay attı! Karşılık verirsen kavga çıkar...`);
        b.say(pickLine(['Aaa! Gözüm!', 'Sıcak sıcak!', 'Gömleğim gitti!']), 2);
      }
    });
  }

  /** Zincirleme kavga (görsel): kavgacılar söylenip sallanır, etraf toplanır, sonunda Şükrü ayırır */
  private onBrawl(ids: string[], ms: number) {
    const chars = ids.map((id) => this.charOf(id)).filter((c): c is Character => !!c);
    if (chars.length < 2) return;
    this.brawlTimers.forEach((t) => clearTimeout(t));
    this.brawlTimers = [];
    this.brawlT = ms / 1000;
    this.game.hud.flashWarning(`🥊 ÇAY KAVGASI! ${chars.map((c) => c.name).join(' vs ')}`);
    sfx.play('angry');
    const steps = Math.max(2, Math.floor(ms / 1500));
    for (let i = 0; i < steps; i++) {
      this.brawlTimers.push(window.setTimeout(() => {
        chars.forEach((c, k) => {
          const other = chars[(k + 1) % chars.length];
          if (!c.seated) c.faceTowards(other.pos);
          c.anim.play(i % 2 ? 'swing' : 'angry');
          if (Math.random() < 0.5) c.say(pickLine(BRAWL_LINES), 1.6);
        });
        if (i === 0) for (const n of this.game.npcs) if (n.id !== 'sukru' && chars.some((c) => c.pos.distanceTo(n.c.pos) < 5) && Math.random() < 0.6) { n.c.faceTowards(chars[0].pos); n.c.say(pickLine(CHEER_LINES), 2); n.c.anim.play('surprise'); }
      }, i * 1500));
    }
    this.brawlTimers.push(window.setTimeout(() => {
      const sukru = this.game.npcs.find((n) => n.id === 'sukru');
      sukru?.c.say('Yeter! Ayrılın! Herkese benden birer çay, barışın!', 3);
      chars.forEach((c) => c.anim.play('shrug'));
    }, ms));
  }

  private onEvent(id: string) {
    const ev = this.game.chaosEvents;
    this.game.hud.flashWarning('⚡ Kahvehane coştu!');
    if (id === 'tvGoal') ev.tvGoal();
    else if (id === 'powerCut') ev.powerCut();
    else if (id === 'cat') ev.catVisit();
  }

  // ------------------------------------------------------------------ salon paneli (masada değilken)
  private renderChip() {
    if (this.closed || this.session) return;
    if (!this.chip) {
      this.chip = h('div', 'net-chip');
      this.game.overlay.appendChild(this.chip);
    }
    const r = this.room;
    const n = r ? r.seats.filter((s) => s.occ === 'human' && s.connected).length : 1;
    const c = this.chip;
    c.innerHTML = '';
    c.appendChild(h('div', 'nc-title', `🌐 <b>${this.code}</b> · ${n} kişi${r?.phase === 'playing' ? ' · oyun sürüyor' : ''}`));
    const row = h('div', 'nc-row');
    const mk = (label: string, fn: () => void, key: string) => { const b = btn(label, 'small', fn); b.dataset.net = key; row.appendChild(b); };
    mk('🪑 Masaya dön', () => this.backToTable(), 'table');
    mk('💦 Arkadaşa çay', () => this.throwTeaAtFriend(), 'tea');
    mk('📺 Maç gecesi', () => this.send({ t: 'race' }), 'race');
    mk('✖ Odadan çık', () => { this.close(); this.game.hud.toast('Odadan çıktın.'); }, 'leave');
    c.appendChild(row);
    c.appendChild(h('div', 'nc-hint muted small', 'Üstteki gerginlik çubuğu odadaki herkesle ortak.'));
  }

  /** Masaya geri otur (odadaki koltuğuna) */
  backToTable() {
    if (this.game.mode !== 'explore' || this.mySeat === null) return;
    const seat = this.physSeat(this.mySeat) ?? null;
    if (!seat) { this.game.hud.toast('Odanın masası bulunamadı.'); return; }
    if (seat.occupant) { const n = this.game.npcs.find((x) => x.c.seat === seat); n?.leaveSeat(); seat.occupant = null; }
    this.game.sitDown(seat, { resume: this });
  }

  /** En yakın (önündeki) arkadaşa çay at; yoksa false */
  throwTeaAtFriend(): boolean {
    const p = this.game.player;
    const fwd = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    let best: Avatar | null = null, bestScore = Infinity;
    for (const a of this.avatars.values()) {
      const d = a.c.pos.clone().sub(p.pos).setY(0);
      const dist = d.length();
      if (dist > 7 || dist < 0.05) continue;
      const score = dist - d.normalize().dot(fwd) * 2;
      if (score < bestScore) { bestScore = score; best = a; }
    }
    if (!best) { this.game.hud.toast('Yakında arkadaşın yok.'); return false; }
    this.send({ t: 'salonTea', target: best.pid });
    return true;
  }

  /** Önünde (çay atılabilecek mesafede) arkadaş var mı */
  friendInFront(maxDist = 4.5): boolean {
    const p = this.game.player;
    const fwd = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    for (const a of this.avatars.values()) {
      const d = a.c.pos.clone().sub(p.pos).setY(0);
      const dist = d.length();
      if (dist < maxDist && dist > 0.05 && d.normalize().dot(fwd) > 0.7) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ konum paylaşımı
  private sendPresence(force = false) {
    const p = this.game.player;
    const roam = !this.session && this.game.mode === 'explore';
    const now = performance.now();
    const L = this.lastSent;
    const moved = !L || Math.hypot(p.pos.x - L.x, p.pos.z - L.z) > 0.05 || Math.abs(p.yaw - L.yaw) > 0.1 || L.roam !== roam;
    if (!force && !moved && L && now - L.at < 3000) return;
    this.lastSent = { x: p.pos.x, z: p.pos.z, yaw: p.yaw, roam, at: now };
    this.send({ t: 'pos', x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2), yaw: +p.yaw.toFixed(2), m: moved && roam, roam });
  }

  update(dt: number) {
    if (this.closed) return;
    // konum: saniyede ~5 kez (yalnızca hareket varken), ayrıca ara sıra kalp atışı
    this.sendT -= dt;
    if (this.sendT <= 0) { this.sendT = 0.2; this.sendPresence(); }
    // dolaşan arkadaşlar hedefe doğru yürür (hız verilir; Character.update yürüme animasyonunu kendisi ayarlar)
    for (const a of this.avatars.values()) {
      const t = a.target, c = a.c;
      c.velocity.set(0, 0, 0);
      if (t?.roam && !a.seat) {
        const dx = t.x - c.pos.x, dz = t.z - c.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.04) {
          const sp = Math.min(2.6, Math.max(1.2, d * 3));
          c.velocity.set((dx / d) * Math.min(sp, d / Math.max(dt, 1e-3)), 0, (dz / d) * Math.min(sp, d / Math.max(dt, 1e-3)));
          c.targetYaw = Math.atan2(dx, dz);
        } else c.targetYaw = t.yaw;
      }
      c.update(dt, undefined, [], true);
    }
    if (this.brawlT > 0) this.brawlT -= dt;
    // dolaşırken: odanın masasına müdavim oturmasın, ortak gerginlik çubuğu
    if (!this.session && this.game.mode === 'explore') {
      if (this.room?.table) this.game.world.reservedTable = this.room.table;
      this.game.hud.setTension(this.tension, levelOf(this.tension));
    }
  }
}
