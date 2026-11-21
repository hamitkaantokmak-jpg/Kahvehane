/**
 * Karakter oluşturucu paneli (DOM). Mantık ve seçenekler saf modülde: characters/creator.ts.
 * Her değişiklik oyuncunun modelini canlı olarak yeniden kurar (önizleme oyunun kendisidir).
 */
import type { CharacterSpec, Accessory } from '../characters/CharacterSpec';
import * as C from '../characters/creator';
import type { Rng } from '../games/common/rng';
import { h, btn } from './dom';

export interface CreatorHooks {
  /** Önizleme: modeli bu görünüşle yeniden kur */
  preview(spec: CharacterSpec): void;
  /** Kaydet ve kapat */
  save(spec: CharacterSpec): void;
  /** Vazgeç (eski görünüşe dön) ve kapat */
  cancel(original: CharacterSpec): void;
  /** Karakteri döndür (radyan) */
  rotate(d: number): void;
  /** Ses denemesi */
  sayTest(spec: CharacterSpec): void;
  rng: Rng;
}

type Tab = 'face' | 'hair' | 'body' | 'outfit' | 'voice';
const TABS: [Tab, string][] = [['face', 'Yüz'], ['hair', 'Saç'], ['body', 'Beden'], ['outfit', 'Kıyafet'], ['voice', 'Ses']];

export class CharacterCreator {
  readonly el: HTMLDivElement;
  spec: CharacterSpec;
  private original: CharacterSpec;
  private tab: Tab = 'face';
  private body!: HTMLDivElement;
  private pending = 0;

  constructor(parent: HTMLElement, start: CharacterSpec, private hooks: CreatorHooks, private firstTime = false) {
    this.spec = C.sanitizeSpec(start);
    this.original = this.spec;
    this.el = h('div', 'creator');
    parent.appendChild(this.el);
    this.build();
  }

  close() { cancelAnimationFrame(this.pending); this.el.remove(); }

  /** Değişikliği uygula ve önizlemeyi (karede bir) güncelle */
  set(next: CharacterSpec, rerender = true) {
    this.spec = C.sanitizeSpec(next);
    cancelAnimationFrame(this.pending);
    this.pending = requestAnimationFrame(() => this.hooks.preview(this.spec));
    if (rerender) this.renderBody();
  }

  private build() {
    const panel = h('div', 'cr-panel panel');
    panel.appendChild(h('h2', '', this.firstTime ? '👤 Karakterini oluştur' : '👤 Karakterin'));
    const nameRow = h('label', 'cr-name', 'Adın');
    const name = document.createElement('input');
    name.type = 'text';
    name.maxLength = C.NAME_MAX;
    name.placeholder = 'Takma adın';
    name.value = this.spec.name === 'Sen' ? '' : this.spec.name;
    name.addEventListener('input', () => { this.spec = { ...this.spec, name: C.sanitizeName(name.value) }; });
    name.addEventListener('keydown', (e) => e.stopPropagation());
    nameRow.appendChild(name);
    panel.appendChild(nameRow);
    const tabs = h('div', 'cr-tabs');
    for (const [id, label] of TABS) {
      const b = btn(label, `small${id === this.tab ? ' accent' : ''}`, () => { this.tab = id; tabs.querySelectorAll('button').forEach((x) => x.classList.remove('accent')); b.classList.add('accent'); this.renderBody(); });
      b.dataset.tab = id;
      tabs.appendChild(b);
    }
    panel.appendChild(tabs);
    this.body = h('div', 'cr-body');
    panel.appendChild(this.body);
    const tools = h('div', 'cr-tools');
    tools.appendChild(btn('⟲', 'small', () => this.hooks.rotate(-0.6)));
    tools.appendChild(btn('🎲 Rastgele', 'small', () => this.set(C.randomSpec(this.hooks.rng, this.spec.name))));
    tools.appendChild(btn('⟳', 'small', () => this.hooks.rotate(0.6)));
    panel.appendChild(tools);
    const row = h('div', 'row-btns');
    row.appendChild(btn(this.firstTime ? 'Hazır karakterle başla' : 'Vazgeç', 'ghost', () => this.hooks.cancel(this.original)));
    row.appendChild(btn('Kaydet ✔', 'primary', () => this.hooks.save(C.sanitizeSpec({ ...this.spec, name: C.sanitizeName(name.value) }))));
    panel.appendChild(row);
    this.el.appendChild(panel);
    this.renderBody();
  }

  // ------------------------------------------------------------ kontrol yapıcıları
  private section(title: string) {
    const s = h('div', 'cr-sec');
    s.appendChild(h('div', 'cr-title', title));
    this.body.appendChild(s);
    return s;
  }

