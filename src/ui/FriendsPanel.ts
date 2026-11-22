/** Arkadaşlar paneli: arkadaş kodun, arkadaş ekle, kim çevrimiçi, odasına katıl, masaya çağır. */
import { h, btn } from './dom';
import type { FriendsClient } from '../online/FriendsClient';

const KIND_TR: Record<string, string> = { kart: 'kart masasında', okey: 'okey masasında', tavla: 'tavla masasında' };

export class FriendsPanel {
  readonly el: HTMLDivElement;
  private me: HTMLDivElement;
  private list: HTMLDivElement;
  private shownCode: string | null = null;

  constructor(host: HTMLElement, private fc: FriendsClient, private hooks: { join(code: string): void; toast(m: string): void; close(): void }) {
    this.el = h('div', 'modal friends-modal');
    const b = h('div', 'panel friends-panel');
    this.el.appendChild(b);
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
    this.el.addEventListener('keydown', (e) => e.stopPropagation());
    // sabit iskelet (düğmeler yeniden çizilmez; tıklama kaybolmaz)
    b.appendChild(h('h2', '', '👥 Arkadaşlar'));
    this.me = h('div', 'fr-me');
    b.appendChild(this.me);
    const add = h('div', 'fr-add');
    const code = document.createElement('input');
    code.className = 'code-input fr-code-in'; code.maxLength = 6; code.placeholder = 'KOD';
    code.addEventListener('input', () => { code.value = code.value.toUpperCase().replace(/[^A-Z]/g, ''); });
    const name = document.createElement('input');
    name.className = 'fr-name-in'; name.maxLength = 16; name.placeholder = 'Adı (isteğe bağlı)';
    add.append(code, name, btn('➕ Ekle', 'small primary', () => {
      const err = fc.add(code.value, name.value);
      if (err) { this.hooks.toast(err); return; }
      this.hooks.toast('Eklendi. O da seni ekleyince çevrimiçi olduğunu görürsün.');
      code.value = ''; name.value = '';
    }));
    b.appendChild(add);
    this.list = h('div', 'fr-list');
    b.appendChild(this.list);
    const inv = h('label', 'row fr-invis');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = fc.invisible;
    cb.addEventListener('change', () => fc.setInvisible(cb.checked));
    inv.append(cb, document.createTextNode(' Görünmez ol (arkadaşlarım beni çevrimdışı görsün)'));
    b.appendChild(inv);
    b.appendChild(h('p', 'muted small', 'Yalnızca karşılıklı eklediğin arkadaşların seni görür ve masaya çağırabilir. Sunucuya yalnızca kodun ve takma adın gider.'));
    const close = btn('Kapat', 'primary', () => this.close());
    close.dataset.act = 'close';
    b.appendChild(close);
    host.appendChild(this.el);
    fc.onChange = () => this.update();
    fc.start();
    this.update();
  }

  close() {
    this.fc.onChange = () => {};
    this.el.remove();
    this.hooks.close();
  }

  private update() {
    this.renderMe();
    this.renderList();
  }

  private renderMe() {
    const fc = this.fc;
    const code = fc.me?.code ?? null;
    if (code && code === this.shownCode) return;
    this.shownCode = code;
    const me = this.me;
    me.innerHTML = '';
    if (!code) { me.appendChild(h('div', 'muted', fc.connected ? 'Kod alınıyor...' : 'Sunucuya bağlanılıyor...')); return; }
    me.appendChild(h('div', '', `<div class="muted small">Arkadaş kodun</div><div class="room-code fr-mycode">${code}</div>`));
    me.appendChild(btn('📋 Kopyala / paylaş', 'small accent', async () => {
      const text = `Kahvehane arkadaş kodum: ${code}`;
      try { if (navigator.share) await navigator.share({ title: 'Kahvehane', text }); else { await navigator.clipboard.writeText(code); this.hooks.toast('Kodun kopyalandı.'); } } catch { /* vazgeçti */ }
    }));
  }

  /** Liste: satırlar koda göre tutulur, yalnızca değişen satır yeniden yazılır */
  private renderList() {
    const fc = this.fc;
    const list = this.list;
    if (!fc.list.length) { list.innerHTML = '<p class="muted small">Henüz arkadaşın yok. Kodunu arkadaşına gönder, onunkini buraya ekle.</p>'; return; }
    list.querySelector('p')?.remove();
    const order = { online: 0, pending: 1, offline: 2 } as const;
    const rows = [...fc.list].sort((a, c) => order[fc.status.get(a.code)?.state ?? 'offline'] - order[fc.status.get(c.code)?.state ?? 'offline']);
    const keep = new Set(rows.map((f) => f.code));
    list.querySelectorAll<HTMLElement>('.fr-row').forEach((r) => { if (!keep.has(r.dataset.code!)) r.remove(); });
    rows.forEach((f, idx) => {
      const st = fc.status.get(f.code);
      const sig = JSON.stringify([f.name, st?.state, st?.name, st?.room, !!fc.inRoom]);
      let r = list.querySelector<HTMLElement>(`.fr-row[data-code="${f.code}"]`);
      if (!r || r.dataset.sig !== sig) {
        const nr = h('div', `fr-row ${st?.state ?? 'offline'}`);
        nr.dataset.code = f.code;
        nr.dataset.sig = sig;
        const where = st?.state === 'online' ? (st.room ? `🟢 ${KIND_TR[st.room.kind] ?? 'bir masada'}` : '🟢 çevrimiçi') : st?.state === 'pending' ? '⏳ seni henüz eklemedi' : '⚪ çevrimdışı';
        nr.appendChild(h('div', 'fr-info', `<b>${f.name}</b> <span class="muted small">${f.code}${st?.name && st.name !== f.name ? ` · ${st.name}` : ''}</span><div class="fr-where">${where}</div>`));
        const acts = h('div', 'fr-acts');
        if (st?.state === 'online' && st.room) { const j = btn('Katıl ▶', 'small primary', () => { this.close(); this.hooks.join(st.room!.code); }); j.dataset.act = 'join'; acts.appendChild(j); }
        if (st?.state === 'online' && fc.inRoom) { const c = btn('📣 Masaya çağır', 'small accent', () => { fc.invite(f.code); this.hooks.toast(`${f.name} masaya çağrıldı.`); }); c.dataset.act = 'invite'; acts.appendChild(c); }
        acts.appendChild(btn('✖', 'small ghost', () => fc.remove(f.code)));
        nr.appendChild(acts);
        if (r) r.replaceWith(nr); else list.appendChild(nr);
        r = nr;
      }
      if (list.children[idx] !== r) list.insertBefore(r, list.children[idx] ?? null);
    });
  }
}
