/**
 * Dart oturumu (3D katman): oyuncu atış çizgisinde, rakip NPC'ler yanında ayakta. Kamera oyuncunun arkasından tahtaya bakar.
 * Kurallar `games/dart/dart.ts` (saf), arayüz `ui/games/DartUI.ts`. Bahis Aşama 2 ekonomisine bağlıdır.
 */
import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { NPC } from '../npc/NPC';
import { DartUI, DartHost } from '../ui/games/DartUI';
import { DartOptions } from '../games/dart/dart';
import { STAKES, stakeCoins, Outcome } from '../economy/Betting';
import { pickLine } from '../npc/personalities';
import { sfx, SfxName } from '../audio/Sfx';
import { h, btn } from '../ui/dom';
import type { ReactKind } from './TableSession';
import { toonMesh, sharedGeo } from '../world/materials';
import { isStained } from '../interactions/teaThrow';

interface Flying { mesh: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; t: number; onLand: () => void; landed: boolean }

const SPOTS = [new THREE.Vector3(-5.5, 0, 3.3), new THREE.Vector3(-5.5, 0, 5.5), new THREE.Vector3(-4.8, 0, 4.4)];

export class DartSession implements DartHost {
  readonly root: HTMLDivElement;
  ui: DartUI | null = null;
  names: string[] = [];
  ids: string[] = [];
  participants: (NPC | 'player')[] = [];
  private darts: THREE.Object3D[] = [];
  private flying: Flying[] = [];
  private aimMesh: THREE.Mesh;
  private ray = new THREE.Raycaster();
  options: DartOptions & { stake: number } = { start: 501, doubleOut: true, teams: false, stake: 0 };

  constructor(private game: Game) {
    this.root = h('div', 'game-root');
    game.overlay.appendChild(this.root);
    const k = game.kahve;
    this.aimMesh = new THREE.Mesh(sharedGeo('aimRing', () => new THREE.RingGeometry(0.06, 0.09, 24)), new THREE.MeshBasicMaterial({ color: 0x00e0ff, transparent: true, opacity: 0.9, depthTest: false }));
    this.aimMesh.renderOrder = 999;
    this.aimMesh.visible = false;
    k.dartGroup.add(this.aimMesh);
    // oyuncu çizgide, tahtaya dönük
    const p = game.player;
    p.pos.copy(k.dartThrowPos);
    p.yaw = -Math.PI / 2;
    p.targetYaw = -Math.PI / 2;
    p.velocity.set(0, 0, 0);
    // birinci şahıs: oyuncunun gözünden tahtaya
    p.model.root.visible = false;
    game.rig.setFixed(new THREE.Vector3(k.dartThrowPos.x - 0.2, 1.68, k.dartThrowPos.z), k.dartCenter.clone().add(new THREE.Vector3(0, -0.05, 0)));
    this.showSelect();
  }

  get rng() { return this.game.rng; }

  private showSelect() {
    this.root.innerHTML = '';
    const panel = h('div', 'select-panel');
    panel.innerHTML = `<h2>🎯 Dart</h2><p class="muted">X01: puanını sıfıra ilk indiren kazanır. Fazla atarsan (bust) tur geçersiz.</p>`;
    const opts = h('div', 'gc-opts dart-opts');
    opts.innerHTML = `
      <label>Başlangıç <select data-o="start"><option value="301">301</option><option value="501" selected>501</option></select></label>
      <label class="row"><input type="checkbox" data-o="doubleOut" checked> Çift ile bitirme</label>
      <label class="row"><input type="checkbox" data-o="teams"> 2'şer kişilik takım (4 oyuncu)</label>`;
    opts.querySelectorAll('[data-o]').forEach((el) => el.addEventListener('change', () => {
      const i = el as HTMLInputElement;
      const k = i.dataset.o!;
      (this.options as unknown as Record<string, unknown>)[k] = i.type === 'checkbox' ? i.checked : Number(i.value);
    }));
    panel.appendChild(opts);
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
    panel.appendChild(stakeRow);
    const row = h('div', 'row-btns');
    row.appendChild(btn('Oyna ▶', 'primary', () => this.start()));
    row.appendChild(btn('Vazgeç', 'ghost', () => this.exit()));
    panel.appendChild(row);
    this.root.appendChild(panel);
  }

