/** Karakterlerin üstünde DOM konuşma balonları (3D konumdan ekrana izdüşüm). */
import * as THREE from 'three';
import { Character, BubbleHost } from '../characters/Character';

interface Bubble { el: HTMLDivElement; c: Character; until: number }

export class Bubbles implements BubbleHost {
  private layer: HTMLDivElement;
  private items: Bubble[] = [];
  private v = new THREE.Vector3();
  constructor(parent: HTMLElement, private camera: THREE.Camera) {
    this.layer = document.createElement('div');
    this.layer.className = 'bubble-layer';
    parent.appendChild(this.layer);
  }
  /** Konuşma kancası (NPC sesi, ağız hareketi) */
  onSay: ((c: Character, text: string, seconds: number) => void) | null = null;

  say(c: Character, text: string, seconds = 3) {
    this.onSay?.(c, text, seconds);
    let b = this.items.find((x) => x.c === c);
    if (!b) {
      const el = document.createElement('div');
      el.className = 'bubble';
      this.layer.appendChild(el);
      b = { el, c, until: 0 };
      this.items.push(b);
    }
    b.el.innerHTML = `<b>${c.name}</b><span></span>`;
    (b.el.querySelector('span') as HTMLSpanElement).textContent = text;
    b.el.classList.remove('pop');
    void b.el.offsetWidth;
    b.el.classList.add('pop');
    b.until = performance.now() + seconds * 1000;
  }
  update() {
    const now = performance.now();
    const w = this.layer.clientWidth, h = this.layer.clientHeight;
    for (const b of this.items) {
      if (now > b.until) { b.el.style.display = 'none'; continue; }
      b.c.headWorld(this.v);
      this.v.y += b.c.spec.headSize * 1.6 + 0.15;
      this.v.project(this.camera);
      if (this.v.z > 1 || this.v.z < -1) { b.el.style.display = 'none'; continue; }
      b.el.style.display = 'block';
      const sx = ((this.v.x + 1) / 2) * w, sy = ((1 - this.v.y) / 2) * h;
      if (sx < -w * 0.15 || sx > w * 1.15 || sy < -h * 0.2 || sy > h * 1.1) { b.el.style.display = 'none'; continue; }
      const bw = b.el.offsetWidth, bh = b.el.offsetHeight;
      const x = Math.max(bw / 2 + 4, Math.min(w - bw / 2 - 4, ((this.v.x + 1) / 2) * w));
      const y = Math.max(bh + 4, Math.min(h - 4, ((1 - this.v.y) / 2) * h));
      b.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    }
    this.items = this.items.filter((b) => {
      if (now > b.until + 5000) { b.el.remove(); return false; }
      return true;
    });
  }
  clear() {
    for (const b of this.items) b.el.remove();
    this.items = [];
  }
}
