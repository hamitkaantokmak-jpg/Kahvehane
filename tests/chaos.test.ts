import { describe, it, expect } from 'vitest';
import { ChaosDirector, levelOf, DECAY_PER_SEC, ROLL_INTERVAL, INTENSITY } from '../src/chaos/ChaosDirector';
import { ChaosRegistry, TENSION_POINTS } from '../src/chaos/events';
import { Brawl, joinChances, Candidate } from '../src/chaos/Brawl';
import { createRng } from '../src/games/common/rng';

const all = (d: ChaosDirector) => { d.available = new Set(['brawl', 'tvGoal', 'powerCut', 'cat']); return d; };

describe('Kaos Direktörü', () => {
  it('seviye geçişleri', () => {
    expect(levelOf(0)).toBe('calm');
    expect(levelOf(24.9)).toBe('calm');
    expect(levelOf(25)).toBe('lively');
    expect(levelOf(50)).toBe('tense');
    expect(levelOf(75)).toBe('explosive');
    const d = new ChaosDirector(createRng(1));
    d.add(30);
    const u = d.update(0.01);
    expect(u.levelChanged).toBe(null); // seviye add ile değişti, update öncesi zaten lively
    d.add(25);
    expect(d.level).toBe('tense');
    // düşüşle seviye değişimi bildirilir
    const u2 = d.update((d.tension - 49) / DECAY_PER_SEC);
    expect(u2.levelChanged).toBe('lively');
  });

  it('puan ekleme, sınırlar ve zamanla düşüş', () => {
    const d = new ChaosDirector(createRng(1));
    d.add('bonk');
    expect(d.tension).toBe(TENSION_POINTS.bonk);
    d.add(500);
    expect(d.tension).toBe(100);
    expect(d.update(0).overflow).toBe(true);
    d.update(10);
    expect(d.tension).toBeCloseTo(100 - 10 * DECAY_PER_SEC, 5);
    d.add('calmDown');
    expect(d.tension).toBeCloseTo(100 - 10 * DECAY_PER_SEC - 30, 5);
    d.update(10_000);
    expect(d.tension).toBe(0);
  });

  it('yoğunluk çarpanı yalnızca artışları ölçekler', () => {
    const calm = new ChaosDirector(createRng(1), 'calm');
    calm.add(10);
    expect(calm.tension).toBeCloseTo(10 * INTENSITY.calm.tensionMult);
    const chaos = new ChaosDirector(createRng(1), 'chaos');
    chaos.add(10);
    chaos.add(-10);
    expect(chaos.tension).toBeCloseTo(10 * INTENSITY.chaos.tensionMult - 10);
  });

  it('gerginlik aralığı ve kullanılabilirlik filtresi', () => {
    const d = new ChaosDirector(createRng(1));
    d.available = new Set(['brawl']);
    expect(d.eligible().map((e) => e.id)).toEqual([]); // kavga ≥ 30 ister
    d.add(40);
    expect(d.eligible().map((e) => e.id)).toEqual(['brawl']);
    all(d);
    expect(d.eligible().map((e) => e.id).sort()).toEqual(['brawl', 'cat', 'powerCut', 'tvGoal']);
    d.add(100);
    expect(d.eligible().map((e) => e.id).sort()).toEqual(['brawl', 'powerCut']); // tvGoal ≤70, cat ≤80
  });

  it('cooldown ve aynı olayın art arda gelmemesi', () => {
    const d = all(new ChaosDirector(createRng(1)));
    d.add(50);
    d.trigger('brawl');
    expect(d.eligible().some((e) => e.id === 'brawl')).toBe(false);
    d.trigger('tvGoal');
    // tvGoal son olay → seçilemez; brawl hâlâ bekleme süresinde
    let ids = d.eligible().map((e) => e.id);
    expect(ids).not.toContain('tvGoal');
    expect(ids).not.toContain('brawl');
    d.trigger('cat');
    d.state.tension = 50;
    d.update(61); // brawl bekleme süresi (60) doldu
    d.state.tension = 50;
    ids = d.eligible().map((e) => e.id);
    expect(ids).toContain('brawl');
    expect(ids).not.toContain('cat'); // son olay
  });

  it('ağırlıklı seçim sabit seed ile deterministik ve ağırlıklara uygun', () => {
    const run = (seed: number) => {
      const d = all(new ChaosDirector(createRng(seed)));
      d.state.tension = 40;
      const counts: Record<string, number> = {};
      for (let i = 0; i < 4000; i++) { const e = d.pick()!; counts[e.id] = (counts[e.id] ?? 0) + 1; }
      return counts;
    };
    expect(run(7)).toEqual(run(7));
    const c = run(7);
    // ağırlıklar: brawl 3, tvGoal 4, powerCut 1.5, cat 2 (toplam 10.5)
    expect(c.tvGoal / 4000).toBeCloseTo(4 / 10.5, 1);
    expect(c.powerCut / 4000).toBeCloseTo(1.5 / 10.5, 1);
    expect(c.tvGoal).toBeGreaterThan(c.brawl);
  });

  it('update zamanla olay üretir; durum JSON üzerinden geri yüklenir', () => {
    const d = all(new ChaosDirector(createRng(3), 'chaos'));
    d.state.tension = 60;
    const events: string[] = [];
    for (let t = 0; t < 600; t += 0.5) { d.state.tension = Math.max(d.state.tension, 40); const u = d.update(0.5); if (u.event) events.push(u.event.id); }
    expect(events.length).toBeGreaterThan(5);
    for (let i = 1; i < events.length; i++) expect(events[i]).not.toBe(events[i - 1]);
    const json = JSON.parse(JSON.stringify(d.toJSON()));
    const d2 = all(new ChaosDirector(createRng(3)));
    d2.load(json);
    expect(d2.toJSON()).toEqual(d.toJSON());
    expect(ROLL_INTERVAL).toBeGreaterThan(0);
  });

  it('kayıt defterine yeni olay tek yerden eklenir', () => {
    const r = new ChaosRegistry();
    expect(() => r.register({ id: 'cat', label: 'x', minTension: 50, maxTension: 10, weight: 1, cooldown: 1, tension: 1 })).toThrow();
    r.register({ id: 'cat', label: 'Kedi 2', minTension: 0, maxTension: 100, weight: 9, cooldown: 1, tension: 1 });
    expect(r.get('cat')!.label).toBe('Kedi 2');
  });
});