  start() {
    const n = this.options.teams ? 4 : 2;
    const free = this.game.npcs.filter((x) => !x.inBrawl && x.mode !== 'inGame' && x.id !== 'sukru');
    free.sort((a, b) => a.c.pos.distanceTo(this.game.kahve.dartThrowPos) - b.c.pos.distanceTo(this.game.kahve.dartThrowPos));
    const bots = free.slice(0, n - 1);
    if (bots.length < n - 1) { this.game.hud.toast('Yeterli rakip yok, biraz sonra dene.'); return; }
    this.participants = ['player', ...bots];
    bots.forEach((b, i) => {
      b.releaseReservations();
      b.c.stopWalking();
      if (b.c.seated) b.c.standUp();
      this.game.effects.puff(b.c.pos.clone(), 0xffffff, 8, 0.2);
      b.c.pos.copy(SPOTS[i]);
      b.c.anim.posture = 'stand';
      b.mode = 'inGame';
      b.c.faceTowards(this.game.kahve.dartCenter);
      setTimeout(() => { b.c.say(pickLine(b.p.lines.joinGame), 2.5); b.c.anim.play('wave'); }, 300 + i * 400);
    });
    this.names = this.participants.map((p) => (p === 'player' ? 'Sen' : p.c.name));
    this.ids = this.participants.map((p) => (p === 'player' ? 'player' : p.id));
    this.root.innerHTML = '';
    this.ui = new DartUI(this, { start: this.options.start, doubleOut: this.options.doubleOut, teams: this.options.teams });
    this.root.appendChild(this.ui.el);
    if (this.options.stake > 0) this.game.hud.toast(`💰 Bahisli dart: kaybeden ${this.options.stake} çay (${stakeCoins(this.options.stake)}🪙) öder.`);
  }

  // ------------------------------------------------------------------ DartHost
  get paused() { return this.participants.some((p) => p !== 'player' && p.inBrawl); }
  isHuman(i: number) { return this.participants[i] === 'player'; }
  sfx(name: SfxName) { sfx.play(name); }
  toast(msg: string) { this.game.hud.toast(msg); }
  private charOf(i: number) { const p = this.participants[i]; return p === 'player' ? this.game.player : p?.c; }

  react(i: number, kind: ReactKind, line?: string) {
    const c = this.charOf(i);
    const p = this.participants[i];
    if (!c) return;
    const lines = p !== 'player' ? p.p.lines : null;
    const say = (arr?: string[]) => { if (line) c.say(line, 2.4); else if (arr && this.rng() < 0.7) c.say(pickLine(arr), 2.4); };
    if (kind === 'angry' || kind === 'lose') { c.anim.play('angry'); sfx.play('angry', c.spec.voicePitch); say(lines?.lose); }
    else if (kind === 'goodMove' || kind === 'happy') { c.anim.play('cheer'); say(lines?.goodMove); }
    else if (kind === 'win') { c.anim.play('bellyDance'); sfx.play('laugh', c.spec.voicePitch); say(lines?.win); }
    else if (kind === 'surprise') { c.anim.play('surprise'); say(); }
  }

  /** Tahta koordinatına karşılık gelen dünya noktası */
  boardToWorld(p: { x: number; y: number }, out = new THREE.Vector3()) {
    const k = this.game.kahve;
    return out.set(k.dartCenter.x + 0.01, k.dartCenter.y + p.y * k.dartRadius, k.dartCenter.z - p.x * k.dartRadius);
  }

