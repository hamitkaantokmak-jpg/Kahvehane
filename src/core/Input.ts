/**
 * Birleşik giriş: klavye + fare (pointer lock / sürükleme) + dokunmatik (sanal joystick, kamera sürükleme).
 */
export type Action =
  | 'interact' | 'bonk' | 'menu' | 'tea' | 'throwTea' | 'emote1' | 'emote2' | 'emote3' | 'emote4' | 'emote5' | 'emote6' | 'emote7' | 'emote8' | 'emoteMenu' | 'creator';

const KEY_ACTIONS: Record<string, Action> = {
  KeyE: 'interact', KeyF: 'bonk', Escape: 'menu', KeyT: 'tea', KeyQ: 'emoteMenu',
  Digit1: 'emote1', Digit2: 'emote2', Digit3: 'emote3', Digit4: 'emote4', Digit5: 'emote5', Digit6: 'emote6', Digit7: 'emote7', Digit8: 'emote8', KeyG: 'throwTea', KeyC: 'creator',
};

export class Input {
  private keys = new Set<string>();
  private actions: Action[] = [];
  lookDX = 0;
  lookDY = 0;
  zoom = 0;
  /** dokunmatik joystick (-1..1) */
  joyX = 0;
  joyY = 0;
  joyRun = false;
  enabled = true;
  pointerLocked = false;
  isTouch = false;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private joyId: number | null = null;
  private lookId: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private joyEl: HTMLDivElement;
  private joyKnob: HTMLDivElement;

  constructor(canvas: HTMLCanvasElement, overlay: HTMLElement) {
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      this.keys.add(e.code);
      const a = KEY_ACTIONS[e.code];
      if (a && !e.repeat) this.actions.push(a);
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      this.dragging = true;
      this.lastX = e.clientX; this.lastY = e.clientY;
      if (e.button === 0 && !this.isTouch && !this.pointerLocked && this.wantPointerLock) canvas.requestPointerLock?.();
    });
    window.addEventListener('mouseup', () => (this.dragging = false));
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.pointerLocked) { this.lookDX += e.movementX; this.lookDY += e.movementY; }
      else if (this.dragging) {
        this.lookDX += e.clientX - this.lastX; this.lookDY += e.clientY - this.lastY;
        this.lastX = e.clientX; this.lastY = e.clientY;
      }
    });
    canvas.addEventListener('wheel', (e) => { this.zoom += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    document.addEventListener('pointerlockchange', () => { this.pointerLocked = document.pointerLockElement === canvas; });

    // sanal joystick
    this.joyEl = document.createElement('div');
    this.joyEl.className = 'joystick';
    this.joyKnob = document.createElement('div');
    this.joyKnob.className = 'joystick-knob';
    this.joyEl.appendChild(this.joyKnob);
    overlay.appendChild(this.joyEl);
    canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    canvas.addEventListener('touchend', (e) => this.onTouchEnd(e));
    canvas.addEventListener('touchcancel', (e) => this.onTouchEnd(e));
  }

  wantPointerLock = true;

  private onTouchStart(e: TouchEvent) {
    this.isTouch = true;
    if (!this.enabled) return;
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.clientX < window.innerWidth * 0.45 && this.joyId === null) {
        this.joyId = t.identifier;
        this.joyOrigin = { x: t.clientX, y: t.clientY };
        this.joyEl.style.display = 'block';
        this.joyEl.style.left = `${t.clientX}px`;
        this.joyEl.style.top = `${t.clientY}px`;
        this.joyKnob.style.transform = 'translate(-50%,-50%)';
      } else if (this.lookId === null) {
        this.lookId = t.identifier;
        this.lastX = t.clientX; this.lastY = t.clientY;
      }
    }
  }
  private onTouchMove(e: TouchEvent) {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.joyId) {
        const dx = t.clientX - this.joyOrigin.x, dy = t.clientY - this.joyOrigin.y;
        const r = 55;
        const d = Math.min(1, Math.hypot(dx, dy) / r);
        const a = Math.atan2(dy, dx);
        this.joyX = Math.cos(a) * d;
        this.joyY = Math.sin(a) * d;
        this.joyRun = Math.hypot(dx, dy) > r * 1.25;
        this.joyKnob.style.transform = `translate(calc(-50% + ${this.joyX * r}px), calc(-50% + ${this.joyY * r}px))`;
      } else if (t.identifier === this.lookId) {
        this.lookDX += (t.clientX - this.lastX) * 1.4;
        this.lookDY += (t.clientY - this.lastY) * 1.4;
        this.lastX = t.clientX; this.lastY = t.clientY;
      }
    }
  }
  private onTouchEnd(e: TouchEvent) {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.joyId) {
        this.joyId = null; this.joyX = 0; this.joyY = 0; this.joyRun = false;
        this.joyEl.style.display = 'none';
      } else if (t.identifier === this.lookId) this.lookId = null;
    }
  }

  trigger(a: Action) { this.actions.push(a); }

  consumeActions(): Action[] {
    const a = this.actions;
    this.actions = [];
    return this.enabled ? a : a.filter((x) => x === 'menu');
  }

  consumeLook(): { dx: number; dy: number; zoom: number } {
    const r = { dx: this.lookDX, dy: this.lookDY, zoom: this.zoom };
    this.lookDX = this.lookDY = this.zoom = 0;
    return r;
  }

  /** Hareket vektörü: x sağ, y ileri */
  moveVector(): { x: number; y: number; run: boolean } {
    if (!this.enabled) return { x: 0, y: 0, run: false };
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.joyRun;
    if (this.joyX || this.joyY) { x = this.joyX; y = -this.joyY; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y, run };
  }

  releasePointer() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
}
