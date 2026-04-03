import { initLogger } from './logger.js';
import { stabilizeMenuLoad } from './stabilize-menu.js';
import { shouldRedirectToPhaserPreviewFromUrl, buildPhaserPreviewUrl } from './phaser-preview-routing.js';
import '../css/style.css';

async function bootstrap() {
  initLogger();
  stabilizeMenuLoad();

  const currentUrl = new URL(window.location.href);
  if (shouldRedirectToPhaserPreviewFromUrl(currentUrl)) {
    console.info('🎮 Redirecting to isolated Phaser preview route: /phaser/');
    window.location.replace(buildPhaserPreviewUrl(currentUrl).toString());
    return;
  }

  const { initGameBootstrap } = await import('./game-runtime.js');
  initGameBootstrap();
}

bootstrap();