  private chips<T>(title: string, list: C.Choice<T>[], current: T, onPick: (v: T) => void, key: string) {
    const s = this.section(title);
    const row = h('div', 'cr-chips');
    row.dataset.key = key;
    for (const c of list) {
      const b = btn(c.label, `chip${c.value === current ? ' on' : ''}`, () => onPick(c.value));
      b.dataset.v = String(c.value);
      row.appendChild(b);
    }
    s.appendChild(row);
  }

  private swatches(title: string, list: (number | null)[], current: number | null, onPick: (v: number | null) => void, key: string) {
    const s = this.section(title);
    const row = h('div', 'cr-swatches');
    row.dataset.key = key;
    for (const c of list) {
      const b = btn(c === null ? '✕' : '', `sw${c === current ? ' on' : ''}${c === null ? ' none' : ''}`, () => onPick(c));
      if (c !== null) b.style.background = C.hex(c);
      b.title = c === null ? 'Yok' : C.hex(c);
      b.dataset.v = c === null ? 'none' : String(c);
      row.appendChild(b);
    }
    s.appendChild(row);
  }

  private slider(k: C.SliderKey) {
    const d = C.SLIDERS[k];
    const s = this.section(d.label);
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = String(d.min); inp.max = String(d.max); inp.step = String(d.step);
    inp.value = String(this.spec[k]);
    inp.dataset.key = k;
    inp.addEventListener('input', () => this.set({ ...this.spec, [k]: Number(inp.value) }, false));
    s.appendChild(inp);
  }

  private toggles(title: string, list: C.Choice<Accessory>[]) {
    const s = this.section(title);
    const row = h('div', 'cr-chips');
    row.dataset.key = 'extras';
    for (const c of list) {
      const on = this.spec.accessories.includes(c.value);
      const b = btn(`${on ? '✔ ' : ''}${c.label}`, `chip${on ? ' on' : ''}`, () => this.set(C.toggleExtra(this.spec, c.value)));
      b.dataset.v = c.value;
      row.appendChild(b);
    }
    s.appendChild(row);
  }

  private renderBody() {
    const sp = this.spec;
    this.body.innerHTML = '';
    const set = (patch: Partial<CharacterSpec>) => this.set({ ...sp, ...patch });
    switch (this.tab) {
      case 'face':
        this.swatches('Ten rengi', C.SKIN_COLORS, sp.skin, (v) => set({ skin: v! }), 'skin');
        this.chips('Kafa şekli', C.HEAD_SHAPES, sp.headShape, (v) => set({ headShape: v }), 'headShape');
        this.slider('headSize');
        this.chips('Burun', C.NOSE_SHAPES, sp.noseShape, (v) => set({ noseShape: v }), 'noseShape');
        this.slider('noseSize');
        this.slider('eyebrows');
        this.toggles('Gözlük', C.EXTRAS.filter((e) => e.value === 'glasses'));
        break;
      case 'hair':
        this.chips('Saç', C.HAIRS, sp.hair, (v) => set({ hair: v }), 'hair');
        this.swatches('Saç ve bıyık rengi', C.HAIR_COLORS, sp.hairColor, (v) => set({ hairColor: v! }), 'hairColor');
        this.chips('Bıyık', C.MUSTACHES, sp.mustache, (v) => set({ mustache: v }), 'mustache');
        this.chips('Şapka', C.HATS, C.slotValue(sp, 'hat'), (v) => this.set(C.setSlot(sp, 'hat', v)), 'hat');
        break;
      case 'body':
        this.slider('height');
        this.slider('belly');
        this.slider('legLength');
        break;
      case 'outfit': {
        this.swatches('Gömlek', C.SHIRT_COLORS, sp.shirt, (v) => set({ shirt: v! }), 'shirt');
        this.swatches('Ceket', C.JACKET_COLORS, sp.jacket ?? null, (v) => this.set(C.sanitizeSpec({ ...sp, jacket: v })), 'jacket');
        this.swatches('Pantolon', C.PANTS_COLORS, sp.pants, (v) => set({ pants: v! }), 'pants');
        this.chips('Boyun', C.NECKS, C.slotValue(sp, 'neck'), (v) => this.set(C.setSlot(sp, 'neck', v)), 'neck');
        this.toggles('Ekstralar', C.EXTRAS.filter((e) => e.value !== 'glasses'));
        const s = this.section('Hazır kıyafet (kahvehane tipleri)');
        const row = h('div', 'cr-chips');
        row.dataset.key = 'template';
        for (const t of C.TEMPLATES) { const b = btn(t.label, 'chip', () => this.set(C.applyTemplate(this.spec, t.value))); b.dataset.v = t.value; row.appendChild(b); }
        s.appendChild(row);
        break;
      }
      case 'voice': {
        this.slider('voicePitch');
        const s = this.section('Dene');
        s.appendChild(btn('🔊 Bir laf et', 'small', () => this.hooks.sayTest(this.spec)));
        break;
      }
    }
  }
}
