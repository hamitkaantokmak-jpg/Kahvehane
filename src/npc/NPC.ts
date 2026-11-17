/**
 * NPC davranış sistemi: kişiliğe göre ağırlıklı etkinlik seçimi + kesintiye uğratılabilir tepkiler.
 * Aynı etkinliği art arda seçmeyi cezalandırarak tekrar hissini azaltır.
 */
import * as THREE from 'three';
import { Character } from '../characters/Character';
import { ActionName } from '../characters/Animator';
import { makeIstaka, makeTray, makeTeaGlass } from '../characters/CharacterModel';
import { Personality, ActivityKind, pickLine, ARGUMENTS } from './personalities';
import type { Kahvehane, Seat } from '../world/Kahvehane';
import type { NavGrid } from '../world/Collision';
import type { Effects } from '../fx/Effects';
import { sfx } from '../audio/Sfx';
import type { TensionSource } from '../chaos/events';

export interface NpcWorld {
  kahve: Kahvehane;
  nav: NavGrid;
  effects: Effects;
  player: Character;
  npcs: NPC[];
  /** Çaycıdan çay isteyenler (öncelikli) */
  teaRequests: Character[];
  /** Oyuncunun oyun masası (NPC'ler oraya kendiliğinden oturmasın) */
  reservedTable: string | null;
}

type Mode = 'idle' | 'walking' | 'seated' | 'tv' | 'chat' | 'sleep' | 'bench' | 'react' | 'retaliate' | 'inGame' | 'serve' | 'wander' | 'brawl' | 'returning';

export class NPC {
  readonly c: Character;
  readonly p: Personality;
  mode: Mode = 'idle';
  private timer = 1 + Math.random() * 2;
  private gestureT = 3;
  private lastActivity: ActivityKind | null = null;
  private resumeAfterReact: Mode = 'idle';
  bonkCount = 0;
  private bonkDecay = 0;
  private chatPartner: NPC | null = null;
  private chatLines: string[] = [];
  private serveStage = 0;
  private serveTarget: Character | null = null;
  private wrongOrder = false;
  hasTea = false;
  private teaObj: THREE.Object3D | null = null;
  private greeted = false;
  private zzzT = 0;
  /** 0..1 öfke: ıstaka yedikçe artar, zamanla söner. Eşiği aşınca kavga başlatır. */
  anger = 0;
  /** Kavgada mı (BrawlController yönetir) */
  inBrawl = false;
  brawlRole: 'fighter' | 'helper' | 'separator' | 'fleer' | null = null;
  /** Oyun masasından kavga yüzünden kalktı mı (oyun duraklatma için) */
  awayFromGame = false;

  constructor(c: Character, p: Personality, private w: NpcWorld) {
    this.c = c;
    this.p = p;
  }

  get id() { return this.c.id; }

