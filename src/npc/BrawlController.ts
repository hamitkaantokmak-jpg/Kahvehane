/**
 * Kavga davranış/görsel katmanı. Kararlar saf `Brawl` modelinden gelir; bu sınıf NPC'leri yürütür,
 * ıstaka sallatır, vuruşları uygular, Şükrü'yü yatıştırmaya gönderir ve kavga bitince herkesi
 * (oyundakileri masalarına) geri yollar.
 */
import * as THREE from 'three';
import { Brawl, Candidate } from '../chaos/Brawl';
import type { ChaosDirector } from '../chaos/ChaosDirector';
import type { Rng } from '../games/common/rng';
import type { NPC, NpcWorld } from './NPC';
import { approachPoint } from './NPC';
import type { Character } from '../characters/Character';
import type { Seat } from '../world/Kahvehane';
import { makeIstaka, makeTray } from '../characters/CharacterModel';
import { pickLine } from './personalities';
import { sfx } from '../audio/Sfx';

export const PLAYER_ID = 'player';
/** Şükrü bu gerginliğin üstünde kavgaya müdahale eder */
export const CALM_THRESHOLD = 28;
/** Oyuncu kavgada en sık bu aralıkla vurulabilir (sn) — sürekli yere düşmesin */
export const PLAYER_HIT_GAP = 2.5;
/** Gerginlik düşük kalsa da Şükrü kavgayı bu kadar saniye sonra fark eder */
export const SUKRU_NOTICE = 4;

interface FighterRuntime {
  swingT: number;
  pathT: number;
}

export interface BrawlHooks {
  playerBonked(by: Character): void;
  toast(msg: string): void;
}

export class BrawlController {
  brawl: Brawl | null = null;
  private rt = new Map<string, FighterRuntime>();
  sukruState: 'none' | 'coming' | 'done' = 'none';
  private playerHitT = 0;
  private center = new THREE.Vector3();
  /** Kavgaya karışan oyun NPC'lerinin masa koltukları (geri dönüş için) */
  private savedSeats = new Map<string, Seat>();
  /** İstatistik / test için */
  history: { a: string; b: string; reason: string; participants: string[] }[] = [];

  constructor(private w: NpcWorld, private chaos: ChaosDirector, private rng: Rng, private hooks: BrawlHooks) {}

  get active() { return !!this.brawl && this.brawl.active; }

  private npc(id: string): NPC | undefined { return this.w.npcs.find((n) => n.id === id); }
  private charOf(id: string): Character | undefined { return id === PLAYER_ID ? this.w.player : this.npc(id)?.c; }

  /** Kavgayı başlat. b 'player' olabilir. Zaten kavga varsa yeni gelen mevcut kavgaya eklenmez (false). */
  start(a: string, b: string): boolean {
    if (this.active) return false;
    const ca = this.charOf(a), cb = this.charOf(b);
    if (!ca || !cb || a === 'sukru' || b === 'sukru') return false;
    this.brawl = new Brawl(a, b);
    this.rt.clear();
    this.sukruState = 'none';
    this.chaos.add('brawlStart');
    this.center.copy(ca.pos).add(cb.pos).multiplyScalar(0.5);
    for (const id of [a, b]) if (id !== PLAYER_ID) this.enlist(this.npc(id)!, 'fighter');
    this.hooks.toast(`🥊 Kavga çıktı: ${ca.name} vs ${cb.name}!`);
    // çevredekiler (Şükrü hariç) değerlendirilir; herkes en fazla bir kez
    const others = this.w.npcs.filter((n) => n.id !== 'sukru' && !this.brawl!.has(n.id) && n.mode !== 'react');
    others.sort((x, y) => x.c.pos.distanceTo(this.center) - y.c.pos.distanceTo(this.center));
    for (const n of others) {
      const cand: Candidate = { id: n.id, temper: n.p.temper, distance: n.c.pos.distanceTo(this.center), friends: n.p.friends, rivals: n.p.rivals };
      const role = this.brawl.consider(cand, this.rng);
      if (role) this.enlist(n, role);
    }
    return true;
  }

