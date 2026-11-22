/**
 * YANCI MODU (okey masası) — saf kurallar.
 *
 * Her oyuncunun (müdavim koltuğu dahil) en çok bir yancısı olur. Yancı, sahibinin ekranını (ıstakasını) görür ve
 * sahibine taş işaret edebilir. Sahibinin sağındaki oyuncunun (bir sonraki oyuncu) yanında durduğu için onun eline
 * GİZLİCE bakabilir: baktıkça taşlar yavaş yavaş görünür; uzun bakan çok görür ama yakalanması kolaylaşır.
 * Bakılan oyuncu bakış sırasında (ya da hemen ardından) "tokat atarsa" yancı yakalanır ve o el bir daha bakamaz.
 * Boşa atılan tokat herkese görünür ve tokat atan bir süre bekler. Bakılan müdavimse kendisi fark edip tokatı basar.
 *
 * Tümü sosyal/eğlencelik: kurallar ve puanlar değişmez. Zaman (`now`, ms) ve rastgelelik dışarıdan gelir.
 */

export const YANCI = {
  /** bir bakış en çok bu kadar sürer */
  maxPeek: 5000,
  /** her bu kadar sürede bir taş daha görünür */
  revealEvery: 300,
  /** bakılan oyuncunun ekranında "👀" bu kadar sonra belirir */
  cueAfter: 1000,
  /** bakış bittikten sonra bu süre içinde gelen tokat yine yakalar */
  grace: 1500,
  /** iki bakış arası en az */
  peekGap: 2000,
  /** boşa tokat atan bu kadar bekler */
  missCooldown: 15000,
  /** müdavimin fark etme hızı (saniyede olasılık) */
  botCatchRate: { easy: 0.15, medium: 0.3, hard: 0.5 } as Record<string, number>,
};

/** Yancılık yapılabilen oyunlar */
export const YANCI_GAMES = ['okey', 'okey101'] as const;

/** Yancının gizlice baktığı koltuk: sahibinin sağındaki (bir sonraki) oyuncu */
export const peekTargetOf = (owner: number, n: number) => (owner + 1) % n;

/** `since`'ten beri bakıyorsa kaç taş görmüş olur */
export const revealedCount = (since: number, now: number, total: number) => Math.min(total, Math.floor(Math.max(0, now - since) / YANCI.revealEvery) + 1);

/** Müdavim bakışı ne zaman fark eder (üstel dağılım); bakış süresinden sonraysa fark etmez */
export function botCatchAt(since: number, rng: () => number, difficulty: string): number | null {
  const rate = YANCI.botCatchRate[difficulty] ?? YANCI.botCatchRate.medium;
  const t = since + (-Math.log(1 - rng()) / rate) * 1000;
  return t < since + YANCI.maxPeek ? Math.round(t) : null;
}

/** Fisher-Yates ile karışık sıra (taşların hangi sırayla görüneceği) */
export function shuffledIds(ids: number[], rng: () => number): number[] {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