describe('Zincirleme kavga', () => {
  const cand = (id: string, o: Partial<Candidate> = {}): Candidate => ({ id, temper: 0.5, distance: 1, friends: [], rivals: [], ...o });

  it('ilişkiye göre taraf: dost yardım eder, rakip karşı tarafa geçer, tarafsız ayırır/kaçar', () => {
    const f = joinChances(cand('n', { friends: ['riza'] }), 'riza', 'player');
    expect(f.help).toBeGreaterThan(0);
    expect(f.side).toBe(0);
    const r = joinChances(cand('n', { rivals: ['riza'] }), 'riza', 'player');
    expect(r.attack).toBeGreaterThan(0);
    expect(r.side).toBe(1);
    const n = joinChances(cand('n'), 'riza', 'player');
    expect(n.help + n.attack).toBe(0);
    expect(n.separate).toBeGreaterThan(0);
    expect(n.flee).toBeGreaterThan(0);
  });

  it('mesafe ve öfke olasılığı ölçekler', () => {
    const near = joinChances(cand('n', { friends: ['a'], distance: 0.5 }), 'a', 'b');
    const far = joinChances(cand('n', { friends: ['a'], distance: 5.5 }), 'a', 'b');
    const out = joinChances(cand('n', { friends: ['a'], distance: 9 }), 'a', 'b');
    expect(near.help).toBeGreaterThan(far.help);
    expect(out.help).toBe(0);
    const hot = joinChances(cand('n', { friends: ['a'], temper: 1 }), 'a', 'b');
    const cool = joinChances(cand('n', { friends: ['a'], temper: 0 }), 'a', 'b');
    expect(hot.help).toBeGreaterThan(cool.help);
  });

  it('her aday bir kez değerlendirilir ve katılımcı sayısı sınırlıdır', () => {
    const b = new Brawl('a', 'b', { maxParticipants: 3, maxDuration: 14, joinRadius: 6 });
    const always = () => 0; // olasılık > 0 olan her şeye evet
    expect(b.consider(cand('x', { friends: ['a'] }), always)).toBe('helper');
    expect(b.consider(cand('x', { friends: ['a'] }), always)).toBe(null); // ikinci kez yok
    // 3 savaşana ulaşıldı → yeni dost artık savaşmaz, ayırıcı olur
    expect(b.consider(cand('y', { friends: ['b'] }), always)).not.toBe('helper');
    expect(b.fighters().length).toBe(3);
    expect(b.get('x')!.target).toBe('b');
  });

  it('kavga süre dolunca, yorulunca ya da yatıştırılınca söner', () => {
    const b = new Brawl('a', 'b');
    expect(b.update(5)).toBe(false);
    expect(b.update(10)).toBe(true);
    expect(b.state.endReason).toBe('timeout');
    const b2 = new Brawl('a', 'b');
    for (let i = 0; i < 4; i++) { b2.registerHit('a'); b2.registerHit('b'); }
    expect(b2.state.endReason).toBe('exhausted');
    const b3 = new Brawl('a', 'b');
    b3.end('calmed');
    expect(b3.active).toBe(false);
    expect(b3.consider(cand('z', { friends: ['a'] }), () => 0)).toBe(null);
    const b4 = new Brawl('a', 'b');
    b4.leave('b');
    expect(b4.state.endReason).toBe('exhausted');
    expect(JSON.parse(JSON.stringify(b4.toJSON())).a).toBe('a');
  });

  it('sabit seed ile bulaşma deterministik', () => {
    const sim = (seed: number) => {
      const rng = createRng(seed);
      const b = new Brawl('riza', 'player');
      const people = ['cemal', 'nihat', 'kemal', 'ferhat', 'hasan'].map((id, i) => cand(id, { distance: i, friends: i % 2 ? ['riza'] : [], rivals: i === 0 ? ['riza'] : [] }));
      return people.map((p) => b.consider(p, rng));
    };
    expect(sim(11)).toEqual(sim(11));
  });
});
