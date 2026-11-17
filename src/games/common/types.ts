/** Shared contracts between rule engines, bots and UIs. */
export type GameId = 'okey' | 'okey101' | 'tavla' | 'pisti2' | 'pisti4';

export interface GameMeta {
  id: GameId;
  name: string;
  players: number;
  description: string;
}

export const GAME_META: Record<GameId, GameMeta> = {
  okey: { id: 'okey', name: 'Klasik Okey', players: 4, description: '106 taş, 14\'er taş, gösterge ve okey. 20 puandan geriye.' },
  okey101: { id: 'okey101', name: '101 Okey', players: 4, description: '21 taş, 101 ile el aç, 5 çiftle çift aç, taş işle.' },
  tavla: { id: 'tavla', name: 'Tavla', players: 2, description: '24 hane, 15\'er pul, kırma, mars. 5 puanlık maç.' },
  pisti2: { id: 'pisti2', name: 'Pişti (2 kişi)', players: 2, description: 'Tek rakip, 52 kart, 151 puana kadar.' },
  pisti4: { id: 'pisti4', name: 'Pişti (4 kişi)', players: 4, description: 'Karşılıklı takımlar, 52 kart, 151 puana kadar.' },
};
