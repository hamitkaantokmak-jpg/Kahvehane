/** İhaleli Batak arayüzü (tekli / eşli): ihale paneli, koz seçimi, masa, el sonu tablosu. */
import * as B from '../../games/batak/batak';
import { decideBid, decideTrump, chooseBatakCard } from '../../games/batak/batakBot';
import { createRng } from '../../games/common/rng';
import { Suit } from '../../games/trick/trick';
import type { GameHost } from '../../tables/TableSession';
import { h, btn } from '../dom';
import { TrickUI, TrickSnapshot, suitHtml, SUIT_TR } from './TrickUI';

export class BatakUI extends TrickUI {
  s: B.BatakState;
  private rng = createRng();

  constructor(host: GameHost, private opts: B.BatakOptions) {
    super(host, 'batak');
    this.s = B.newBatak(opts, this.rng);
    this.host.sfx('deal');
    this.render();
    this.pump();
  }

  protected snap(): TrickSnapshot {
    const s = this.s;
    const humanPlays = s.phase === 'play' && s.current === 0;
    return { hands: s.hands, current: s.current, trick: s.trick, lastTrick: s.lastTrick, lastWinner: s.lastWinner, tricksWon: s.tricksWon, humanPlays, legal: humanPlays ? B.legalCards(s, 0) : [] };
  }

  private name(p: number) { return p === 0 ? 'Sen' : this.host.names[p]; }
  private teamName(t: number) { return t === 0 ? `Sen & ${this.host.names[2]}` : `${this.host.names[1]} & ${this.host.names[3]}`; }

  protected seatMeta(p: number) {
    const s = this.s;
    const b = s.bids[p];
    const parts: string[] = [];
    if (s.bidder === p && s.phase !== 'bid') parts.push(`<b>İhale ${s.highBid}</b>`);
    else if (s.phase === 'bid') parts.push(b === null ? '' : b === 'pass' ? 'pas' : `${b}`);
    if (this.opts.partners && p === 2) parts.push('ortak');
    return parts.filter(Boolean).join(' · ');
  }

  protected centerInfo() {
    const s = this.s;
    if (s.phase === 'bid') return s.highBid ? `İhale: <b>${s.highBid}</b> (${this.name(s.bidder!)})` : 'İhale';
    if (s.phase === 'trump') return `${this.name(s.bidder!)} kozu seçiyor`;
    return s.trump !== null ? `Koz ${suitHtml(s.trump)}<br><small>${this.name(s.bidder!)} ${s.highBid}</small>` : '';
  }

  protected scoreBoard() {
    const s = this.s;
    if (this.opts.partners) return [0, 1].map((t) => `<div class="pside${t === 0 ? ' me' : ''}"><span class="nm">${this.teamName(t)}</span><b class="tot">${s.totals[t]}</b></div>`).join('') + `<div class="pel">El ${s.handNo}/${this.opts.hands}</div>`;
    return [0, 1, 2, 3].map((p) => `<div class="pside${p === 0 ? ' me' : ''}"><span class="nm">${this.name(p)}</span><b class="tot">${s.totals[p]}</b></div>`).join('') + `<div class="pel">El ${s.handNo}/${this.opts.hands}</div>`;
  }

