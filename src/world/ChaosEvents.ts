/**
 * Kaos olaylarının görsel/davranış katmanı (Aşama 5). Kurallar `chaos/eventRules.ts` ve kayıtlar `chaos/events.ts` saf modüllerdedir.
 * TV'de gol · elektrik kesintisi · kedi · masa devirme. Oyun kuralları ve sonuçları hiçbir olaydan etkilenmez.
 */
import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { NPC } from '../npc/NPC';
import type { TableDef } from './Kahvehane';
import { Cat } from './Cat';
import { makeTeaGlass } from '../characters/CharacterModel';
import { DURATIONS, glassTips, powerLightFactor } from '../chaos/eventRules';
import { pickLine } from '../npc/personalities';
import { sfx } from '../audio/Sfx';

interface Timed { t: number; dur: number; tick: (t: number, dt: number) => void; end: () => void }

export class ChaosEvents {
  timed: Timed[] = [];
  cat: Cat | null = null;
  powerOut = false;
  /** test/istatistik */
  log: string[] = [];
  private flipping = new Set<string>();

  constructor(private game: Game) {}

  get active() { return this.timed.length > 0 || !!this.cat; }

  private run(dur: number, tick: Timed['tick'], end: Timed['end']) { this.timed.push({ t: 0, dur, tick, end }); }

  private near(p: THREE.Vector3, r: number): NPC[] {
    return this.game.npcs.filter((n) => !n.inBrawl && n.c.pos.distanceTo(p) < r);
  }

  // ------------------------------------------------------------------ TV'de gol
  tvGoal() {
    this.log.push('tvGoal');
    const g = this.game;
    const tv = g.kahve.tv;
    const tvPos = new THREE.Vector3(0.5, 0, -6.4);
    const raceOn = g.race.phase !== 'idle';
    const prev = tv.overlay;
    if (!raceOn) tv.overlay = (c, w, h, t) => {
      c.fillStyle = Math.floor(t * 6) % 2 ? '#2f9e44' : '#ffd43b'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#d62828'; c.font = 'bold 56px sans-serif'; c.textAlign = 'center'; c.fillText('GOOOL!', w / 2, h / 2 + 18); c.textAlign = 'left';
    };
    sfx.play('win');
    for (const n of this.near(tvPos, 7)) {
      if (n.mode === 'sleep') continue;
      setTimeout(() => {
        n.c.anim.play(n.mode === 'inGame' ? 'cheer' : (this.game.rng() < 0.5 ? 'cheer' : 'bellyDance'));
        n.c.say(pickLine(['GOOOL!', 'Attık! Attııık!', 'Ofsayt mı? Değil! GOL!', ...n.p.lines.tv]), 2.5);
        sfx.play('surprise', n.c.spec.voicePitch);
      }, this.game.rng() * 600);
    }
    // yakın masalarda bardaklar titrer, bazıları devrilir
    for (const t of g.kahve.tables) {
      const d = t.center.distanceTo(tvPos);
      if (d > 6) continue;
      const tip = glassTips(d, g.rng());
      const props = t.props;
      this.run(DURATIONS.tvGoal, (tt) => {
        const k = 1 - tt / DURATIONS.tvGoal;
        props.position.set(Math.sin(tt * 47) * 0.006 * k, Math.abs(Math.sin(tt * 31)) * 0.008 * k, Math.cos(tt * 53) * 0.006 * k);
      }, () => props.position.set(0, 0, 0));
      if (tip) setTimeout(() => { this.tipGlass(t, DURATIONS.tvGoal + 6); sfx.play('glassBreak'); g.chaos.add('glassBreak'); }, 900);
    }
    this.run(DURATIONS.tvGoal, () => {}, () => { if (!raceOn) tv.overlay = prev; });
  }

  // ------------------------------------------------------------------ elektrik kesintisi
  powerCut() {
    if (this.powerOut) return;
    this.log.push('powerCut');
    this.powerOut = true;
    const g = this.game;
    const tv = g.kahve.tv;
    const prev = tv.overlay;
    tv.overlay = (c, w, h) => { c.fillStyle = '#050505'; c.fillRect(0, 0, w, h); };
    sfx.play('tvChannel');
    const speakers = [...g.npcs].sort(() => g.rng() - 0.5).slice(0, 3);
    speakers.forEach((n, i) => setTimeout(() => { if (!n.inBrawl) { n.c.say(pickLine(n.p.lines.powerCut), 2.8); n.c.anim.play('surprise'); } }, 500 + i * 900));
    g.hud.toast('💡 Elektrik kesildi! Şükrü feneri yaktı.');
    this.run(DURATIONS.powerCut, (t) => g.kahve.setPower(powerLightFactor(t, DURATIONS.powerCut)), () => {
      g.kahve.setPower(1);
      if (tv.overlay !== null && g.race.phase === 'idle') tv.overlay = prev;
      else if (g.race.phase !== 'idle') tv.overlay = null; // yarış sürüyorsa HorseRaceTV yeniden çizer
      this.powerOut = false;
      g.hud.toast('💡 Elektrik geldi!');
      const n = g.npcs.find((x) => x.id === 'nihat');
      n?.c.say('Ooo, aydınlık! Kim ne yaptı karanlıkta?', 2.5);
    });
  }

