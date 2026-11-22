import { describe, it, expect } from 'vitest';
import { Conn, statusFor, updatesFor, invite, cleanFriends, makeFriendCode, isFriendCode, INVITE_GAP } from '../src/online/friends';
import { createRng } from '../src/games/common/rng';

const conn = (code: string, friends: string[], extra: Partial<Conn> = {}): Conn => ({ code, name: code.toLowerCase(), friends, invisible: false, room: null, ...extra });

describe('Arkadaş listesi', () => {
  it('kod: 6 harf, karışan harf yok; liste temizlenir', () => {
    const rng = createRng(1);
    for (let i = 0; i < 100; i++) expect(isFriendCode(makeFriendCode(rng))).toBe(true);
    expect(cleanFriends(['AAAAAA', 'AAAAAA', 'kotu', 5, 'BBBBBB'])).toEqual(['AAAAAA', 'BBBBBB']);
    expect(cleanFriends('x')).toEqual([]);
  });

  it('karşılıklı: eklemeyen "bekliyor", ekleyen çevrimiçi (odasıyla); görünmez çevrimdışı görünür', () => {
    const ali = 'ALEMAA', veli = 'VELEAA', can = 'CANAAA';
    const conns = [conn(ali, [veli, can]), conn(veli, [ali], { room: { code: 'OKEY', kind: 'okey' } }), conn(can, [])];
    expect(statusFor(conns, veli, ali)).toEqual({ code: veli, state: 'online', name: 'veleaa', room: { code: 'OKEY', kind: 'okey' } });
    expect(statusFor(conns, can, ali).state).toBe('pending');
    expect(statusFor(conns, 'YOKKKK', ali).state).toBe('offline');
    conns[1].invisible = true;
    expect(statusFor(conns, veli, ali).state).toBe('offline');
    // değişiklik yalnızca listesinde tutanlara gider
    const up = updatesFor(conns, veli);
    expect(up.map((u) => u.to)).toEqual([0]);
  });

  it('masaya çağır: yalnızca karşılıklı arkadaşa, odadayken; sık çağrı engellenir', () => {
    const ali = 'ALEMAA', veli = 'VELEAA', can = 'CANAAA';
    const conns = [conn(ali, [veli, can]), conn(veli, [ali]), conn(can, [])];
    expect(invite(conns, 0, veli, 0)[0].msg.t).toBe('error');
    conns[0].room = { code: 'OKEY', kind: 'okey' };
    const ok = invite(conns, 0, veli, 1000);
    expect(ok).toEqual([{ to: 1, msg: { t: 'invited', from: { code: ali, name: 'alemaa' }, room: { code: 'OKEY', kind: 'okey' } } }]);
    expect(invite(conns, 0, veli, 2000)[0].msg.t).toBe('error');
    expect(invite(conns, 0, veli, 1000 + INVITE_GAP)[0].msg.t).toBe('invited');
    // Can, Ali'yi eklemedi
    expect(invite(conns, 0, can, 9e9)[0].msg).toMatchObject({ t: 'error' });
    expect(invite(conns, 0, 'DEGEL1', 9e9)[0].msg).toMatchObject({ t: 'error' });
  });
});