  protected humanPanel(): HTMLElement | null {
    const s = this.s;
    if (s.phase === 'bid' && s.current === 0) {
      const d = h('div', 'bid-panel');
      d.appendChild(h('div', 'tp-title', `İhale ver (en az ${B.minBid(this.opts)})`));
      const row = h('div', 'tp-row');
      for (const b of B.legalBids(s, 0)) {
        const bb = btn(b === 'pass' ? 'Pas' : String(b), `small${b === 'pass' ? ' ghost-dark' : ''}`, () => this.doBid(b as number | 'pass'));
        bb.dataset.bid = String(b);
        row.appendChild(bb);
      }
      d.appendChild(row);
      return d;
    }
    if (s.phase === 'trump' && s.bidder === 0) {
      const d = h('div', 'bid-panel');
      d.appendChild(h('div', 'tp-title', `İhale sende (${s.highBid}). Kozu seç:`));
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
    if (s.phase === 'bid') return s.current === 0 ? '🟢 İhale sırası sende: kaç el alırsın?' : `⏳ ${this.name(s.current)} ihaleyi düşünüyor...`;
    if (s.phase === 'trump') return s.bidder === 0 ? '🟢 Kozu seç.' : `⏳ ${this.name(s.bidder!)} kozu seçiyor...`;
    if (s.phase !== 'play') return 'El bitti.';
    if (s.current === 0) return s.trick.length ? '🟢 Renge uy; alabiliyorsan yükselt. Rengin yoksa koz at.' : `🟢 Açış sende.${s.trumpBroken ? '' : ' Koz açılmadan kozla açamazsın.'}`;
    return `⏳ ${this.name(s.current)} oynuyor...`;
  }

  protected blockedReason() {
    const s = this.s;
    if (!s.trick.length) return 'Koz açılmadan kozla açamazsın.';
    const lead = s.trick[0].card.suit;
    if (s.hands[0].some((c) => c.suit === lead)) return 'Renge uymalısın; alabiliyorsan büyük kartı atmalısın.';
    return 'Rengin yok: koz atmalısın (ortada koz varsa büyüğünü).';
  }

  protected botToAct(): number | null {
    const s = this.s;
    if (s.phase === 'bid' || s.phase === 'play') return s.current === 0 ? null : s.current;
    if (s.phase === 'trump') return s.bidder === 0 ? null : s.bidder;
    return null;
  }

  protected botStep(p: number) {
    const s = this.s;
    const v = B.viewBatak(s, p);
    if (s.phase === 'bid') {
      const b = decideBid(v, this.rng, this.host.difficulty);
      B.bid(s, p, b as number | 'pass');
      this.host.sfx('click');
      if (b !== 'pass' && Math.random() < 0.5) this.host.react(p, 'think', `${b}!`);
      this.after();
      return;
    }
    if (s.phase === 'trump') {
      const su = decideTrump(v);
      B.chooseTrump(s, p, su);
      this.host.react(p, 'happy', `Koz ${SUIT_TR[su].toLowerCase()}!`);
      this.host.sfx('card');
      this.after();
      return;
    }
    const r = B.playCard(s, p, chooseBatakCard(v, this.rng, this.host.difficulty));
    this.host.sfx('card');
    this.onTrick(r);
  }

  private onTrick(r: B.PlayResult) {
    if (r.trickDone && r.winner !== null) {
      if (r.winner !== 0 && Math.random() < 0.25) this.host.react(r.winner, 'goodMove');
    }
    this.after(r.trickDone);
  }

  // ------------------------------------------------------------ insan
  private doBid(b: number | 'pass') {
    try { B.bid(this.s, 0, b); this.host.sfx('click'); } catch (e) { this.host.toast((e as Error).message); return; }
    this.after();
  }

  private doTrump(su: Suit) {
    try { B.chooseTrump(this.s, 0, su); this.host.sfx('card'); } catch (e) { this.host.toast((e as Error).message); return; }
    this.after();
  }

  protected humanPlay(id: number) {
    let r: B.PlayResult;
    try { r = B.playCard(this.s, 0, id); } catch (e) { this.host.toast((e as Error).message); return; }
    this.host.sfx('card');
    this.onTrick(r);
  }

  protected handOver() { return this.s.phase === 'handOver' || this.s.phase === 'matchOver'; }

  protected onHandEnd() {
    const s = this.s;
    const names = [0, 1, 2, 3].map((p) => this.name(p));
    const bidder = s.bidder!;
    if (s.made) { this.host.react(bidder, 'win', 'İhale tamam!'); }
    else { this.host.react(bidder, 'angry', 'Battım!'); this.splash(`${names[bidder]} BATTI!`); }
    const m = h('div', 'modal');
    const over = s.phase === 'matchOver';
    const winners = B.matchWinners(s);
    const rows = [0, 1, 2, 3].map((p) => `<tr class="${p === 0 ? 'me' : ''}${p === bidder ? ' win' : ''}"><td>${names[p]}${p === bidder ? ` <small>(ihale ${s.highBid})</small>` : ''}</td><td>${s.tricksWon[p]}</td><td>${s.handScores![p] > 0 ? '+' : ''}${s.handScores![p]}</td><td><b>${s.totals[p]}</b></td></tr>`).join('');
    const title = s.made ? `${names[bidder]} ihaleyi tutturdu (${s.highBid})` : `${names[bidder]} battı! (${s.highBid} ihale)`;
    const mine = winners.includes(0);
    m.innerHTML = `<div class="panel"><h3>${title}</h3>
      <table class="score"><tr><th></th><th>El</th><th>Bu el</th><th>Toplam</th></tr>${rows}</table>
      <p class="muted">El ${s.handNo}/${this.opts.hands}. Koz: ${SUIT_TR[s.trump!]}.${this.opts.partners ? ' Eşli: ortakların elleri birlikte sayılır.' : ''}</p>
      ${over ? `<h3>${mine ? '🏆 Maçı KAZANDIN!' : `🏆 Maçı ${winners.map((w) => names[w]).join(' & ')} kazandı`}</h3>` : ''}</div>`;
    const row = h('div', 'row-btns');
    if (!over) row.appendChild(btn('Sonraki el ▶', 'primary', () => { m.remove(); B.nextHand(s, this.rng); this.host.sfx('deal'); this.render(); this.pump(); }));
    else {
      this.host.matchFinished(mine);
      row.appendChild(btn('Yeni maç', 'primary', () => { m.remove(); this.s = B.newBatak(this.opts, this.rng); this.host.sfx('deal'); this.render(); this.pump(); }));
    }
    row.appendChild(btn('Masadan kalk', 'ghost', () => this.host.exit()));
    m.querySelector('.panel')!.appendChild(row);
    this.el.appendChild(m);
  }
}
