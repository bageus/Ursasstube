import { initLogger } from './logger.js';
import { stabilizeMenuLoad } from './stabilize-menu.js';
import { shouldUsePhaserRendererFromUrl } from './phaser-preview-routing.js';
import { startPhaserPreview } from './phaser-preview.js';
import '../css/style.css';

function ensurePhaserHost() {
  const gameContent = document.getElementById('gameContent');
  if (!gameContent) {
    throw new Error('Missing #gameContent host for Phaser renderer.');
  }

  let phaserHost = document.getElementById('gameViewport');
  if (!phaserHost) {
    phaserHost = document.createElement('div');
    phaserHost.id = 'gameViewport';
    phaserHost.style.position = 'absolute';
    phaserHost.style.inset = '0';
    phaserHost.style.overflow = 'hidden';
    gameContent.prepend(phaserHost);
  }

  const canvas = document.getElementById('game');
  if (canvas) {
    canvas.style.display = 'none';
  }

  return phaserHost;
}

async function bootstrap() {
  initLogger();
  stabilizeMenuLoad();

  const currentUrl = new URL(window.location.href);
  if (shouldUsePhaserRendererFromUrl(currentUrl)) {
    console.info('🎮 Starting Phaser renderer in main game viewport.');
    const host = ensurePhaserHost();
    await startPhaserPreview(host);
    return;
  }

  console.info('🎮 Starting Phaser game runtime (default backend).');
  ensurePhaserHost();
  const { initGameBootstrap } = await import('../experiments/phaser/js/game.js');
  initGameBootstrap();
}

bootstrap();
