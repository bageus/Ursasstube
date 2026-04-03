import { initLogger } from './logger.js';
import { stabilizeMenuLoad } from './stabilize-menu.js';
import '../css/style.css';

function shouldRedirectToPhaserPreview() {
  const params = new URLSearchParams(window.location.search);
  const requestedRenderer = (params.get('renderer') || '').trim().toLowerCase();
  const alreadyOnPhaserRoute = window.location.pathname.startsWith('/phaser');
  return requestedRenderer === 'phaser' && !alreadyOnPhaserRoute;
}

function redirectToPhaserPreview() {
  const target = new URL('/phaser/', window.location.origin);
  const current = new URL(window.location.href);
  target.search = current.search;
  window.location.replace(target.toString());
}

async function bootstrap() {
  initLogger();
  stabilizeMenuLoad();

  if (shouldRedirectToPhaserPreview()) {
    console.info('🎮 Redirecting to isolated Phaser preview route: /phaser/');
    redirectToPhaserPreview();
    return;
  }

  const { initGameBootstrap } = await import('./game-runtime.js');
  initGameBootstrap();
}

bootstrap();