  // ------------------------------------------------------------------ kedi
  catVisit() {
    if (this.cat) return;
    this.log.push('cat');
    const g = this.game;
    const tables = g.kahve.tables.filter((t) => t.id !== g.world.reservedTable);
    const table = tables[Math.floor(g.rng() * tables.length)];
    const cat = new Cat(g.nav, g.kahve.doorPos.clone(), table.center.clone());
    this.cat = cat;
    g.scene.add(cat.root);
    g.hud.toast('🐈 Kahvehaneye bir kedi girdi!');
    sfx.play('pop');
    cat.onArriveTable = () => {
      // çayı deviriyor
      this.tipGlass(table, DURATIONS.catVisit);
      sfx.play('glassBreak');
      g.effects.teaSplash(table.center.clone().setY(0.85));
      g.chaos.add('cat');
      for (const n of this.near(table.center, 5)) {
        setTimeout(() => {
          n.c.faceTowards(table.center);
          n.c.say(pickLine(n.p.lines.catReact), 2.8);
          n.c.anim.play(n.p.temper > 0.6 ? 'angry' : n.p.temper < 0.35 ? 'laugh' : 'surprise');
          // masadakiler kalkıp kaçabilir
          if (n.c.seat?.table === table && n.mode === 'seated' && g.rng() < 0.5) n.leaveSeat();
        }, g.rng() * 900);
      }
    };
    cat.onGone = () => { g.scene.remove(cat.root); this.cat = null; };
  }

  // ------------------------------------------------------------------ masa devirme
  /** Görsel/sosyal: oyunun sonucu ve puanlar geçerli kalır */
  tableFlip(table: TableDef, by: NPC) {
    if (this.flipping.has(table.id)) return;
    this.log.push('tableFlip');
    this.flipping.add(table.id);
    const g = this.game;
    const grp = table.group;
    const dir = new THREE.Vector3().subVectors(table.center, by.c.pos).setY(0).normalize();
    const axis = new THREE.Vector3(dir.z, 0, -dir.x);
    const q0 = grp.quaternion.clone();
    const p0 = grp.position.clone();
    by.c.say(pickLine(['Bu oyun bitti! Masa da bitti!', 'Yeter! Hileli bu taşlar!', 'Taş da masa da havaya!']), 3);
    by.c.anim.play('slamTable');
    g.chaos.trigger('tableFlip');
    setTimeout(() => { sfx.play('tableSlam'); sfx.play('glassBreak'); for (let i = 0; i < 4; i++) setTimeout(() => sfx.play('tile'), 120 * i); g.effects.puff(table.center.clone().setY(0.5), 0xffe0b0, 14, 0.18); }, 350);
    for (const n of this.near(table.center, 6)) if (n !== by) setTimeout(() => { n.c.anim.play('surprise'); sfx.play('surprise', n.c.spec.voicePitch); }, 500 + g.rng() * 400);
    this.run(DURATIONS.tableFlipReset, (t) => {
      const up = t < 0.5 ? t / 0.5 : 1;
      const back = t > DURATIONS.tableFlipReset - 1 ? (t - (DURATIONS.tableFlipReset - 1)) : 0;
      const ang = 1.35 * up * (1 - back);
      grp.quaternion.copy(q0).premultiply(new THREE.Quaternion().setFromAxisAngle(axis, ang));
      grp.position.copy(p0).addScaledVector(dir, 0.35 * up * (1 - back));
      grp.position.y = p0.y + Math.sin(Math.min(1, t / 0.5) * Math.PI) * 0.4 * (1 - back);
    }, () => { grp.quaternion.copy(q0); grp.position.copy(p0); this.flipping.delete(table.id); });
  }

  /** Masaya devrik bir çay bardağı + dökülen çay koy (bir süre sonra kaldır) */
  private tipGlass(table: TableDef, seconds: number) {
    const glass = makeTeaGlass(true);
    glass.rotation.z = Math.PI / 2;
    glass.position.set((this.game.rng() - 0.5) * 0.4, 0.82, (this.game.rng() - 0.5) * 0.4);
    const spill = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), new THREE.MeshBasicMaterial({ color: 0x8a2e06, transparent: true, opacity: 0.8 }));
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(glass.position.x + 0.06, 0.789, glass.position.z);
    table.group.add(glass, spill);
    this.game.effects.teaSplash(table.center.clone().add(glass.position).setY(0.9));
    setTimeout(() => table.group.remove(glass, spill), seconds * 1000);
  }

  update(dt: number) {
    for (const t of this.timed) { t.t += dt; t.tick(Math.min(t.t, t.dur), dt); }
    const done = this.timed.filter((t) => t.t >= t.dur);
    for (const d of done) d.end();
    this.timed = this.timed.filter((t) => t.t < t.dur);
    this.cat?.update(dt);
  }
}
