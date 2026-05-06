import { ANALYTICS_TRACK_EVENT } from './analytics.js';
import { trackTelegramEvent } from './lib/telegramAnalytics.js';
import { logger } from './logger.js';

let bridgeStarted = false;

function setupTelegramAnalyticsBridge() {
  if (bridgeStarted || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

  window.addEventListener(ANALYTICS_TRACK_EVENT, (event) => {
    const analyticsEvent = event?.detail;
    const eventName = String(analyticsEvent?.name || '').trim();
    if (!eventName) return;

    const payload = analyticsEvent?.payload && typeof analyticsEvent.payload === 'object'
      ? analyticsEvent.payload
      : {};

    trackTelegramEvent(eventName, payload);
  });

  bridgeStarted = true;
  logger.info('📊 Telegram Analytics bridge started.');
}

export { setupTelegramAnalyticsBridge };
