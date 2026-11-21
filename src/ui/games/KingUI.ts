/** King arayüzü: oyun (sözleşme) seçimi, koz seçimi, masa, el sonu ve maç tablosu. */
import * as K from '../../games/king/king';
import { decideContract, decideKingTrump, chooseKingCard } from '../../games/king/kingBot';
import { createRng } from '../../games/common/rng';
import { Suit } from '../../games/trick/trick';
import type { GameHost } from '../../tables/TableSession';
import { h, btn } from '../dom';
import { TrickUI, TrickSnapshot, suitHtml, SUIT_TR } from './TrickUI';

const REACT_LINES: Partial<Record<K.Contract, string[]>> = {
  rifki: ['Rıfkıyı bana mı yedirdin!', 'Kupa papazı bende kaldı, eyvah!'],
  kiz: ['Kızı aldım, ceza yazıldı...', 'Of, yine kız geldi!'],
  erkek: ['Papazı da yuttum, valeyi de!'],
  kupa: ['Kupalar hep bana geliyor!'],
};

export class KingUI extends TrickUI {
  s: K.KingState;
  private rng = createRng();
  private scoreOpen = false;

  constructor(host: GameHost, private opts: K.KingOptions) {
    super(host, 'king');
    this.s = K.newKing(opts, this.rng, 0);
    this.host.sfx('deal');
    this.render();
    this.pump();
  }

  protected snap(): TrickSnapshot {
    const s = this.s;
    const humanPlays = s.phase === 'play' && s.current === 0;
    return { hands: s.hands, current: s.phase === 'play' ? s.current : s.chooser, trick: s.trick, lastTrick: s.lastTrick, lastWinner: s.lastWinner, tricksWon: s.tricksWon, humanPlays, legal: humanPlays ? K.legalCards(s, 0) : [] };
  }

  private name(p: number) { return p === 0 ? 'Sen' : this.host.names[p]; }

  /** Bu elde şimdiye kadar yazılan ceza/puan (canlı) */
  private liveScore(p: number) {
    const s = this.s;
    if (!s.contract || s.phase === 'choose' || s.phase === 'trump') return 0;
    return K.scoreHand(s.contract, s.taken, s.tricksWon, s.sonIkiWinners)[p];
  }

  protected seatMeta(p: number) {
    const s = this.s;
    const live = this.liveScore(p);
    const parts: string[] = [];
    if (s.chooser === p) parts.push('<b>seçen</b>');
    if (live) parts.push(`<b class="${live < 0 ? 'neg' : 'pos'}">${live > 0 ? '+' : ''}${live}</b>`);
    return parts.join(' · ');
  }

  protected centerInfo() {
    const s = this.s;
    if (s.phase === 'choose') return `${this.name(s.chooser)} oyunu seçiyor`;
    if (s.phase === 'trump') return `${this.name(s.chooser)} kozu seçiyor`;
    if (!s.contract) return '';
    const meta = K.CONTRACT_META[s.contract];
    return `<b>${meta.label}</b>${s.contract === 'koz' && s.trump !== null ? ` ${suitHtml(s.trump)}` : ''}<br><small>${meta.desc}</small>`;
  }

  protected scoreBoard() {
    const s = this.s;
    const q = K.quotas(this.opts);
    return [0, 1, 2, 3].map((p) => `<div class="pside${p === 0 ? ' me' : ''}"><span class="nm">${this.name(p)}</span><b class="tot">${s.totals[p]}</b></div>`).join('')
      + `<div class="pel">El ${s.handNo}/${q.hands} · <a href="#" class="king-table-link">tablo</a></div>`;
  }

  protected render() {
    super.render();
    const link = this.info.querySelector('.king-table-link');
    link?.addEventListener('click', (e) => { e.preventDefault(); this.showTable(); });
  }

