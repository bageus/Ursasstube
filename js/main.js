import { initLogger } from './logger.js';
import { stabilizeMenuLoad } from './stabilize-menu.js';
import '../css/style.css';

function normalizePathname(pathname) {
  if (!pathname) return '/';
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

function shouldRedirectToPhaserPreview() {
  const url = new URL(window.location.href);
  const requestedRenderer = (url.searchParams.get('renderer') || '').trim().toLowerCase();
  const skipRedirect = (url.searchParams.get('phaser_preview_redirect') || '').trim().toLowerCase() === 'off';

  const normalizedPath = normalizePathname(url.pathname);
  const onMainEntrypoint = normalizedPath === '/' || normalizedPath === '/index.html';
  const alreadyOnPhaserRoute = normalizedPath === '/phaser' || normalizedPath.startsWith('/phaser/');

  return requestedRenderer === 'phaser' && !skipRedirect && onMainEntrypoint && !alreadyOnPhaserRoute;
}

function redirectToPhaserPreview() {
  const current = new URL(window.location.href);
  const target = new URL('/phaser/', current.origin);

  for (const [key, value] of current.searchParams.entries()) {
    if (key === 'phaser_preview_redirect') continue;
    target.searchParams.set(key, value);
  }

  if (current.hash) {
    target.hash = current.hash;
  }

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
