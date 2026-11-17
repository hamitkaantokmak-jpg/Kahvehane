/**
 * Komik sosyal etkileşimler: ıstakayla şaplak, emote'lar, laf atma, çay ısmarlama.
 * Hepsi karakter animasyonlarıyla desteklenir; NPC'ler kişiliklerine göre tepki verir.
 */
import * as THREE from 'three';
import { Character } from '../characters/Character';
import { ActionName } from '../characters/Animator';
import { makeIstaka, makeTeaGlass } from '../characters/CharacterModel';
import type { NPC, NpcWorld } from '../npc/NPC';
import type { Effects } from '../fx/Effects';
import type { CameraRig } from '../player/CameraRig';
import { sfx } from '../audio/Sfx';
import { pickLine } from '../npc/personalities';

export type EmoteId = 'wave' | 'laugh' | 'clap' | 'bellyDance' | 'slamTable' | 'laf' | 'drink';

export const EMOTES: { id: EmoteId; label: string; key: string; icon: string }[] = [
  { id: 'wave', label: 'Selam ver', key: '1', icon: '👋' },
  { id: 'laugh', label: 'Kahkaha', key: '2', icon: '😂' },
  { id: 'clap', label: 'Alkış', key: '3', icon: '👏' },
  { id: 'bellyDance', label: 'Göbek at', key: '4', icon: '💃' },
  { id: 'slamTable', label: 'Masaya vur', key: '5', icon: '✊' },
  { id: 'laf', label: 'Laf at', key: '6', icon: '🗯️' },
  { id: 'drink', label: 'Çay iç', key: '7', icon: '🍵' },
];

const LAF_LINES = [
  'Dayı, ıstakan ters!', 'Bu bıyıkla mı okey oynuyorsun?', 'Çayın soğudu, tıpkı şansın gibi!',
  'Okeyi görsen tanır mısın?', 'Zarın da senin gibi yorgun!', 'Göbeğin masaya değiyor abi!',
];

export class Social {
  private swinging = false;
  playerHasTea = false;
  private teaObj: THREE.Object3D | null = null;
  bonkCount = 0;
  /** Oyuncunun kaç kez karşılık olarak vurulduğu */
  timesBonked = 0;

  constructor(
    private player: Character,
    private npcs: NPC[],
    private effects: Effects,
    private rig: CameraRig,
    private world: NpcWorld,
    private toast: (msg: string) => void,
  ) {}

