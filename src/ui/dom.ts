/** Küçük DOM yardımcıları */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html) el.innerHTML = html;
  return el;
}

export function btn(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = h('button', cls, label);
  b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return b;
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** Test/hızlandırma çarpanı: URL'de ?speed=8 → bot beklemeleri 8 kat kısalır. */
export const SPEED: number = (() => {
  try { const v = Number(new URLSearchParams(location.search).get('speed')); return v > 0 ? v : 1; } catch { return 1; }
})();

export function later(fn: () => void, msv: number): number {
  return window.setTimeout(fn, msv / SPEED);
}