  boardFromScreen(x: number, y: number) {
    const k = this.game.kahve;
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(ndc, this.game.camera);
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -k.dartCenter.x);
    const hit = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(plane, hit)) return null;
    const bx = -(hit.z - k.dartCenter.z) / k.dartRadius, by = (hit.y - k.dartCenter.y) / k.dartRadius;
    if (Math.hypot(bx, by) > 2.2) return null;
    return { x: bx, y: by };
  }

  showAim(p: { x: number; y: number } | null) {
    if (!p) { this.aimMesh.visible = false; return; }
    this.aimMesh.visible = true;
    this.aimMesh.position.set(p.x * this.game.kahve.dartRadius, p.y * this.game.kahve.dartRadius, 0.01);
  }

  launchDart(player: number, point: { x: number; y: number }, onLand: () => void) {
    const c = this.charOf(player)!;
    c.faceTowards(this.game.kahve.dartCenter);
    c.anim.play('swing');
    const from = new THREE.Vector3();
    c.model.handPropR.getWorldPosition(from);
    from.y += 0.1;
    const to = this.boardToWorld(point).add(new THREE.Vector3(0.06, 0, 0));
    const dart = makeDart();
    dart.position.copy(from);
    this.game.scene.add(dart);
    this.flying.push({ mesh: dart, from, to, t: 0, onLand, landed: false });
  }

  clearDarts() {
    for (const d of this.darts) this.game.scene.remove(d);
    this.darts = [];
  }

  wobble(): number {
    // çay içmiş (son 60 sn) ya da yüzü çaylı oyuncunun eli titrer
    const s = this.game.social;
    const recent = s.lastDrinkAt !== null && this.game.clockTime - s.lastDrinkAt < 60;
    return (recent ? 0.03 : 0) + (isStained(this.game.player.stain) ? 0.02 : 0);
  }

  matchFinished(winnerSide: number) {
    const teams = this.options.teams;
    const side = (p: number) => (teams ? p % 2 : p);
    const all = this.participants.map((_, i) => i);
    const outcome: Outcome = { payers: all.filter((p) => side(p) !== winnerSide), winners: all.filter((p) => side(p) === winnerSide), multiplier: 1 };
    const humanWon = side(0) === winnerSide;
    this.game.recordResult('dart', humanWon);
    all.forEach((i) => { if (i !== 0) setTimeout(() => this.react(i, side(i) === winnerSide ? 'win' : 'lose'), 300 + i * 300); });
    if (this.options.stake > 0) {
      const res = this.game.economy.settle(outcome, this.options.stake, this.ids);
      if (res.length) {
        const name = (id: string) => (id === 'player' ? 'Sen' : this.game.npcs.find((n) => n.id === id)?.c.name ?? id);
        setTimeout(() => {
          const panel = this.root.querySelector('.modal .panel');
          const box = h('div', 'settle-list', `💰 Hesap:<br>${res.map((t) => `${name(t.from)} → ${name(t.to)}: ${t.amount}🪙${t.onCredit ? ` (${t.onCredit}🪙 veresiye)` : ''}`).join('<br>')}`);
          if (panel) panel.insertBefore(box, panel.querySelector('.row-btns')); else this.toast(box.textContent ?? '');
        }, 1000);
        sfx.play('coin');
      }
    }
  }

  requestExit() { this.exit(); }

  exit() {
    this.ui?.destroy();
    this.ui = null;
    this.clearDarts();
    for (const f of this.flying) this.game.scene.remove(f.mesh);
    this.flying = [];
    this.game.kahve.dartGroup.remove(this.aimMesh);
    for (const p of this.participants) if (p !== 'player' && p.mode === 'inGame') { p.mode = 'idle'; }
    this.participants = [];
    this.root.remove();
    this.game.player.model.root.visible = true;
    this.game.standUp();
  }

  update(dt: number) {
    this.ui?.update(dt);
    for (const f of this.flying) {
      f.t = Math.min(1, f.t + dt / 0.38);
      f.mesh.position.lerpVectors(f.from, f.to, f.t);
      f.mesh.position.y += Math.sin(f.t * Math.PI) * 0.18;
      f.mesh.lookAt(f.to.clone().add(new THREE.Vector3(-1, 0, 0)));
      if (f.t >= 1 && !f.landed) {
        f.landed = true;
        f.mesh.position.copy(f.to);
        this.darts.push(f.mesh);
        f.onLand();
      }
    }
    this.flying = this.flying.filter((f) => !f.landed);
  }
}

function makeDart(): THREE.Group {
  const g = new THREE.Group();
  const body = toonMesh(sharedGeo('dartBody', () => new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6).rotateX(Math.PI / 2)), 0xc0c0c0, 0.004);
  const tip = toonMesh(sharedGeo('dartTip', () => new THREE.ConeGeometry(0.005, 0.04, 6).rotateX(Math.PI / 2)), 0x555555, 0);
  tip.position.z = 0.08;
  const flight = toonMesh(sharedGeo('dartFlight', () => new THREE.BoxGeometry(0.05, 0.004, 0.04)), 0xd9412b, 0.004);
  flight.position.z = -0.06;
  const flight2 = flight.clone();
  flight2.rotation.z = Math.PI / 2;
  g.add(body, tip, flight, flight2);
  return g;
}
