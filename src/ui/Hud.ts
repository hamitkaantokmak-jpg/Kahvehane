/** Serbest dolaşma arayüzü: etkileşim ipucu, mobil düğmeler, emote menüsü, bildirimler, duraklatma ve ayarlar. */
import { Input } from '../core/Input';
import { EMOTES, EmoteId } from '../interactions/Social';
import { Settings } from '../save/Settings';

export class Hud {
  readonly root: HTMLDivElement;
  private prompt: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private emoteMenu: HTMLDivElement;
  private pauseEl: HTMLDivElement;
  private mobileBtns: HTMLDivElement;
  private help: HTMLDivElement;
  private toastTimer = 0;
  onEmote: (id: EmoteId) => void = () => {};
  onSettings: (s: Settings) => void = () => {};
  onResume: () => void = () => {};
  paused = false;

  constructor(parent: HTMLElement, private input: Input, private settings: Settings) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    parent.appendChild(this.root);
    this.root.innerHTML = `
      <div class="title-badge">☕ KAHVEHANE</div>
      <div class="help" id="help">
        <b>WASD</b> yürü · <b>Shift</b> koş · <b>Fare</b> kamera (tıkla/sürükle) · <b>E</b> etkileşim / otur<br/>
        <b>F</b> ıstakayla şaplak · <b>Q</b> hareketler · <b>1-7</b> hızlı hareket · <b>T</b> çay iste · <b>Esc</b> menü
        <span class="help-close">✕</span>
      </div>
      <div class="prompt" id="prompt"></div>
      <div class="toast" id="toast"></div>
      <div class="emote-menu" id="emoteMenu"></div>
      <div class="mobile-btns" id="mobileBtns">
        <button data-a="emoteMenu" class="mb small">😀</button>
        <button data-a="tea" class="mb small">🍵</button>
        <button data-a="bonk" class="mb">🏏<small>Istaka</small></button>
        <button data-a="interact" class="mb big">✋<small>Etkileşim</small></button>
      </div>
      <button class="menu-btn" id="menuBtn" title="Menü">☰</button>
      <div class="pause" id="pause"></div>`;
    this.prompt = this.root.querySelector('#prompt')!;
    this.toastEl = this.root.querySelector('#toast')!;
    this.emoteMenu = this.root.querySelector('#emoteMenu')!;
    this.pauseEl = this.root.querySelector('#pause')!;
    this.mobileBtns = this.root.querySelector('#mobileBtns')!;
    this.help = this.root.querySelector('#help')!;
    this.root.querySelector('.help-close')!.addEventListener('click', () => (this.help.style.display = 'none'));
    if (input.isTouch) { this.help.innerHTML = 'Sol: hareket (uzağa çek = koş) · Sağ: kamera · ✋ etkileşim · 🏏 ıstaka · 😀 hareketler <span class="help-close">✕</span>'; this.help.querySelector('.help-close')!.addEventListener('click', () => (this.help.style.display = 'none')); }
    this.mobileBtns.style.display = input.isTouch ? 'flex' : 'none';
    this.mobileBtns.querySelectorAll('button').forEach((b) => {
      const fire = (e: Event) => { e.preventDefault(); e.stopPropagation(); input.trigger((b as HTMLButtonElement).dataset.a as never); };
      b.addEventListener('touchstart', fire, { passive: false });
      b.addEventListener('click', fire);
    });
    this.root.querySelector('#menuBtn')!.addEventListener('click', () => input.trigger('menu'));
    for (const e of EMOTES) {
      const b = document.createElement('button');
      b.innerHTML = `<span class="ei">${e.icon}</span>${e.label}<kbd>${e.key}</kbd>`;
      b.addEventListener('click', () => { this.toggleEmotes(false); this.onEmote(e.id); });
      this.emoteMenu.appendChild(b);
    }
    setTimeout(() => (this.help.style.opacity = '0.75'), 9000);
  }

  setVisible(v: boolean) {
    this.root.classList.toggle('hidden-explore', !v);
  }

  setPrompt(text: string | null) {
    if (!text) { this.prompt.style.display = 'none'; return; }
    this.prompt.style.display = 'block';
    this.prompt.innerHTML = this.input.isTouch ? text.replace(/^\[E\]\s*/, '✋ ') : text.replace(/^\[E\]/, '<kbd>E</kbd>');
  }

  toast(msg: string, seconds = 2.8) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), seconds * 1000);
  }

  toggleEmotes(force?: boolean) {
    const show = force ?? !this.emoteMenu.classList.contains('show');
    this.emoteMenu.classList.toggle('show', show);
  }

  showPause(show: boolean, stats?: string) {
    this.paused = show;
    if (!show) { this.pauseEl.classList.remove('show'); return; }
    const s = this.settings;
    this.pauseEl.innerHTML = `
      <div class="panel">
        <h2>☕ Mola</h2>
        <label>Ana ses <input type="range" min="0" max="1" step="0.05" data-k="master" value="${s.master}"></label>
        <label>Efektler <input type="range" min="0" max="1" step="0.05" data-k="sfx" value="${s.sfx}"></label>
        <label>Ortam uğultusu <input type="range" min="0" max="1" step="0.05" data-k="ambience" value="${s.ambience}"></label>
        <label class="row"><input type="checkbox" data-k="muted" ${s.muted ? 'checked' : ''}> Sesi kapat</label>
        <label>Grafik kalitesi
          <select data-k="quality">
            <option value="low" ${s.quality === 'low' ? 'selected' : ''}>Düşük (mobil)</option>
            <option value="medium" ${s.quality === 'medium' ? 'selected' : ''}>Orta</option>
            <option value="high" ${s.quality === 'high' ? 'selected' : ''}>Yüksek</option>
          </select></label>
        <label>Fare hassasiyeti <input type="range" min="0.3" max="2.5" step="0.1" data-k="sensitivity" value="${s.sensitivity}"></label>
        <label class="row"><input type="checkbox" data-k="invertY" ${s.invertY ? 'checked' : ''}> Kamerayı ters çevir (Y)</label>
        ${stats ? `<div class="stats">${stats}</div>` : ''}
        <button class="primary" id="resume">Devam et</button>
      </div>`;
    this.pauseEl.classList.add('show');
    this.pauseEl.querySelectorAll('[data-k]').forEach((el) => {
      el.addEventListener('input', () => {
        const k = (el as HTMLInputElement).dataset.k as keyof Settings;
        const inp = el as HTMLInputElement;
        const v = inp.type === 'checkbox' ? inp.checked : inp.tagName === 'SELECT' ? inp.value : Number(inp.value);
        (this.settings as unknown as Record<string, unknown>)[k] = v;
        this.onSettings(this.settings);
      });
    });
    this.pauseEl.querySelector('#resume')!.addEventListener('click', () => this.onResume());
  }
}
