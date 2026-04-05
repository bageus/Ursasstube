import { initLogger } from './logger.js';
import { stabilizeMenuLoad } from './stabilize-menu.js';
import '../css/style.css';

function renderBootstrapFallback(error) {
  const existing = document.getElementById('bootstrapFatalOverlay');
  if (existing) return;

  const overlay = document.createElement('div');
  overlay.id = 'bootstrapFatalOverlay';
  overlay.setAttribute('role', 'alert');
  overlay.setAttribute('aria-live', 'assertive');

  const title = document.createElement('h2');
  title.className = 'bootstrap-fatal-title';
  title.textContent = 'Startup error';

  const description = document.createElement('p');
  description.className = 'bootstrap-fatal-description';
  description.textContent = 'Не удалось запустить игру. Попробуйте перезагрузить страницу.';

  const details = document.createElement('p');
  details.className = 'bootstrap-fatal-details';
  details.textContent = `Причина: ${error?.message || 'Unknown error'}`;

  const retryButton = document.createElement('button');
  retryButton.type = 'button';
  retryButton.className = 'bootstrap-fatal-retry';
  retryButton.textContent = 'Reload';
  retryButton.addEventListener('click', () => window.location.reload());

  overlay.append(title, description, details, retryButton);
  document.body.append(overlay);
}

async function bootstrap() {
  try {
    initLogger();
    stabilizeMenuLoad();

    const { initGameBootstrap } = await import('./game-runtime.js');
    initGameBootstrap();
  } catch (error) {
    console.error('❌ Bootstrap failed:', error);
    renderBootstrapFallback(error);
  }
}

bootstrap();