  private enlist(n: NPC, role: 'fighter' | 'helper' | 'separator' | 'fleer') {
    const c = n.c;
    n.releaseReservations();
    c.stopWalking();
    if (n.mode === 'inGame' && c.seat) this.savedSeats.set(n.id, c.seat);
    if (c.seated) c.standUp();
    c.anim.posture = 'stand';
    c.model.handPropL.clear();
    c.anim.stop('carry');
    n.enterBrawl(role);
    this.rt.set(n.id, { swingT: 0.8 + this.rng() * 1.2, pathT: 0 });
    if (role === 'fighter' || role === 'helper') {
      c.model.setHeldProp(makeIstaka());
      c.say(pickLine(n.p.lines.brawlJoin), 2.5);
      c.anim.play('angry');
      sfx.play('angry', c.spec.voicePitch);
    } else if (role === 'separator') {
      c.say(pickLine(n.p.lines.brawlBreakUp), 2.8);
    } else {
      c.say(pickLine(n.p.lines.brawlFlee), 2.2);
      c.anim.play('surprise');
      const away = c.pos.clone().sub(this.center).setY(0);
      if (away.lengthSq() < 0.01) away.set(1, 0, 0);
      away.normalize().multiplyScalar(4).add(c.pos);
      away.x = THREE.MathUtils.clamp(away.x, -7.5, 7.5);
      away.z = THREE.MathUtils.clamp(away.z, -5.5, 5.5);
      c.walkTo(this.w.nav, away.x, away.z, () => n.exitBrawl(), 2.6);
    }
  }

  update(dt: number) {
    const b = this.brawl;
    if (!b) return;
    this.playerHitT -= dt;
    if (b.active) {
      b.update(dt);
      this.updateCenter();
      for (const p of b.state.participants) {
        if (p.id === PLAYER_ID) continue;
        const n = this.npc(p.id);
        if (!n) continue;
        if (p.role === 'fighter' || p.role === 'helper') this.updateFighter(n, p.target, dt);
        else if (p.role === 'separator') this.updateSeparator(n, dt);
      }
      this.updateSukru();
    }
    if (!b.active) this.finish();
  }

  private updateCenter() {
    const pts = this.brawl!.state.participants.filter((p) => p.role === 'fighter').map((p) => this.charOf(p.id)?.pos).filter(Boolean) as THREE.Vector3[];
    if (pts.length) { this.center.set(0, 0, 0); for (const v of pts) this.center.add(v); this.center.multiplyScalar(1 / pts.length); }
  }

  private updateFighter(n: NPC, targetId: string | null, dt: number) {
    const b = this.brawl!;
    // hedef kavgadan çıktıysa karşı taraftan yeni hedef seç
    if (!targetId || !b.has(targetId)) {
      const me = b.get(n.id)!;
      const opp = b.state.participants.find((p) => p.side === (me.side === 0 ? 1 : 0) && (p.role === 'fighter' || p.role === 'helper'));
      if (!opp) return;
      me.target = opp.id;
      targetId = opp.id;
    }
    const tc = this.charOf(targetId);
    if (!tc) return;
    const c = n.c;
    const rt = this.rt.get(n.id)!;
    const d = c.pos.distanceTo(tc.pos);
    rt.pathT -= dt;
    if (d > 1.05) {
      if (rt.pathT <= 0 || !c.isWalking) { rt.pathT = 0.6; c.walkTo(this.w.nav, tc.pos.x, tc.pos.z, undefined, 2.3); }
      return;
    }
    c.stopWalking();
    c.faceTowards(tc.pos);
    rt.swingT -= dt;
    if (rt.swingT > 0 || c.anim.isIncapacitated()) return;
    rt.swingT = 1.3 + this.rng() * 1.1;
    c.anim.play(this.rng() < 0.25 ? 'slamTable' : 'swing');
    sfx.play('whoosh');
    const attacker = n.id;
    setTimeout(() => {
      if (!this.brawl || !this.brawl.active) return;
      if (c.pos.distanceTo(tc.pos) > 1.7) return;
      this.applyHit(targetId!, c);
      this.brawl.registerHit(attacker);
    }, 280);
  }

  private applyHit(targetId: string, by: Character) {
    this.chaos.add('brawlHit');
    if (targetId === PLAYER_ID) {
      if (this.playerHitT > 0) return;
      this.playerHitT = PLAYER_HIT_GAP;
      this.hooks.playerBonked(by);
      return;
    }
    const t = this.npc(targetId);
    if (!t) return;
    sfx.play('bonk');
    t.c.anim.play('stagger');
    t.c.anim.hitImpulse(1.5);
    t.c.knockback(t.c.pos.clone().sub(by.pos), 1.2);
    this.w.effects.stars(t.c.model.head, 1.6);
    if (this.rng() < 0.35) t.c.say(pickLine(t.p.lines.bonked), 2);
  }

