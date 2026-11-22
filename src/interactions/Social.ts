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
import { pickLine, SUKRU_LINES } from '../npc/personalities';
import type { EconomyController } from '../economy/EconomyController';
import { newThrowState, throwCost, canThrow, recordThrow, updateThrows, splash, wipe, isStained } from '../interactions/teaThrow';
import { HOUSE, playerPay, price, balanceOf } from '../economy/Economy';

export type EmoteId = 'wave' | 'laugh' | 'clap' | 'bellyDance' | 'slamTable' | 'laf' | 'drink' | 'wipe';

export const EMOTES: { id: EmoteId; label: string; key: string; icon: string }[] = [
  { id: 'wave', label: 'Selam ver', key: '1', icon: '👋' },
  { id: 'laugh', label: 'Kahkaha', key: '2', icon: '😂' },
  { id: 'clap', label: 'Alkış', key: '3', icon: '👏' },
  { id: 'bellyDance', label: 'Göbek at', key: '4', icon: '💃' },
  { id: 'slamTable', label: 'Masaya vur', key: '5', icon: '✊' },
  { id: 'laf', label: 'Laf at', key: '6', icon: '🗯️' },
  { id: 'drink', label: 'Çay iç', key: '7', icon: '🍵' },
  { id: 'wipe', label: 'Yüzünü sil', key: '8', icon: '🧻' },
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

  /** Ekonomi (Aşama 2): çay parası, veresiye */
  economy: EconomyController | null = null;
  /** Çay fırlatma (Aşama 3) */
  readonly throwState = newThrowState();
  teaEnabled: () => boolean = () => true;
  /** Oyun saati (Game verir) ve son çay içme anı (dart nişanı titrer) */
  now: () => number = () => 0;
  lastDrinkAt: number | null = null;
  private npcThrowCd = new Map<string, number>();

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

  /** Oyuncu bir hareket yaptı (çevrimiçi ortak kahvehanede arkadaşlara iletilir) */
  onEmote: (id: EmoteId) => void = () => {};

  emote(id: EmoteId) {
    const p = this.player;
    if (p.anim.isIncapacitated()) return;
    this.onEmote(id);
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
      case 'wipe':
        if (!isStained(p.stain)) { this.toast('Yüzün zaten tertemiz.'); p.anim.play('shrug'); return; }
        p.anim.play('facepalm');
        sfx.play('pop');
        setTimeout(() => { wipe(p.stain); p.say(pickLine(['Peçete nerede be...', 'Tamam, temizlendi.', 'Çay kokuyorum hâlâ.']), 2); }, 900);
        break;
      case 'drink':
        if (!this.playerHasTea) { this.toast('Elinde çay yok. Semavere git ya da T ile Şükrü\'den iste.'); p.anim.play('shrug'); return; }
        p.anim.play('drink');
        sfx.play('glass');
        this.lastDrinkAt = this.now();
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
    // ödeme: para yetmezse veresiye, veresiye sınırı doluysa Şükrü çay getirmez
    if (this.economy) {
      const r = this.economy.buy('tea');
      if (!r.ok) {
        this.player.anim.play('wave');
        this.player.say('Şükrü! Bir çay!', 2);
        setTimeout(() => { sukru.c.say(pickLine(SUKRU_LINES.noCredit), 3.2); sukru.c.anim.play('shrug'); }, 900);
        this.toast('Veresiye defteri doldu! Borcunu Şükrü\'ye öde ya da semaverde bulaşık yıka.');
        return;
      }
      if (r.onCredit > 0) setTimeout(() => sukru.c.say(pickLine(SUKRU_LINES.credit), 2.5), 2200);
    }
    this.world.teaRequests.push(target);
    this.player.anim.play('wave');
    this.player.say(forOther ? `Şükrü! ${forOther.c.name}'ya bir çay!` : 'Şükrü! Bir çay!', 2);
    sfx.play('pop');
    setTimeout(() => sukru.c.say(pickLine(['Geliyor abi!', 'Hemen abi!', 'Taze demledim, geliyor!']), 2), 900);
  }

  update(dt: number) {
    updateThrows(this.throwState, dt);
    for (const [k, v] of this.npcThrowCd) this.npcThrowCd.set(k, v - dt);
  }

  /** Oyuncu çay fırlatır (hedef verilmezse önündeki en yakın kişi). Başarılıysa true. */
  throwTea(target?: NPC): boolean {
    if (!this.teaEnabled()) { this.toast('Çay fırlatma ayarlardan kapalı.'); return false; }
    if (!canThrow(this.throwState)) { this.toast(`Biraz bekle... (${Math.ceil(this.throwState.cooldown)} sn)`); return false; }
    const t = target ?? this.targetInFront(4.5, 0.75) ?? this.nearestNpc(4.5);
    if (!t) { this.toast('Çay fırlatacak kimse yok.'); return false; }
    const holding = this.playerHasTea;
    if (this.economy) {
      const s = this.economy.s;
      const cost = throwCost(this.throwState, t.id, { tea: price(s, 'tea'), brokenGlass: price(s, 'brokenGlass') }, holding);
      const r = this.economy.tx((st) => playerPay(st, HOUSE, cost, true));
      if (!r.ok) { this.toast('Veresiye defteri dolu: çay fırlatamazsın! Önce borcunu öde.'); return false; }
      this.toast(`☕💥 ${t.c.name}'a çay! (${cost}🪙${r.onCredit ? `, ${r.onCredit}🪙 veresiye` : ''})`);
    }
    recordThrow(this.throwState, t.id);
    if (holding) this.setPlayerTea(false);
    this.launch(this.player, t.c, () => t.onTeaSplashed(this.player));
    return true;
  }

  /** NPC karşılık olarak çay fırlatır; bedeli kendi cüzdanından öder (parası yoksa sadece söylenir). */
  npcThrowTea(npc: NPC, target: Character): boolean {
    if (!this.teaEnabled() || (this.npcThrowCd.get(npc.id) ?? 0) > 0) return false;
    if (this.economy) {
      const s = this.economy.s;
      const cost = price(s, 'tea') + price(s, 'brokenGlass');
      if (balanceOf(s, npc.id) < cost) { npc.c.say('Param olsa sana bir çay atardım!', 2.5); return false; }
      this.economy.tx((st) => { st.balances[npc.id] = balanceOf(st, npc.id) - cost; });
    }
    this.npcThrowCd.set(npc.id, 6);
    this.launch(npc.c, target, () => {
      if (target === this.player) this.playerSplashed(npc.c);
      else this.npcs.find((n) => n.c === target)?.onTeaSplashed(npc.c);
    });
    return true;
  }

  /** Görsel çay fırlatma (çevrimiçi masada da kullanılır; para ve bekleme yok) */
  launch(from: Character, to: Character, onHit: () => void) {
    from.faceTowards(to.pos);
    from.anim.play('swing');
    sfx.play('whoosh');
    const start = new THREE.Vector3();
    from.model.handPropR.getWorldPosition(start);
    this.effects.teaProjectile(start, () => to.headWorld(), () => {
      const head = to.headWorld();
      sfx.play('glassBreak');
      sfx.play('splash');
      this.effects.teaSplash(head);
      splash(to.stain);
      to.anim.play('surprise');
      to.anim.hitImpulse(0.8);
      onHit();
    }, makeTeaGlass(false));
  }

  /** Oyuncuya çay isabet etti */
  onPlayerSplashed: (by: Character) => void = () => {};
  private playerSplashed(by: Character) {
    this.player.say(pickLine(['Aaa! Gözüm!', 'Sıcak sıcak!', 'Gömleğim gitti!']), 2);
    this.onPlayerSplashed(by);
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