  /** Önündeki en yakın NPC (koni içinde). */
  targetInFront(maxDist = 1.5, cone = 0.9): NPC | null {
    const fwd = new THREE.Vector3(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw));
    let best: NPC | null = null;
    let bestD = Infinity;
    for (const n of this.npcs) {
      const d = n.c.pos.clone().sub(this.player.pos).setY(0);
      const dist = d.length();
      if (dist > maxDist || dist < 0.01) continue;
      const dot = d.normalize().dot(fwd);
      if (dot < Math.cos(cone)) continue;
      if (dist < bestD) { bestD = dist; best = n; }
    }
    return best;
  }

  nearestNpc(maxDist = 2.2): NPC | null {
    let best: NPC | null = null;
    let bestD = maxDist;
    for (const n of this.npcs) {
      const d = n.c.pos.distanceTo(this.player.pos);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  bonk(): boolean {
    if (this.swinging || this.player.anim.isIncapacitated()) return false;
    this.swinging = true;
    const p = this.player;
    // hedefe dön (yakında varsa)
    const target = this.targetInFront(1.6, 1.2) ?? this.nearestNpc(1.4);
    if (target) p.faceTowards(target.c.pos);
    const ist = makeIstaka();
    p.model.setHeldProp(ist);
    p.anim.play('swing');
    sfx.play('whoosh');
    setTimeout(() => {
      const hit = this.targetInFront(1.7, 1.0) ?? (target && target.c.pos.distanceTo(p.pos) < 1.7 ? target : null);
      if (hit) {
        sfx.play('bonk');
        const head = hit.c.headWorld();
        this.effects.impactText(head.clone().add(new THREE.Vector3(0, 0.25, 0)), pickLine(['BONK!', 'TAK!', 'PAT!', 'DONK!']));
        this.rig.shake(0.06, 0.2);
        hit.onBonked(p);
        this.bonkCount++;
        // çevredekiler güler
        for (const n of this.npcs) {
          if (n === hit || n.mode === 'react') continue;
          if (n.c.pos.distanceTo(hit.c.pos) < 5 && Math.random() < 0.6) {
            setTimeout(() => {
              n.c.anim.play('laugh');
              sfx.play('laugh', n.c.spec.voicePitch);
              if (Math.random() < 0.4) n.c.say(pickLine(['Hahaha!', 'Oh olsun!', 'Bir daha, bir daha!', 'Yazık oldu adama hahaha']), 2);
            }, 500 + Math.random() * 600);
          }
        }
      } else {
        sfx.play('whoosh');
        // boşa sallarsa kendi dengesini kaybeder
        setTimeout(() => { p.anim.play('stagger'); p.say(pickLine(['Iska!', 'Hoppaa...', 'Rüzgar vardı!']), 1.8); }, 150);
      }
    }, 300);
    setTimeout(() => { p.model.setHeldProp(this.teaObj); this.swinging = false; }, 850);
    return true;
  }

  emote(id: EmoteId) {
    const p = this.player;
    if (p.anim.isIncapacitated()) return;
    const near = this.npcs.filter((n) => n.c.pos.distanceTo(p.pos) < 5);
    switch (id) {
      case 'wave':
        p.anim.play('wave');
        sfx.play('pop');
        p.say(pickLine(['Selamün aleyküm!', 'Hayırlı akşamlar!', 'Merhaba ahali!']), 2);
        near.slice(0, 2).forEach((n, i) => setTimeout(() => n.onEmoteNearby('wave'), 500 + i * 400));
        break;
      case 'laugh':
        p.anim.play('laugh');
        sfx.play('laugh', 1);
        near.forEach((n) => setTimeout(() => n.onEmoteNearby('laugh'), 300 + Math.random() * 600));
        break;
      case 'clap':
        p.anim.play('clap');
        sfx.play('clap');
        near.forEach((n) => setTimeout(() => n.onEmoteNearby('clap'), 400 + Math.random() * 500));
        break;
      case 'bellyDance':
        p.anim.play('bellyDance');
        sfx.play('pop');
        this.playTune();
        near.forEach((n) => setTimeout(() => n.onEmoteNearby('bellyDance'), 600 + Math.random() * 800));
        break;
      case 'slamTable':
        p.anim.play('slamTable');
        setTimeout(() => { sfx.play('tableSlam'); this.rig.shake(0.05, 0.15); }, 380);
        near.forEach((n) => setTimeout(() => n.onEmoteNearby('slamTable'), 500));
        break;
      case 'laf': {
        const t = this.targetInFront(3, 1.2) ?? this.nearestNpc(3);
        p.anim.play('point');
        sfx.play('grunt', 1.1);
        if (t) {
          p.faceTowards(t.c.pos);
          p.say(pickLine(LAF_LINES), 2.5);
          setTimeout(() => t.onLaf(), 1300);
        } else p.say('Kimse yok ki laf atayım...', 2);
        break;
      }
      case 'drink':
        if (!this.playerHasTea) { this.toast('Elinde çay yok. Semavere git ya da T ile Şükrü\'den iste.'); p.anim.play('shrug'); return; }
        p.anim.play('drink');
        sfx.play('glass');
        setTimeout(() => p.say(pickLine(['Oh be!', 'Tavşan kanı!', 'Mis gibi...']), 2), 1400);
        setTimeout(() => this.setPlayerTea(false), 2600);
        break;
    }
  }

  private playTune() {
    // kısa darbuka benzeri ritim
    const pattern = [0, 0.25, 0.375, 0.5, 0.75, 1.0, 1.25, 1.375, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75];
    pattern.forEach((t, i) => setTimeout(() => sfx.play(i % 4 === 0 ? 'tableSlam' : 'slap'), t * 1000));
  }

  setPlayerTea(v: boolean) {
    this.playerHasTea = v;
    if (v) {
      this.teaObj = makeTeaGlass(false);
      this.teaObj.position.set(0, -0.02, 0.06);
      this.player.model.setHeldProp(this.teaObj);
    } else {
      this.teaObj = null;
      this.player.model.setHeldProp(null);
    }
  }

  orderTea(forOther?: NPC) {
    const sukru = this.npcs.find((n) => n.id === 'sukru');
    if (!sukru) return;
    const target = forOther ? forOther.c : this.player;
    if (this.world.teaRequests.includes(target)) { this.toast('Çay zaten yolda!'); return; }
    this.world.teaRequests.push(target);
    this.player.anim.play('wave');
    this.player.say(forOther ? `Şükrü! ${forOther.c.name}'ya bir çay!` : 'Şükrü! Bir çay!', 2);
    sfx.play('pop');
    setTimeout(() => sukru.c.say(pickLine(['Geliyor abi!', 'Hemen abi!', 'Taze demledim, geliyor!']), 2), 900);
  }

  /** Oyuncu vurulunca (misilleme) */
  playerBonked(by: Character) {
    const p = this.player;
    this.timesBonked++;
    sfx.play('bonk');
    this.effects.impactText(p.headWorld().add(new THREE.Vector3(0, 0.25, 0)), 'BONK!');
    this.effects.stars(p.model.head, 2.4);
    p.anim.hitImpulse(1.8);
    p.knockback(p.pos.clone().sub(by.pos), 2);
    p.anim.play(Math.random() < 0.5 ? 'fall' : 'stagger');
    this.rig.shake(0.12, 0.3);
    setTimeout(() => p.say(pickLine(['Aaah!', 'Haklısın abi...', 'Yıldızlar dönüyor...']), 2), 500);
    if (this.playerHasTea) this.setPlayerTea(false);
  }

  playGesture(a: ActionName) { this.player.anim.play(a); }
}
