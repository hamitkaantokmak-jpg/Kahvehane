/**
 * Ana oyun sınıfı: render döngüsü, mod yönetimi (serbest dolaşma / masada), sistemlerin entegrasyonu.
 */
import * as THREE from 'three';
import { Input } from './Input';
import { CameraRig } from '../player/CameraRig';
import { Kahvehane, Seat, Interactable } from '../world/Kahvehane';
import { NavGrid } from '../world/Collision';
import { applyOutlineVisibility } from '../world/materials';
import { Character } from '../characters/Character';
import { PLAYER_SPEC, NPC_SPECS } from '../characters/CharacterSpec';
import { NPC, NpcWorld } from '../npc/NPC';
import { PERSONALITIES, pickLine, SUKRU_LINES } from '../npc/personalities';
import { Effects } from '../fx/Effects';
import { Bubbles } from '../ui/Bubbles';
import { Hud } from '../ui/Hud';
import { Social, EMOTES } from '../interactions/Social';
import { sfx } from '../audio/Sfx';
import { loadSettings, saveSettings, Settings, loadStats, saveStats, Stats } from '../save/Settings';
import { TableSession } from '../tables/TableSession';
import { DartSession } from '../tables/DartSession';
import { HorseRaceTV } from '../world/HorseRaceTV';
import { ChaosEvents } from '../world/ChaosEvents';
import { VoicePlayer } from '../audio/Voice';
import { OcclusionFader } from '../player/OcclusionFader';
import { ChaosDirector } from '../chaos/ChaosDirector';
import { BrawlController } from '../npc/BrawlController';
import { createRng, Rng } from '../games/common/rng';
import { EconomyController } from '../economy/EconomyController';
import { LocalEconomyStore } from '../economy/store';
import { WORK_PAY, dayNumber } from '../economy/Economy';
import { stainIntensity, isStained } from '../interactions/teaThrow';

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly rig: CameraRig;
  readonly input: Input;
  readonly kahve = new Kahvehane();
  readonly nav: NavGrid;
  readonly effects: Effects;
  readonly bubbles: Bubbles;
  readonly hud: Hud;
  readonly player: Character;
  readonly npcs: NPC[] = [];
  readonly social: Social;
  readonly world: NpcWorld;
  readonly overlay: HTMLDivElement;
  settings: Settings;
  stats: Stats;
  mode: 'explore' | 'seated' = 'explore';
  /** Oyun katmanı rastgeleliği (saf modüllere enjekte edilir) */
  rng: Rng = createRng((performance.now() * 1000) >>> 0);
  chaos!: ChaosDirector;
  brawls!: BrawlController;
  private overflowCooldown = 0;
  economy!: EconomyController;
  race!: HorseRaceTV;
  chaosEvents!: ChaosEvents;
  voice!: VoicePlayer;
  private teaseT = 20;
  private raiseT = 90;
  session: TableSession | DartSession | null = null;
  /** Oyun saati (sn) */
  clockTime = 0;
  private clock = new THREE.Clock();
  private frustum = new THREE.Frustum();
  private projScreen = new THREE.Matrix4();
  private sphere = new THREE.Sphere(new THREE.Vector3(), 1.3);
  /** ölçüm: atlanan animasyon güncellemesi sayısı */
  animSkipped = 0;
  fader!: OcclusionFader;
  private focus: Interactable | null = null;
  private stepT = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  fps = 0;
  /** Oyun zamanı çarpanı (test için ?gspeed=3) */
  timeScale = (() => { try { const v = Number(new URLSearchParams(location.search).get('gspeed')); return v > 0 ? v : 1; } catch { return 1; } })();
  /** test/hata ayıklama için */
  frame = 0;

  constructor(private container: HTMLElement) {
    this.settings = loadSettings();
    this.stats = loadStats();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay';
    container.appendChild(this.overlay);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 60);
    this.scene.background = new THREE.Color(0x2a1a10);
    this.scene.fog = new THREE.Fog(0x3a2414, 18, 34);
    this.scene.add(this.kahve.group);
    this.nav = new NavGrid(this.kahve.collision, 0.25, 0.32);
    this.rig = new CameraRig(this.camera);
    const walls: THREE.Object3D[] = [];
    this.kahve.group.traverse((o) => { if (o.userData.wall) walls.push(o); });
    this.rig.occluders = walls;
    this.input = new Input(this.renderer.domElement, this.overlay);
    this.effects = new Effects(this.scene);
    this.bubbles = new Bubbles(this.overlay, this.camera);
    this.hud = new Hud(this.overlay, this.input, this.settings);

    // oyuncu
    this.player = new Character(PLAYER_SPEC);
    this.player.bubbleHost = this.bubbles;
    this.player.pos.set(0.6, 0, 4.0);
    this.player.yaw = Math.PI;
    this.rig.yaw = 0;
    this.scene.add(this.player.model.root);

    this.world = { kahve: this.kahve, nav: this.nav, effects: this.effects, player: this.player, npcs: this.npcs, teaRequests: [], reservedTable: null };
    this.world.onPlayerTea = () => {
      this.social.setPlayerTea(true);
      this.stats.teas++;
      saveStats(this.stats);
      this.hud.toast('Çayın geldi! 7 ile iç.');
    };
    this.world.onPlayerBonked = (by) => this.social.playerBonked(by);
    this.chaos = new ChaosDirector(this.rng, this.settings.chaosIntensity);
    this.chaos.available = new Set(['brawl', 'tvGoal', 'powerCut', 'cat', 'tableFlip', 'objection', 'kibitz']);
    this.world.onTension = (src) => this.chaos.add(src);
    this.world.requestBrawl = (a, b) => this.brawls.start(a, b);

    // NPC'ler
    const spawns: [number, number][] = [[-2, 0], [3, -0.5], [-6, -1], [-6.8, -4.6], [6, 4], [-1.5, -5.2], [4, 4.5]];
    NPC_SPECS.forEach((spec, i) => {
      const c = new Character(spec);
      c.bubbleHost = this.bubbles;
      c.pos.set(spawns[i][0], 0, spawns[i][1]);
      c.yaw = Math.random() * Math.PI * 2;
      this.scene.add(c.model.root);
      const npc = new NPC(c, PERSONALITIES[spec.id], this.world);
      this.npcs.push(npc);
    });
    // başlangıçta bazıları oturuyor olsun (yaşayan ortam)
    this.presetScene();

    const occluders: THREE.Object3D[] = [];
    this.kahve.group.traverse((o) => { if (o.userData.occluder) occluders.push(o); });
    this.fader = new OcclusionFader([...occluders, ...this.npcs.map((n) => n.c.model.root)]);
    this.social = new Social(this.player, this.npcs, this.effects, this.rig, this.world, (m) => this.hud.toast(m));
    this.hud.onEmote = (id) => this.social.emote(id);
    // ekonomi (Aşama 2)
    this.economy = new EconomyController(new LocalEconomyStore(), this.npcs.map((n) => n.id));
    this.social.economy = this.economy;
    this.race = new HorseRaceTV(this);
    this.chaosEvents = new ChaosEvents(this);
    // NPC sesleri (Aşama 6): balon çıkınca kişiye özgü mırıltı + ağız hareketi
    this.voice = new VoicePlayer(() => sfx.voiceOutput(), this.rng, (id) => [this.player, ...this.npcs.map((n) => n.c)].find((c) => c.id === id)?.spec.voicePitch ?? 1);
    this.voice.enabled = this.settings.npcVoices;
    this.bubbles.onSay = (c, text, seconds) => {
      const head = c.headWorld();
      const dur = this.voice.speak(c.id, text, head, this.camera.position, this.clockTime);
      c.anim.speak(dur > 0 ? dur : Math.min(seconds * 0.6, 0.4 + text.length * 0.05));
    };
    this.social.now = () => this.clockTime;
    // çay fırlatma (Aşama 3)
    this.social.teaEnabled = () => this.settings.teaThrow !== 'off';
    this.world.npcThrowTea = (npc, target) => this.social.npcThrowTea(npc, target);
    this.social.onPlayerSplashed = () => this.chaos.add('teaSplash');
    this.economy.onChange((bal, debt, delta) => this.hud.setMoney(bal, debt, delta));
    const now = new Date();
    const bonus = this.economy.claimDaily(dayNumber(now.getTime(), now.getTimezoneOffset()));
    if (bonus) setTimeout(() => this.hud.toast(`☀️ Günaydın! Günlük kahve parası: +${bonus}🪙`, 4), 1500);
    this.hud.onSettings = (s) => this.applySettings(s);
    this.brawls = new BrawlController(this.world, this.chaos, this.rng, {
      playerBonked: (by) => this.social.playerBonked(by),
      toast: (m) => this.hud.toast(m),
    });
    this.hud.onResume = () => this.togglePause(false);

    this.applySettings(this.settings);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    // ses kilidini ilk etkileşimde aç
    const unlock = () => { sfx.unlock(); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private presetScene() {
    const byId = (id: string) => this.npcs.find((n) => n.id === id)!;
    const seatAt = (tableId: string, i: number) => this.kahve.tableById(tableId)!.seats[i];
    const sitNow = (n: NPC, seat: Seat, mode: 'seated' | 'sleep') => {
      n.c.sitOn(seat);
      n.mode = mode;
      if (mode === 'sleep') n.c.anim.posture = 'sleepSit';
      (n as unknown as { timer: number }).timer = 20 + Math.random() * 20;
    };
    sitNow(byId('riza'), seatAt('okey1', 0), 'seated');
    sitNow(byId('kemal'), seatAt('okey1', 2), 'seated');
    sitNow(byId('hasan'), seatAt('tavla1', 1), 'sleep');
    sitNow(byId('nihat'), seatAt('kart1', 1), 'seated');
  }

  applySettings(s: Settings) {
    this.settings = s;
    this.chaos?.setIntensity(s.chaosIntensity);
    if (this.voice) this.voice.enabled = s.npcVoices;
    saveSettings(s);
    sfx.settings = { master: s.master, sfx: s.sfx, ambience: s.ambience, muted: s.muted };
    sfx.applySettings();
    const dpr = window.devicePixelRatio || 1;
    const pr = s.quality === 'high' ? Math.min(dpr, 2) : s.quality === 'medium' ? Math.min(dpr, 1.25) : Math.min(dpr, 1) * 0.75;
    this.renderer.setPixelRatio(pr);
    this.renderer.shadowMap.enabled = s.quality !== 'low';
    this.kahve.lights.forEach((l) => { if (l instanceof THREE.PointLight) l.visible = s.quality !== 'low'; });
    applyOutlineVisibility(this.scene, s.quality !== 'low');
    this.rig.sensitivity = 0.0035 * s.sensitivity;
    this.rig.invertY = s.invertY;
    // gölge haritası değişimi için materyalleri yenile
    this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material; if (m && 'needsUpdate' in m) m.needsUpdate = true; });
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 70 : 55;
    this.camera.updateProjectionMatrix();
  }

  start() {
    this.renderer.setAnimationLoop(() => this.tick());
  }

  togglePause(force?: boolean) {
    const show = force ?? !this.hud.paused;
    if (show) {
      this.input.releasePointer();
      const played = Object.values(this.stats.played).reduce((a, b) => a + b, 0);
      const wins = Object.values(this.stats.wins).reduce((a, b) => a + b, 0);
      this.hud.showPause(true, `Oynanan maç: <b>${played}</b> · Kazanılan: <b>${wins}</b> · Şaplak: <b>${this.stats.bonks}</b> · İçilen çay: <b>${this.stats.teas}</b>`);
    } else this.hud.showPause(false);
    this.input.enabled = !show && this.mode === 'explore';
  }

  private tick() {
    const dt = Math.min(0.05, this.clock.getDelta()) * this.timeScale;
    this.clockTime += dt;
    this.frame++;
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 1) { this.fps = this.fpsFrames / this.fpsTime; this.fpsFrames = 0; this.fpsTime = 0; }
    const paused = this.hud.paused;
    for (const a of this.input.consumeActions()) this.handleAction(a);
    if (!paused) {
      if (this.mode === 'explore') this.updateExplore(dt);
      else this.session?.update(dt);
      const all = [this.player, ...this.npcs.map((n) => n.c)];
      for (const n of this.npcs) n.update(dt);
      // düşük kalitede ekran dışındaki karakterlerin animasyonu 4 karede bir güncellenir
      const throttle = this.settings.quality === 'low';
      if (throttle) { this.camera.updateMatrixWorld(); this.projScreen.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse); this.frustum.setFromProjectionMatrix(this.projScreen); }
      for (const c of all) {
        let animate = true;
        if (throttle && c !== this.player) {
          this.sphere.center.copy(c.pos).setY(1);
          animate = this.frustum.intersectsSphere(this.sphere) || this.frame % 4 === 0;
          this.animSkipped += animate ? 0 : 1;
        }
        c.update(dt, this.kahve.collision, all, animate);
      }
      this.kahve.update(dt);
      this.updateChaos(dt);
      this.updateEconomy(dt);
      this.updateTea(dt);
      this.race.update(dt);
      this.effects.update(dt);
    }
    const look = this.input.consumeLook();
    if (this.mode === 'explore' && !paused) this.rig.look(look.dx, look.dy, look.zoom);
    const follow = this.player.pos.clone().add(new THREE.Vector3(0, 1.25, 0));
    this.rig.update(dt, follow);
    if (this.mode === 'explore') this.fader.update(this.camera.position, follow); else this.fader.update(null, follow);
    this.bubbles.update();
    if (this.voice) {
      const fwd = new THREE.Vector3();
      this.camera.getWorldDirection(fwd);
      this.voice.setListener(this.camera.position, fwd);
    }
    this.renderer.render(this.scene, this.camera);
  }

  private teaSeenT = 8;
  private updateTea(dt: number) {
    this.social.update(dt);
    this.hud.setPlayerStain(stainIntensity(this.player.stain));
    // çaylı yüzlü birini gören NPC laf atar
    this.teaSeenT -= dt;
    if (this.teaSeenT > 0) return;
    this.teaSeenT = 7 + this.rng() * 6;
    const stained = [this.player, ...this.npcs.map((n) => n.c)].filter((c) => isStained(c.stain));
    for (const victim of stained) {
      const watchers = this.npcs.filter((n) => n.c !== victim && !n.inBrawl && n.mode !== 'sleep' && n.c.pos.distanceTo(victim.pos) < 4.5);
      const w = watchers[Math.floor(this.rng() * watchers.length)];
      if (!w) continue;
      w.c.anim.lookAt = victim.headWorld();
      w.c.say(pickLine(w.p.lines.teaSeen), 2.8);
      w.c.anim.play(w.p.temper < 0.5 ? 'laugh' : 'point');
      break;
    }
  }

  private updateEconomy(dt: number) {
    const sukru = this.npcs.find((n) => n.id === 'sukru');
    if (this.economy.update(dt).raiseEnded) sukru?.c.say(pickLine(SUKRU_LINES.raiseOver), 2.5);
    this.raiseT -= dt;
    if (this.raiseT <= 0) {
      this.raiseT = 120;
      if (this.economy.maybeRaise(this.rng)) {
        sukru?.c.say(pickLine(SUKRU_LINES.raise), 3.5);
        this.hud.toast(`📈 Şükrü zam yaptı: çay artık ${this.economy.price('tea')}🪙`);
      }
    }
    // veresiye sınırını aşan oyuncuya yakındaki NPC'ler laf atar
    this.teaseT -= dt;
    if (this.teaseT <= 0) {
      this.teaseT = 25 + this.rng() * 20;
      if (this.economy.overLimit && this.mode === 'explore') {
        const near = this.npcs.filter((n) => !n.inBrawl && n.mode !== 'inGame' && n.c.pos.distanceTo(this.player.pos) < 5);
        const n = near[Math.floor(this.rng() * near.length)];
        if (n) { n.c.faceTowards(this.player.pos); n.c.say(pickLine(n.p.lines.debtTease), 3); n.c.anim.play('point'); }
      }
    }
  }

  private updateChaos(dt: number) {
    const u = this.chaos.update(dt);
    switch (u.event?.id) {
      case 'brawl': this.startDirectorBrawl(); break;
      case 'tvGoal': this.chaosEvents.tvGoal(); break;
      case 'powerCut': this.chaosEvents.powerCut(); break;
      case 'cat': this.chaosEvents.catVisit(); break;
    }
    this.chaosEvents.update(dt);
    this.brawls.update(dt);
    this.overflowCooldown -= dt;
    if (u.overflow && this.overflowCooldown <= 0) {
      this.overflowCooldown = 20;
      this.hud.flashWarning('⚠️ KAHVEHANE KARIŞTI! Şükrü koş!');
    }
    this.hud.setTension(this.chaos.tension, this.chaos.level);
  }

  /** Direktörün kavga olayı: müsait iki rakip NPC birbirine girer (yoksa en sinirli iki kişi). */
  startDirectorBrawl(): boolean {
    const free = this.npcs.filter((n) => n.id !== 'sukru' && !n.inBrawl && ['idle', 'seated', 'tv', 'wander', 'chat', 'bench'].includes(n.mode));
    const pairs: [typeof free[0], typeof free[0]][] = [];
    for (const a of free) for (const b of free) if (a !== b && a.p.rivals.includes(b.id)) pairs.push([a, b]);
    let pair = pairs.length ? pairs[Math.floor(this.rng() * pairs.length)] : null;
    if (!pair && free.length >= 2) {
      const hot = [...free].sort((x, y) => y.p.temper - x.p.temper);
      pair = [hot[0], hot[1]];
    }
    if (!pair) return false;
    const [a, b] = pair;
    a.c.say(pickLine(a.p.lines.laf), 2.5);
    return this.brawls.start(a.id, b.id);
  }

  private handleAction(a: string) {
    if (a === 'menu') {
      if (this.hud.paused) { this.togglePause(false); return; }
      if (this.session) { this.session.requestExit(); return; }
      this.togglePause(true);
      return;
    }
    if (this.hud.paused || this.mode !== 'explore') return;
    sfx.unlock();
    switch (a) {
      case 'interact': this.interact(); break;
      case 'bonk': if (this.social.bonk()) { this.stats.bonks++; saveStats(this.stats); } break;
      case 'tea': this.social.orderTea(); break;
      case 'throwTea': this.social.throwTea(); break;
      case 'emoteMenu': this.hud.toggleEmotes(); break;
      default:
        if (a.startsWith('emote')) {
          const idx = Number(a.slice(5)) - 1;
          if (EMOTES[idx]) this.social.emote(EMOTES[idx].id);
        }
    }
  }

  private updateExplore(dt: number) {
    const p = this.player;
    const mv = this.input.moveVector();
    const incap = p.anim.isIncapacitated();
    if (!incap && (mv.x || mv.y)) {
      const fwd = this.rig.forward();
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const dir = fwd.multiplyScalar(mv.y).add(right.multiplyScalar(mv.x));
      const speed = (mv.run ? 3.4 : 1.6) * Math.min(1, Math.hypot(mv.x, mv.y) * 1.2);
      const target = dir.normalize().multiplyScalar(speed);
      p.velocity.lerp(target, Math.min(1, dt * 10));
      p.targetYaw = Math.atan2(target.x, target.z);
      this.stepT -= dt * speed;
      if (this.stepT <= 0) { this.stepT = 0.7; sfx.play('step'); }
    } else {
      p.velocity.multiplyScalar(Math.max(0, 1 - dt * 12));
    }
    // etkileşim odağı
    this.focus = this.findFocus();
    this.hud.setPrompt(this.focus ? `[E] ${this.focusLabel(this.focus)}` : null);
  }

  private findFocus(): Interactable | null {
    const p = this.player.pos;
    const fwd = new THREE.Vector3(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw));
    let best: Interactable | null = null;
    let bestScore = Infinity;
    const candidates: Interactable[] = [...this.kahve.interactables];
    for (const n of this.npcs) candidates.push({ id: `npc:${n.id}`, kind: 'npc', pos: n.c.pos, radius: 1.5, label: n.c.name, ref: n });
    for (const it of candidates) {
      if (it.kind === 'seat') {
        const seat = it.ref as Seat;
        if (seat.occupant) continue;
      }
      const d = it.pos.clone().sub(p).setY(0);
      const dist = d.length();
      if (dist > it.radius) continue;
      const facing = dist < 0.3 ? 1 : d.normalize().dot(fwd);
      const score = dist - facing * 0.6 + (it.kind === 'npc' ? 0.35 : 0);
      if (score < bestScore) { bestScore = score; best = it; }
    }
    return best;
  }

  private focusLabel(it: Interactable): string {
    switch (it.kind) {
      case 'seat': return `Otur — ${(it.ref as Seat).table.name}`;
      case 'tv': return this.race.phase === 'betting' ? (this.race.playerBet ? 'Bahsin yapıldı — yarışı bekle 🐎' : 'At yarışına bahis yap 🐎') : 'Kanalı değiştir';
      case 'semaver': return this.economy.broke ? `Bulaşık yıka (+${WORK_PAY}🪙)` : `${this.social.playerHasTea ? 'Bir çay daha doldur' : 'Kendine çay doldur'} (${this.economy.price('tea')}🪙)`;
      case 'door': return 'Dışarı çık';
      case 'dart': return 'Dart oyna 🎯';
      case 'npc': {
        const n = it.ref as NPC;
        if (n.id === 'sukru' && this.economy.debt > 0 && this.economy.balance > 0) return `Şükrü'ye borcunu öde (${this.economy.debt}🪙)`;
        return n.mode === 'sleep' ? `${n.c.name}'ı dürt` : `${n.c.name} ile konuş · F: ıstaka`;
      }
      default: return it.label;
    }
  }

  private interact() {
    const it = this.focus;
    if (!it) { this.hud.toast('Yakında etkileşilecek bir şey yok.'); return; }
    const p = this.player;
    switch (it.kind) {
      case 'seat':
        this.sitDown(it.ref as Seat);
        break;
      case 'tv':
        if (this.race.phase === 'betting') { if (!this.race.playerBet) this.race.openBetUI(); break; }
        if (this.race.phase === 'running' || this.race.phase === 'results') { this.hud.toast('Yarış var, kanal değişmez!'); break; }
        this.kahve.tv.nextChannel();
        sfx.play('tvChannel');
        p.anim.play('point');
        for (const n of this.npcs) if (n.mode === 'tv') {
          n.c.anim.play('angry');
          n.c.say(pickLine(['Hoop! Maçı aç geri!', 'Kanalı kim değiştirdi?!', 'Aaa, tam pozisyon vardı!']), 2.5);
          sfx.play('angry', n.c.spec.voicePitch);
        }
        break;
      case 'semaver': {
        p.faceTowards(this.kahve.semaverPos);
        if (this.economy.broke) {
          const w = this.economy.work();
          if (!w) { this.hud.toast('Az önce yıkadın, biraz dinlen.'); break; }
          p.anim.play('pour');
          sfx.play('pour');
          setTimeout(() => sfx.play('glass'), 700);
          const s = this.npcs.find((n) => n.id === 'sukru');
          s?.c.say(pickLine(SUKRU_LINES.workDone), 2.5);
          this.hud.toast(w.toDebt ? `Bulaşık yıkadın: ${w.toDebt}🪙 borçtan düştü${w.earned - w.toDebt ? `, ${w.earned - w.toDebt}🪙 cebe` : ''}.` : `Bulaşık yıkadın: +${w.earned}🪙`);
          break;
        }
        const r = this.economy.buy('tea');
        if (!r.ok) {
          this.hud.toast('Veresiye defteri doldu! Önce borcunu öde ya da bulaşık yıka.');
          this.npcs.find((n) => n.id === 'sukru')?.c.say(pickLine(SUKRU_LINES.noCredit), 3);
          break;
        }
        p.anim.play('pour');
        sfx.play('pour');
        setTimeout(() => { this.social.setPlayerTea(true); sfx.play('glass'); this.hud.toast(`Çayını doldurdun (${r.price}🪙${r.onCredit ? `, ${r.onCredit}🪙 veresiye` : ''}). 7 ile iç!`); this.stats.teas++; saveStats(this.stats); }, 1800);
        break;
      }
      case 'dart':
        this.startDart();
        break;
      case 'door':
        p.say(pickLine(['Dışarısı soğuk, içerisi muhabbet. Kalayım.', 'Eve gidersem okey kaçar...', 'Bir el daha oynar, öyle giderim.']), 3);
        p.anim.play('shrug');
        break;
      case 'npc': {
        const n = it.ref as NPC;
        p.faceTowards(n.c.pos);
        if (n.id === 'sukru' && this.economy.debt > 0 && this.economy.balance > 0) {
          const paid = this.economy.payDebt();
          n.c.say(pickLine(this.economy.debt === 0 ? SUKRU_LINES.paid : SUKRU_LINES.credit), 2.5);
          n.c.anim.play('wave');
          sfx.play('glass');
          this.hud.toast(`Borç ödendi: ${paid}🪙${this.economy.debt ? ` (kalan ${this.economy.debt}🪙)` : ' — hesap temiz!'}`);
          break;
        }
        if (n.mode === 'sleep') {
          n.c.anim.posture = 'sit';
          n.mode = 'seated';
          n.c.anim.play('surprise');
          sfx.play('surprise', n.c.spec.voicePitch);
          n.c.say(pickLine(['Ha?! Uyumuyordum!', 'Gözlerimi dinlendiriyordum...', 'Sıra bende mi?']), 2.5);
        } else if (n.mode !== 'inGame') {
          p.anim.play('talk');
          p.say(pickLine(['Nasılsın abi?', 'Ne var ne yok?', 'Bir el okey?']), 2);
          setTimeout(() => {
            n.c.faceTowards(p.pos);
            n.c.say(pickLine(Math.random() < 0.5 ? n.p.lines.idle : n.p.lines.greet), 3);
            n.c.anim.play('talk');
            sfx.play('grunt', n.c.spec.voicePitch);
          }, 900);
        }
        break;
      }
    }
  }

  // ------------------------------------------------------------ masa oturumu
  sitDown(seat: Seat) {
    if (seat.occupant) return;
    const p = this.player;
    p.velocity.set(0, 0, 0);
    this.effects.puff(seat.pos.clone(), 0xfff3b0, 6, 0.12);
    p.sitOn(seat);
    p.anim.play('surprise');
    sfx.play('chair');
    this.mode = 'seated';
    this.input.enabled = false;
    this.input.releasePointer();
    this.hud.setVisible(false);
    this.hud.setPrompt(null);
    this.world.reservedTable = seat.table.id;
    // kamera: oyuncunun arkasından masaya bakış
    const back = new THREE.Vector3(-Math.sin(seat.yaw), 0, -Math.cos(seat.yaw));
    // oyuncunun başının üstünden masaya bakış; masa ekranın üst yarısında kalsın (alt yarıda arayüz var)
    const camPos = seat.pos.clone().addScaledVector(back, 0.15).add(new THREE.Vector3(0, 1.8, 0));
    const look = seat.table.center.clone().addScaledVector(back, -0.25).add(new THREE.Vector3(0, 0.3, 0));
    this.rig.setFixed(camPos, look);
    this.session = new TableSession(this, seat);
  }

  startDart() {
    const p = this.player;
    p.velocity.set(0, 0, 0);
    this.mode = 'seated';
    this.input.enabled = false;
    this.input.releasePointer();
    this.hud.setVisible(false);
    this.hud.setPrompt(null);
    this.session = new DartSession(this);
  }

  standUp() {
    const p = this.player;
    this.session = null;
    this.world.reservedTable = null;
    p.standUp();
    sfx.play('chair');
    this.rig.setFixed(null);
    this.rig.yaw = p.yaw + Math.PI;
    this.mode = 'explore';
    this.input.enabled = true;
    this.hud.setVisible(true);
  }

  /** Para sesi */
  audioCoins() { sfx.play('coin'); }

  recordResult(gameId: string, won: boolean) {
    this.stats.played[gameId] = (this.stats.played[gameId] ?? 0) + 1;
    if (won) this.stats.wins[gameId] = (this.stats.wins[gameId] ?? 0) + 1;
    saveStats(this.stats);
  }
}
