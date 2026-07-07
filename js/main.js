import { initLogger } from './logger.js';
import { initAppLoading, markAppShellReady, setAppLoadingProgress, markGameRuntimeReady, markAppReady, waitForAppReady } from './app-loading.js';
import { bootstrapGameFeature } from './features/game/bootstrap.js';
import { initTelegramAnalytics } from './telegram-analytics.js';
import { installStartupPerformanceTelemetry } from './startup-performance.js';
import { installLeaderboardOverlay } from './leaderboard-overlay.js';
import { installSilentLeaderboardPreload } from './leaderboard-cache.js';
import { installStartGameLoadingIndicator } from './start-game-loading-indicator.js';
import { configureAppMetadata } from './app-metadata.js';
import {
  initPostHog,
  capturePostHogEvent,
  identifyPostHogUser,
  resetPostHogUser
} from './integrations/posthog/index.js';
import '../css/style.css';
import '../css/menu-layout.css';


if (typeof window !== 'undefined') {
  window.__URSASS_APP_LOADING__ = {
    initAppLoading,
    markAppShellReady,
    setAppLoadingProgress,
    markGameRuntimeReady,
    markAppReady,
    waitForAppReady
  };
}

if (typeof window !== 'undefined') {
  window.__URSASS_POSTHOG__ = {
    initPostHog,
    capturePostHogEvent,
    identifyPostHogUser,
    resetPostHogUser
  };
}

function scheduleIdleTask(callback, timeout = 1500) {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(callback, { timeout });
    return;
  }

  setTimeout(callback, 0);
}

function scheduleTelegramAnalyticsInit() {
  scheduleIdleTask(() => {
    try {
      initTelegramAnalytics().catch((error) => {
        console.warn('⚠️ Telegram analytics init failed', error);
      });
    } catch (error) {
      console.warn('⚠️ Telegram analytics init failed', error);
    }
  });
}

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
    configureAppMetadata();
    installStartupPerformanceTelemetry();
    installLeaderboardOverlay();
    installSilentLeaderboardPreload();
    installStartGameLoadingIndicator();
    try {
      initAppLoading();
    } catch (loadingError) {
      console.error('❌ App loading gate init failed:', loadingError);
      document.body?.classList.remove('loading-ui');
      document.body?.classList.add('ui-stable');
    }
    markAppShellReady();
    bootstrapGameFeature();

    scheduleTelegramAnalyticsInit();

    try {
      Promise.resolve(initPostHog()).catch((error) => {
        console.warn('⚠️ PostHog init failed', error);
      });
    } catch (error) {
      console.warn('⚠️ PostHog init failed', error);
    }
  } catch (error) {
    console.error('❌ Bootstrap failed:', error);
    renderBootstrapFallback(error);
  }
}

bootstrap();