  // ------------------------------------------------------------ etkinlik seçimi
  private chooseActivity(): ActivityKind {
    const entries = Object.entries(this.p.activities) as [ActivityKind, number][];
    const weights = entries.map(([k, v]) => (k === this.lastActivity ? v * 0.35 : v));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < entries.length; i++) { r -= weights[i]; if (r <= 0) return entries[i][0]; }
    return entries[0][0];
  }

  private freeSeats(kinds?: string[]): Seat[] {
    return this.w.kahve.allSeats().filter((s) => !s.occupant && s.table.id !== this.w.reservedTable && (!kinds || kinds.includes(s.table.kind)));
  }

  private startActivity(a: ActivityKind) {
    this.lastActivity = a;
    const c = this.c;
    const nav = this.w.nav;
    if (a === 'serve') { this.startServe(); return; }
    if (a === 'sitTable' || a === 'sleep') {
      let seats = this.freeSeats(this.p.favoriteTables.length ? this.p.favoriteTables : undefined);
      if (!seats.length) seats = this.freeSeats();
      if (!seats.length) { this.startActivity('wander'); return; }
      // biri oturan masaları tercih et (sosyal)
      seats.sort((x, y) => occupiedCount(y) - occupiedCount(x) + (Math.random() - 0.5) * 1.5);
      const seat = seats[0];
      seat.occupant = `reserved:${this.id}`;
      const ap = approachPoint(seat);
      this.mode = 'walking';
      c.walkTo(nav, ap.x, ap.z, () => {
        if (seat.occupant !== `reserved:${this.id}`) { this.mode = 'idle'; this.timer = 0.5; return; }
        c.sitOn(seat);
        sfx.play('chair');
        if (a === 'sleep') { c.anim.posture = 'sleepSit'; this.mode = 'sleep'; this.timer = 25 + Math.random() * 25; }
        else { this.mode = 'seated'; this.timer = 18 + Math.random() * 22; }
      });
      return;
    }
    if (a === 'bench') {
      const b = this.w.kahve.benchSeats.find((x) => !x.occupant);
      if (!b) { this.startActivity('wander'); return; }
      b.occupant = `reserved:${this.id}`;
      this.mode = 'walking';
      c.walkTo(nav, b.pos.x, b.pos.z - 0.5, () => {
        c.sitOnBench(b);
        this.mode = 'bench';
        this.timer = 15 + Math.random() * 15;
        if (this.id === 'hasan') c.anim.posture = 'sleepSit';
      });
      return;
    }
    if (a === 'watchTv') {
      const spot = this.w.kahve.tvViewPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, Math.random() * 0.8));
      this.mode = 'walking';
      c.walkTo(nav, spot.x, spot.z, () => {
        this.mode = 'tv';
        this.timer = 12 + Math.random() * 14;
        c.targetYaw = Math.PI; // -z yönüne (TV)
      });
      return;
    }
    if (a === 'chat') {
      const others = this.w.npcs.filter((n) => n !== this && (n.mode === 'seated' || n.mode === 'tv' || n.mode === 'idle' || n.mode === 'bench') && n.id !== 'sukru');
      if (!others.length) { this.startActivity('wander'); return; }
      const partner = others[Math.floor(Math.random() * others.length)];
      const arg = ARGUMENTS.find((x) => x[0] === this.id && x[1] === partner.id) ?? ARGUMENTS.find((x) => x[1] === this.id && x[0] === partner.id);
      const target = partner.c.pos.clone();
      const dir = this.c.pos.clone().sub(target).setY(0).normalize().multiplyScalar(1.0);
      this.mode = 'walking';
      c.walkTo(nav, target.x + dir.x, target.z + dir.z, () => {
        this.mode = 'chat';
        this.chatPartner = partner;
        this.timer = 7;
        this.chatLines = arg ? (arg[0] === this.id ? [arg[2], arg[3]] : [arg[3], arg[2]]) : [pickLine(this.p.lines.idle), pickLine(partner.p.lines.idle)];
        c.faceTowards(partner.c.pos);
        c.say(this.chatLines[0], 3);
        c.anim.play(arg ? 'point' : 'talk');
        setTimeout(() => {
          if (partner.mode === 'inGame' || partner.mode === 'react') return;
          partner.c.faceTowards(c.pos);
          partner.c.say(this.chatLines[1], 3);
          partner.c.anim.play(arg ? 'angry' : 'talk');
          sfx.play(arg ? 'angry' : 'grunt', partner.c.spec.voicePitch);
          if (arg) setTimeout(() => { this.c.anim.play('laugh'); sfx.play('laugh', this.c.spec.voicePitch); }, 2200);
        }, 2600);
      });
      return;
    }
    // wander
    for (let i = 0; i < 10; i++) {
      const x = -7 + Math.random() * 14, z = -5.5 + Math.random() * 11;
      if (!this.w.kahve.collision.blocked(x, z, 0.4)) {
        this.mode = 'walking';
        c.walkTo(nav, x, z, () => { this.mode = 'wander'; this.timer = 2 + Math.random() * 3; c.anim.play(Math.random() < 0.5 ? 'shrug' : 'think'); }, 1.0 + Math.random() * 0.4);
        return;
      }
    }
    this.mode = 'idle';
    this.timer = 2;
  }

  // ------------------------------------------------------------ çaycı
  private startServe() {
    const c = this.c;
    this.mode = 'serve';
    this.serveStage = 0;
    c.walkTo(this.w.nav, this.w.kahve.counterServePos.x, this.w.kahve.counterServePos.z, () => {
      this.serveStage = 1;
      this.timer = 2.2;
      c.targetYaw = -Math.PI / 2;
      c.anim.play('pour');
      sfx.play('pour');
      if (Math.random() < 0.4) c.say(pickLine(this.p.lines.idle), 2.5);
    });
  }

  private pickServeTarget(): Character | null {
    if (this.w.teaRequests.length) return this.w.teaRequests.shift()!;
    const seated = this.w.npcs.filter((n) => n !== this && (n.mode === 'seated' || n.mode === 'tv' || n.mode === 'inGame' || n.mode === 'bench') && !n.hasTea);
    if (!seated.length) return null;
    return seated[Math.floor(Math.random() * seated.length)].c;
  }

  private updateServe(dt: number) {
    const c = this.c;
    if (this.serveStage === 1) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.serveTarget = this.pickServeTarget();
        if (!this.serveTarget) { this.serveStage = 0; this.mode = 'idle'; this.timer = 3; return; }
        // bazen siparişi karıştırır
        this.wrongOrder = Math.random() < 0.2 && this.w.teaRequests.length === 0;
        if (this.wrongOrder) {
          const alts = this.w.npcs.filter((n) => n !== this && n.c !== this.serveTarget && n.mode !== 'walking').map((n) => n.c);
          if (alts.length) this.serveTarget = alts[Math.floor(Math.random() * alts.length)];
        }
        const tray = makeTray();
        tray.position.set(0.05, -0.02, 0.15);
        c.model.handPropL.add(tray);
        c.anim.play('carry', { loop: true });
        this.serveStage = 2;
        this.goToServeTarget();
      }
    } else if (this.serveStage === 2) {
      // hedef hareket ettiyse yolu güncelle
      this.timer -= dt;
      if (this.timer <= 0 && this.serveTarget) { this.goToServeTarget(); }
    } else if (this.serveStage === 3) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.serveStage = 4;
        c.walkTo(this.w.nav, this.w.kahve.counterServePos.x + 0.3, this.w.kahve.counterServePos.z + (Math.random() - 0.5), () => {
          this.serveStage = 0; this.mode = 'idle'; this.timer = 2 + Math.random() * 4;
        }, 1.6);
      }
    }
  }

  private goToServeTarget() {
    const t = this.serveTarget!;
    const c = this.c;
    const dir = c.pos.clone().sub(t.pos).setY(0);
    if (dir.lengthSq() < 0.01) dir.set(1, 0, 0);
    dir.normalize().multiplyScalar(0.85);
    this.timer = 2.5;
    c.walkTo(this.w.nav, t.pos.x + dir.x, t.pos.z + dir.z, () => {
      if (this.serveStage !== 2) return;
      this.serveStage = 3;
      this.timer = 2.2;
      c.faceTowards(t.pos);
      c.anim.stop('carry');
      c.model.handPropL.clear();
      if (this.id === 'sukru' && c.model.spec.accessories.includes('beads')) { /* yok */ }
      c.anim.play('wave');
      sfx.play('glass');
      const npc = this.w.npcs.find((n) => n.c === t);
      if (this.wrongOrder && npc) {
        c.say('Buyur abi, açık çay! ...Sen demli mi demiştin?', 3);
        npc.c.say('Ben çay istemedim ki!', 2.5);
        npc.c.anim.play('shrug');
      } else {
        c.say(pickLine(this.p.lines.tea), 2.5);
        if (npc) npc.receiveTea();
        else if (t === this.w.player) this.w.onPlayerTea?.();
      }
    }, 1.5);
  }

  receiveTea() {
    this.hasTea = true;
    if (!this.teaObj) {
      this.teaObj = makeTeaGlass(false);
      this.teaObj.position.set(0, -0.02, 0.06);
      this.c.model.handPropR.add(this.teaObj);
    }
    setTimeout(() => {
      this.c.anim.play('drink');
      sfx.play('glass');
      setTimeout(() => this.c.say(pickLine(this.p.lines.tea), 2.5), 1500);
      setTimeout(() => { this.hasTea = false; if (this.teaObj) { this.c.model.handPropR.remove(this.teaObj); this.teaObj = null; } }, 9000);
    }, 800);
  }

  // ------------------------------------------------------------ tepkiler
  /** Istakayla vurulduğunda */
  onBonked(from: Character) {
    this.anger = Math.min(1, this.anger + 0.35 + this.p.temper * 0.3);
    this.w.onTension?.('bonk');
    if (this.inBrawl) {
      // kavgadayken: yalnızca görsel tepki, kavga sürer
      this.bonkCount++;
      this.c.anim.play('stagger');
      this.c.anim.hitImpulse(1.5);
      this.w.effects.stars(this.c.model.head, 2);
      this.c.say(pickLine(this.p.lines.bonkedAgain), 2.2);
      return;
    }
    if (this.mode === 'inGame') {
      // oyundayken: oturduğu yerden tepki
      this.c.anim.play('stagger');
      this.c.anim.hitImpulse(1.4);
      this.w.effects.stars(this.c.model.head, 2.2);
      this.c.say(pickLine(this.p.lines.bonked), 2.5);
      return;
    }
    this.bonkCount++;
    this.bonkDecay = 25;
    const c = this.c;
    c.stopWalking();
    this.releaseReservations();
    if (this.serveStage === 2 || this.serveStage === 1) {
      this.requeueOrder();
      c.model.handPropL.clear();
      c.anim.stop('carry');
      this.serveStage = 0;
      this.w.effects.puff(c.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xd8eef7, 8, 0.08);
      sfx.play('glass');
    }
    const wasSeated = c.seated;
    const strong = !wasSeated && (Math.random() < 0.45 || this.bonkCount >= 3);
    c.anim.hitImpulse(strong ? 2 : 1.3);
    if (!wasSeated) c.knockback(c.pos.clone().sub(from.pos), strong ? 2.2 : 1.4);
    c.anim.play(strong ? 'fall' : 'stagger');
    this.w.effects.stars(c.model.head, strong ? 3.2 : 2.2);
    sfx.play(this.p.temper > 0.6 ? 'angry' : 'surprise', c.spec.voicePitch);
    const lines = this.bonkCount >= 2 ? this.p.lines.bonkedAgain : this.p.lines.bonked;
    setTimeout(() => c.say(pickLine(lines), 3), 350);
    if (c.anim.posture === 'sleepSit') c.anim.posture = 'sit';
    this.resumeAfterReact = wasSeated ? (this.mode === 'sleep' ? 'seated' : this.mode) : 'idle';
    this.mode = 'react';
    this.timer = strong ? 3.4 : 2.0;
    // sinirli karakterler karşılık verir
    const retaliate = this.p.temper >= 0.6 && this.bonkCount >= 2 && (this.p.temper >= 0.85 || Math.random() < 0.75);
    this.retaliatePending = retaliate;
    // öfke eşiği aşıldıysa oyuncuyla kavga başlar; yandakiler taraf tutar
    if (this.anger >= ANGER_BRAWL && this.w.requestBrawl?.(this.id, 'player')) this.retaliatePending = false;
  }

  /** Servis yarıda kesilirse taşınan sipariş kaybolmasın: kuyruğun başına geri konur */
  private requeueOrder() {
    if (this.serveTarget && this.serveStage >= 1 && this.serveStage <= 2 && !this.wrongOrder) {
      const t = this.serveTarget;
      if (t === this.w.player && !this.w.teaRequests.includes(t)) this.w.teaRequests.unshift(t);
    }
    this.serveTarget = null;
  }

  enterBrawl(role: 'fighter' | 'helper' | 'separator' | 'fleer') {
    this.requeueOrder();
    if (this.mode === 'inGame') this.awayFromGame = true;
    this.inBrawl = true;
    this.brawlRole = role;
    this.mode = 'brawl';
    this.retaliatePending = false;
  }

  exitBrawl() {
    this.inBrawl = false;
    this.brawlRole = null;
    this.awayFromGame = false;
    this.anger *= 0.3;
    if (this.mode === 'brawl' || this.mode === 'returning') { this.mode = 'idle'; this.timer = 2 + Math.random() * 2; }
  }

  /** Kavgadan masaya geri dönüş yolunda */
  returnToGame() {
    this.inBrawl = false;
    this.brawlRole = null;
    this.anger *= 0.3;
    this.mode = 'returning';
  }

  backInGame() {
    this.awayFromGame = false;
    this.mode = 'inGame';
    this.c.anim.posture = 'sit';
  }
  private retaliatePending = false;

  /** Oyuncu laf attığında */
  onLaf() {
    if (this.mode === 'inGame' || this.mode === 'react') return;
    const c = this.c;
    c.faceTowards(this.w.player.pos);
    c.say(pickLine(this.p.lines.laf), 3);
    const g: ActionName = this.p.temper > 0.6 ? 'angry' : this.p.temper < 0.4 ? 'laugh' : 'point';
    c.anim.play(g);
    sfx.play(g === 'laugh' ? 'laugh' : 'grunt', c.spec.voicePitch);
  }

  /** Oyuncunun yakınında komik bir hareket yapıldığında */
  onEmoteNearby(kind: 'bellyDance' | 'laugh' | 'clap' | 'slamTable' | 'wave') {
    if (this.mode === 'react' || this.mode === 'retaliate') return;
    const c = this.c;
    if (!c.seated && this.mode !== 'serve') c.faceTowards(this.w.player.pos);
    c.anim.lookAt = this.w.player.headWorld();
    if (kind === 'bellyDance') { c.anim.play(Math.random() < 0.5 ? 'clap' : 'laugh'); if (Math.random() < 0.5) c.say(pickLine(['Oynaa!', 'Hahaha, göbeğe bak!', 'Düğün mü var?', 'Bravo!']), 2); sfx.play('laugh', c.spec.voicePitch); }
    else if (kind === 'laugh') { if (Math.random() < 0.6) { c.anim.play('laugh'); sfx.play('laugh', c.spec.voicePitch); } }
    else if (kind === 'clap') { c.anim.play('cheer'); }
    else if (kind === 'slamTable') { c.anim.play('surprise'); if (this.mode === 'sleep') { c.anim.posture = 'sit'; this.mode = 'seated'; c.say('Ha?! Ne oldu?!', 2); } }
    else if (kind === 'wave') { c.anim.play('wave'); c.say(pickLine(this.p.lines.greet), 2.5); }
  }

  // ------------------------------------------------------------ güncelleme
  update(dt: number) {
    const c = this.c;
    this.anger = Math.max(0, this.anger - dt * 0.03);
    if (this.bonkDecay > 0) { this.bonkDecay -= dt; if (this.bonkDecay <= 0) this.bonkCount = 0; }
    // oyuncuya bakma ve selamlama
    const pd = c.pos.distanceTo(this.w.player.pos);
    if (pd < 2.2 && this.mode !== 'sleep' && this.mode !== 'react') {
      c.anim.lookAt = this.w.player.headWorld();
      if (!this.greeted && this.mode !== 'inGame' && this.mode !== 'walking') {
        this.greeted = true;
        c.say(pickLine(this.p.lines.greet), 3);
        c.anim.play('wave');
      }
    } else if (this.mode !== 'chat' && this.mode !== 'serve') c.anim.lookAt = null;

    switch (this.mode) {
      case 'idle':
        this.timer -= dt;
        if (this.timer <= 0) this.startActivity(this.chooseActivity());
        break;
      case 'walking':
        if (!c.isWalking) { this.mode = 'idle'; this.timer = 0.5; }
        break;
      case 'serve':
        this.updateServe(dt);
        if (this.serveStage === 0 && !c.isWalking && this.timer <= 0) { this.mode = 'idle'; this.timer = 1; }
        break;
      case 'seated': {
        this.timer -= dt;
        this.gestureT -= dt;
        if (this.gestureT <= 0) {
          this.gestureT = 4 + Math.random() * 6;
          const roll = Math.random();
          if (roll < 0.3) c.anim.play(this.p.signature[Math.floor(Math.random() * this.p.signature.length)]);
          else if (roll < 0.5) { c.anim.play('think'); }
          else if (roll < 0.62) { c.say(pickLine(this.p.lines.idle), 3); c.anim.play('talk'); }
          else if (roll < 0.7) { c.anim.play('slamTable'); sfx.play('tableSlam'); }
          else if (roll < 0.78) { c.anim.play('laugh'); sfx.play('laugh', c.spec.voicePitch); }
          // masaya eğilme
          if (Math.random() < 0.3) c.anim.play('leanBack');
        }
        if (this.timer <= 0) this.leaveSeat();
        break;
      }
      case 'sleep':
        this.timer -= dt;
        this.zzzT -= dt;
        if (this.zzzT <= 0) {
          this.zzzT = 2.2;
          this.w.effects.symbol(c.headWorld().add(new THREE.Vector3(0.2, 0.35, 0)), 'Z', '#5c7cfa', 2, 0.3);
          if (Math.random() < 0.3) sfx.play('snore');
        }
        if (this.timer <= 0) { c.anim.posture = 'sit'; this.leaveSeat(); }
        break;
      case 'bench':
        this.timer -= dt;
        if (c.anim.posture === 'sleepSit') {
          this.zzzT -= dt;
          if (this.zzzT <= 0) { this.zzzT = 2.4; this.w.effects.symbol(c.headWorld().add(new THREE.Vector3(0.2, 0.35, 0)), 'Z', '#5c7cfa', 2, 0.3); }
        }
        if (this.timer <= 0) { c.standUp(); this.mode = 'idle'; this.timer = 1; }
        break;
      case 'tv':
        this.timer -= dt;
        this.gestureT -= dt;
        c.anim.lookAt = new THREE.Vector3(0.5, 2.5, -6.5);
        if (this.gestureT <= 0) {
          this.gestureT = 3 + Math.random() * 4;
          const g: ActionName = (['angry', 'cheer', 'point', 'facepalm'] as ActionName[])[Math.floor(Math.random() * 4)];
          c.anim.play(g);
          if (Math.random() < 0.6) { c.say(pickLine(this.p.lines.tv), 2.5); sfx.play(g === 'cheer' ? 'surprise' : 'angry', c.spec.voicePitch); }
        }
        if (this.timer <= 0) { c.anim.lookAt = null; this.mode = 'idle'; this.timer = 1; }
        break;
      case 'chat':
        this.timer -= dt;
        if (this.chatPartner) c.anim.lookAt = this.chatPartner.c.headWorld();
        if (this.timer <= 0) { this.chatPartner = null; c.anim.lookAt = null; this.mode = 'idle'; this.timer = 1 + Math.random() * 2; }
        break;
      case 'wander':
        this.timer -= dt;
        if (this.timer <= 0) { this.mode = 'idle'; this.timer = 0.5; }
        break;
      case 'react':
        this.timer -= dt;
        if (this.timer <= 0) {
          if (this.retaliatePending && !c.seated) {
            this.retaliatePending = false;
            this.startRetaliate();
          } else if (this.retaliatePending && c.seated) {
            this.retaliatePending = false;
            c.anim.play('angry');
            c.say(pickLine(this.p.lines.bonkedAgain), 2.5);
            this.mode = this.resumeAfterReact;
            this.timer = 10;
          } else {
            this.mode = this.resumeAfterReact === 'react' ? 'idle' : this.resumeAfterReact;
            if (this.mode === 'walking' || this.mode === 'serve') { this.mode = 'idle'; }
            this.timer = Math.max(this.timer, 5);
          }
        }
        break;
      case 'retaliate':
        break;
      case 'brawl':
      case 'returning':
        break;
      case 'inGame':
        break;
    }
  }

  private startRetaliate() {
    const c = this.c;
    this.mode = 'retaliate';
    c.say(pickLine(this.p.lines.retaliate), 2.5);
    const ist = makeIstaka();
    c.model.setHeldProp(ist);
    const target = this.w.player;
    c.walkTo(this.w.nav, target.pos.x, target.pos.z, undefined, 2.4);
    let t = 0;
    const tick = () => {
      if (this.mode !== 'retaliate') { c.model.setHeldProp(null); return; }
      t += 0.1;
      const d = c.pos.distanceTo(target.pos);
      if (d < 1.1 || t > 6) {
        c.stopWalking();
        c.faceTowards(target.pos);
        c.anim.play('swing');
        sfx.play('whoosh');
        setTimeout(() => {
          if (c.pos.distanceTo(target.pos) < 1.6) this.w.onPlayerBonked?.(c);
          setTimeout(() => {
            c.model.setHeldProp(null);
            c.anim.play('laugh');
            sfx.play('laugh', c.spec.voicePitch);
            c.say('Ödeştik!', 2);
            this.bonkCount = 0;
            this.mode = 'idle';
            this.timer = 3;
          }, 600);
        }, 300);
        return;
      }
      if (!c.isWalking) c.walkTo(this.w.nav, target.pos.x, target.pos.z, undefined, 2.4);
      setTimeout(tick, 100);
    };
    setTimeout(tick, 100);
  }

  releaseReservations() {
    for (const s of this.w.kahve.allSeats()) if (s.occupant === `reserved:${this.id}`) s.occupant = null;
    for (const b of this.w.kahve.benchSeats) if (b.occupant === `reserved:${this.id}`) b.occupant = null;
  }

  leaveSeat() {
    this.c.standUp();
    sfx.play('chair');
    this.mode = 'idle';
    this.timer = 0.5 + Math.random();
  }

  /** Oyun oturumu için masaya ışınla. */
  teleportToSeat(seat: Seat) {
    const c = this.c;
    c.stopWalking();
    this.releaseReservations();
    if (c.seated) c.standUp();
    // eldeki tepsi vb. temizle
    this.requeueOrder();
    c.model.handPropL.clear();
    c.model.setHeldProp(null);
    c.anim.stop('carry');
    this.serveStage = 0;
    this.w.effects.puff(c.pos.clone(), 0xffffff, 10, 0.25);
    c.sitOn(seat);
    this.w.effects.puff(c.pos.clone(), 0xffe066, 12, 0.25);
    this.mode = 'inGame';
    c.anim.posture = 'sit';
  }

  releaseFromGame() {
    if (this.mode !== 'inGame') return;
    this.leaveSeat();
  }
}

export interface NpcWorldHooks {
  onPlayerTea?: () => void;
  onPlayerBonked?: (by: Character) => void;
  /** Gerginlik kaynağı bildir (Kaos Direktörü) */
  onTension?: (source: TensionSource) => void;
  /** Kavga başlatma isteği; başladıysa true */
  requestBrawl?: (a: string, b: string) => boolean;
}

/** Bu öfkenin üstünde ıstaka yiyen NPC kavga başlatır (Rıza ilk şaplakta, sakinler 2-3. şaplakta) */
export const ANGER_BRAWL = 0.6;
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface NpcWorld extends NpcWorldHooks {}

function occupiedCount(seat: Seat) {
  return seat.table.seats.filter((s) => s.occupant && !s.occupant.startsWith('reserved')).length;
}

export function approachPoint(seat: Seat) {
  return { x: seat.pos.x - Math.sin(seat.yaw) * 0.5, z: seat.pos.z - Math.cos(seat.yaw) * 0.5 };
}
