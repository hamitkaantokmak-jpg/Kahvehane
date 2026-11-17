/**
 * Ekonomi kalıcılık arayüzü. Şimdilik localStorage; ileride sunucu tarafı bir uygulama
 * aynı arayüzü sağlayarak takılabilir.
 */
import { EconomyState, normalize } from './Economy';

export interface EconomyStore {
  load(npcIds: string[]): EconomyState;
  save(s: EconomyState): void;
}

export const ECONOMY_KEY = 'kahvehane.economy.v1';

export class LocalEconomyStore implements EconomyStore {
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeLocalStorage()) {}
  load(npcIds: string[]): EconomyState {
    try {
      const raw = this.storage?.getItem(ECONOMY_KEY);
      return normalize(raw ? JSON.parse(raw) : null, npcIds);
    } catch {
      return normalize(null, npcIds);
    }
  }
  save(s: EconomyState) {
    try { this.storage?.setItem(ECONOMY_KEY, JSON.stringify(s)); } catch { /* yok say */ }
  }
}

/** Bellek içi depo (testler ve ileride sunucu taklidi için) */
export class MemoryEconomyStore implements EconomyStore {
  data: string | null = null;
  load(npcIds: string[]) { return normalize(this.data ? JSON.parse(this.data) : null, npcIds); }
  save(s: EconomyState) { this.data = JSON.stringify(s); }
}

function safeLocalStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}
