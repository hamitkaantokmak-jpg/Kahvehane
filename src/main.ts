import { Game } from './core/Game';

const app = document.getElementById('app')!;
try {
  const game = new Game(app);
  game.start();
  (window as unknown as { __game: Game }).__game = game;
} catch (e) {
  app.innerHTML = `<div class="fatal">Oyun başlatılamadı: ${(e as Error).message}<br>Tarayıcınız WebGL desteklemiyor olabilir.</div>`;
  console.error(e);
}
document.getElementById('loading')?.remove();