  private updateSeparator(n: NPC, dt: number) {
    const c = n.c;
    const rt = this.rt.get(n.id)!;
    rt.pathT -= dt;
    const spot = this.center.clone().add(new THREE.Vector3(0.6, 0, 0.6));
    if (c.pos.distanceTo(spot) > 0.8) {
      if (rt.pathT <= 0 || !c.isWalking) { rt.pathT = 0.8; c.walkTo(this.w.nav, spot.x, spot.z, undefined, 2); }
      return;
    }
    c.faceTowards(this.center);
    rt.swingT -= dt;
    if (rt.swingT <= 0) {
      rt.swingT = 2.2 + this.rng() * 1.5;
      c.anim.play(this.rng() < 0.5 ? 'wave' : 'point');
      if (this.rng() < 0.4) c.say(pickLine(n.p.lines.brawlBreakUp), 2.2);
    }
  }

  private updateSukru() {
    const b = this.brawl!;
    // Şükrü gerginlik eşiği aşılınca ya da kavga birkaç saniyeyi geçince fark edip koşar
    if (this.sukruState !== 'none' || b.state.elapsed < 2 || (this.chaos.tension < CALM_THRESHOLD && b.state.elapsed < SUKRU_NOTICE)) return;
    const s = this.npc('sukru');
    if (!s || s.mode === 'inGame') return;
    this.sukruState = 'coming';
    s.enterBrawl('separator');
    s.c.stopWalking();
    s.c.model.handPropL.clear();
    const tray = makeTray();
    tray.position.set(0.05, -0.02, 0.15);
    s.c.model.handPropL.add(tray);
    s.c.anim.play('carry', { loop: true });
    s.c.say('Geliyorum abi, durun!', 2);
    const spot = this.center.clone().add(new THREE.Vector3(-0.7, 0, 0.5));
    s.c.walkTo(this.w.nav, spot.x, spot.z, () => {
      if (!this.brawl || !this.brawl.active) { this.sukruState = 'done'; return; }
      s.c.faceTowards(this.center);
      s.c.anim.stop('carry');
      s.c.anim.play('wave');
      s.c.say('Beyler, sakin olun! Çaylar benden!', 3.5);
      sfx.play('glass');
      this.chaos.add('calmDown');
      this.brawl.end('calmed');
      this.sukruState = 'done';
    }, 2.8);
  }

  private finish() {
    const b = this.brawl!;
    this.brawl = null;
    this.history.push({ a: b.state.a, b: b.state.b, reason: b.state.endReason ?? 'timeout', participants: b.state.participants.map((p) => p.id) });
    const ids = new Set([...b.state.participants.map((p) => p.id), 'sukru']);
    let delay = 600;
    for (const id of ids) {
      const n = this.npc(id);
      if (!n || !n.inBrawl) continue;
      const c = n.c;
      c.model.setHeldProp(null);
      c.stopWalking();
      if (id === 'sukru') { c.model.handPropL.clear(); c.anim.stop('carry'); }
      setTimeout(() => { if (this.rng() < 0.7) c.say(pickLine(n.p.lines.calmDown), 2.6); c.anim.play('shrug'); }, delay);
      delay += 450;
      const seat = this.savedSeats.get(id);
      this.savedSeats.delete(id);
      if (seat && !seat.occupant && this.w.reservedTable === seat.table.id) {
        // masaya geri dön ve oyuna devam et
        const ap = approachPoint(seat);
        n.returnToGame();
        c.walkTo(this.w.nav, ap.x, ap.z, () => { c.sitOn(seat); sfx.play('chair'); n.backInGame(); }, 2);
      } else n.exitBrawl();
    }
    this.hooks.toast(b.state.endReason === 'calmed' ? '☕ Şükrü kavgayı yatıştırdı.' : '😮‍💨 Kavga kendiliğinden söndü.');
  }

  /** Bu NPC kavga yüzünden masasından uzakta mı? (oyun duraklatma için) */
  isAway(id: string) { return this.savedSeats.has(id) || !!this.npc(id)?.awayFromGame; }
}