  protected humanPanel(): HTMLElement | null {
    const s = this.s;
    if (s.phase === 'choose' && s.chooser === 0) {
      const d = h('div', 'bid-panel');
      const q = K.quotas(this.opts);
      d.appendChild(h('div', 'tp-title', `Oyunu sen seçiyorsun · koz hakkın ${q.koz - s.kozChosen[0]}, ceza hakkın ${q.ceza - s.cezaChosen[0]}`));
      const row = h('div', 'tp-row contracts');
      const avail = K.availableContracts(s, 0);
      for (const c of ['koz', ...K.PENALTIES] as K.Contract[]) {
        const meta = K.CONTRACT_META[c];
        const left = c === 'koz' ? '' : ` <small>(${q.perPenalty - s.penaltyUses[c as K.Penalty]} kaldı)</small>`;
        const bb = btn(`${meta.label}${left}<br><small>${meta.desc}</small>`, `small contract${avail.includes(c) ? '' : ' disabled'}`, () => avail.includes(c) && this.doContract(c));
        bb.dataset.contract = c;
        row.appendChild(bb);
      }
      d.appendChild(row);
      return d;
    }
    if (s.phase === 'trump' && s.chooser === 0) {
      const d = h('div', 'bid-panel');
      d.appendChild(h('div', 'tp-title', 'Koz oyunu: kozu seç'));
      const row = h('div', 'tp-row');
      for (const su of [0, 1, 2, 3] as Suit[]) {
        const n = s.hands[0].filter((c) => c.suit === su).length;
        const bb = btn(`${suitHtml(su)} ${SUIT_TR[su]} <small>(${n})</small>`, 'small suit-btn', () => this.doTrump(su));
        bb.dataset.suit = String(su);
        row.appendChild(bb);
      }
      d.appendChild(row);
      return d;
    }
    return null;
  }

  protected statusText() {
    const s = this.s;
    if (s.phase === 'choose') return s.chooser === 0 ? '🟢 Bu eli sen seçiyorsun: koz ya da bir ceza.' : `⏳ ${this.name(s.chooser)} oyunu seçiyor...`;
    if (s.phase === 'trump') return s.chooser === 0 ? '🟢 Kozu seç.' : `⏳ ${this.name(s.chooser)} kozu seçiyor...`;
    if (s.phase !== 'play') return 'El bitti.';
    if (s.current !== 0) return `⏳ ${this.name(s.current)} oynuyor...`;
    const ct = s.contract!;
    const tip = ct === 'koz' ? 'Kozda eli al! Rengin yoksa koz atmalısın.' : ct === 'el' ? 'Hiç el alma!' : ct === 'sonIki' ? `Son iki eli alma! (${s.trickNo + 1}. el)` : `${K.CONTRACT_META[ct].label}: cezalı kartı alma, rengin yoksa başkasına at.`;
    return `🟢 ${tip}`;
  }

  protected blockedReason() {
    const s = this.s;
    if (!s.trick.length) return s.contract === 'koz' ? 'Koz açılmadan kozla açamazsın.' : 'Kupa açılmadan kupayla açamazsın.';
    const lead = s.trick[0].card.suit;
    if (s.hands[0].some((c) => c.suit === lead)) return 'Renge uymalısın.';
    return s.contract === 'koz' ? 'Rengin yok: koz atmalısın.' : 'Rıfkı elindeyken rengin yoksa kupa papazını atmalısın.';
  }

  protected botToAct(): number | null {
    const s = this.s;
    if (s.phase === 'choose' || s.phase === 'trump') return s.chooser === 0 ? null : s.chooser;
    if (s.phase === 'play') return s.current === 0 ? null : s.current;
    return null;
  }

  protected botStep(p: number) {
    const s = this.s;
    const v = K.viewKing(s, p);
    if (s.phase === 'choose') {
      const c = decideContract(v, this.rng, this.host.difficulty);
      K.chooseContract(s, p, c);
      this.host.react(p, 'think', `${K.CONTRACT_META[c].label}!`);
      this.host.sfx('click');
      this.after();
      return;
    }
    if (s.phase === 'trump') {
      const su = decideKingTrump(v);
      K.chooseTrump(s, p, su);
      this.host.react(p, 'happy', `Koz ${SUIT_TR[su].toLowerCase()}!`);
      this.after();
      return;
    }
    const r = K.playCard(s, p, chooseKingCard(v, this.rng, this.host.difficulty));
    this.host.sfx('card');
    this.onTrick(r);
  }

  private onTrick(r: K.PlayResult) {
    const s = this.s;
    if (r.trickDone && r.winner !== null && s.contract && s.contract !== 'koz') {
      const last = s.lastTrick!;
      const pen = last.reduce((a, t) => a + K.cardPenalty(t.card, s.contract!), 0);
      if ((pen >= 100 || (s.contract === 'el' && Math.random() < 0.15)) && r.winner !== 0) {
        const lines = REACT_LINES[s.contract];
        this.host.react(r.winner, 'angry', lines ? lines[Math.floor(Math.random() * lines.length)] : undefined);
      }
      if (s.contract === 'rifki' && pen >= 320) this.splash(`RIFKI! ${r.winner === 0 ? 'Sana' : this.name(r.winner)} −320`);
    }
    this.after(r.trickDone);
  }

