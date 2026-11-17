/**
 * Kaos olayı kayıt defteri (saf veri). Yeni olay eklemek için yalnızca buraya bir tanım eklenir;
 * oyun katmanı aynı id ile bir işleyici (handler) kaydeder. İşleyicisi olmayan olaylar seçilmez.
 */
export type ChaosEventId = 'brawl' | 'tvGoal' | 'powerCut' | 'cat';

export interface ChaosEventDef {
  id: ChaosEventId;
  /** HUD/günlük için Türkçe ad */
  label: string;
  /** Bu olayın seçilebileceği gerginlik aralığı (dahil) */
  minTension: number;
  maxTension: number;
  /** Ağırlıklı seçimde ağırlık */
  weight: number;
  /** Aynı olayın tekrar seçilebilmesi için bekleme süresi (sn) */
  cooldown: number;
  /** Olay gerçekleşince eklenen gerginlik */
  tension: number;
}

export const DEFAULT_EVENTS: ChaosEventDef[] = [
  { id: 'brawl', label: 'Kavga', minTension: 30, maxTension: 100, weight: 3, cooldown: 60, tension: 10 },
  { id: 'tvGoal', label: 'TV\'de gol', minTension: 0, maxTension: 70, weight: 4, cooldown: 45, tension: 5 },
  { id: 'powerCut', label: 'Elektrik kesintisi', minTension: 20, maxTension: 100, weight: 1.5, cooldown: 120, tension: 6 },
  { id: 'cat', label: 'Kedi', minTension: 0, maxTension: 80, weight: 2, cooldown: 90, tension: 15 },
];

/** Gerginlik kaynakları ve puanları (tek yerden ayarlanır). */
export const TENSION_POINTS = {
  bonk: 8,
  brawlStart: 10,
  brawlHit: 2,
  tableFlip: 25,
  cat: 15,
  glassBreak: 3,
  calmDown: -30,
} as const;
export type TensionSource = keyof typeof TENSION_POINTS;

export class ChaosRegistry {
  private defs = new Map<ChaosEventId, ChaosEventDef>();
  constructor(defs: ChaosEventDef[] = DEFAULT_EVENTS) {
    for (const d of defs) this.register(d);
  }
  register(def: ChaosEventDef) {
    if (def.minTension > def.maxTension) throw new Error(`Geçersiz aralık: ${def.id}`);
    this.defs.set(def.id, { ...def });
  }
  get(id: ChaosEventId) { return this.defs.get(id); }
  all(): ChaosEventDef[] { return [...this.defs.values()]; }
}