  private doContract(c: K.Contract) {
    try { K.chooseContract(this.s, 0, c); this.host.sfx('click'); } catch (e) { this.host.toast((e as Error).message); return; }
    this.after();
  }

  private doTrump(su: Suit) {
    try { K.chooseTrump(this.s, 0, su); this.host.sfx('card'); } catch (e) { this.host.toast((e as Error).message); return; }
    this.after();
  }

  protected humanPlay(id: number) {
    let r: K.PlayResult;
    try { r = K.playCard(this.s, 0, id); } catch (e) { this.host.toast((e as Error).message); return; }
    this.host.sfx('card');
    this.onTrick(r);
  }

  protected handOver() { return this.s.phase === 'handOver' || this.s.phase === 'matchOver'; }

  /** Maç tablosu: oynanan eller ve kalan haklar */
  private tableHtml() {
    const s = this.s;
    const names = [0, 1, 2, 3].map((p) => this.name(p));
    const rows = s.history.map((hh) => `<tr><td>${hh.handNo}</td><td>${names[hh.chooser]}</td><td>${K.CONTRACT_META[hh.contract].label}${hh.trump !== null ? ' ' + suitHtml(hh.trump) : ''}</td>${hh.scores.map((x) => `<td class="${x < 0 ? 'neg' : x > 0 ? 'pos' : ''}">${x || ''}</td>`).join('')}</tr>`).join('');
    const q = K.quotas(this.opts);
    const left = K.PENALTIES.map((p) => `${K.CONTRACT_META[p].label} ${q.perPenalty - s.penaltyUses[p]}`).join(' · ');
    return `<table class="score king-score"><tr><th>#</th><th>Seçen</th><th>Oyun</th>${names.map((n) => `<th>${n}</th>`).join('')}</tr>${rows}
      <tr class="me"><td></td><td></td><td><b>Toplam</b></td>${s.totals.map((t) => `<td><b>${t}</b></td>`).join('')}</tr></table>
      <p class="muted">Kalan cezalar: ${left}</p>`;
  }

  private showTable() {
    if (this.scoreOpen) return;
    this.scoreOpen = true;
    const m = h('div', 'modal');
    m.innerHTML = `<div class="panel"><h3>King tablosu</h3>${this.tableHtml()}</div>`;
    const row = h('div', 'row-btns');
    row.appendChild(btn('Kapat', 'primary', () => { m.remove(); this.scoreOpen = false; }));
    m.querySelector('.panel')!.appendChild(row);
    this.el.appendChild(m);
  }

  protected onHandEnd() {
    const s = this.s;
    const last = s.history[s.history.length - 1];
    const names = [0, 1, 2, 3].map((p) => this.name(p));
    const over = s.phase === 'matchOver';
    const winners = K.matchWinners(s);
    const mine = winners.includes(0);
    const m = h('div', 'modal');
    m.innerHTML = `<div class="panel"><h3>${K.CONTRACT_META[last.contract].label} bitti</h3>
      <p>${last.scores.map((x, p) => `${names[p]}: <b class="${x < 0 ? 'neg' : x > 0 ? 'pos' : ''}">${x > 0 ? '+' : ''}${x}</b>`).join(' · ')}</p>
      ${this.tableHtml()}
      ${over ? `<h3>${mine ? '🏆 King\'i KAZANDIN!' : `🏆 King'i ${winners.map((w) => names[w]).join(' & ')} kazandı`}</h3>` : ''}</div>`;
    const row = h('div', 'row-btns');
    if (!over) row.appendChild(btn('Sonraki el ▶', 'primary', () => { m.remove(); K.nextHand(s, this.rng); this.host.sfx('deal'); this.render(); this.pump(); }));
    else {
      this.host.matchFinished(mine);
      row.appendChild(btn('Yeni maç', 'primary', () => { m.remove(); this.s = K.newKing(this.opts, this.rng, 0); this.host.sfx('deal'); this.render(); this.pump(); }));
    }
    row.appendChild(btn('Masadan kalk', 'ghost', () => this.host.exit()));
    m.querySelector('.panel')!.appendChild(row);
    this.el.appendChild(m);
    // en çok ceza yiyen sinirlenir
    const worst = last.scores.indexOf(Math.min(...last.scores));
    if (last.contract !== 'koz' && worst !== 0 && last.scores[worst] < 0) this.host.react(worst, 'lose');
  }
}
