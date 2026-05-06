import { ANALYTICS_TRACK_EVENT } from './analytics.js';
import { logger } from './logger.js';

const PRIVATE_KEYS = new Set([
  'telegramUserId',
  'userId',
  'username',
  'firstName',
  'lastName',
  'phone',
  'email',
  'wallet',
  'walletAddress',
  'address',
  'initData',
  'rawInitData',
  'commentText',
  'messageText'
]);

const ALLOWED_BRIDGE_EVENTS = new Set([
  'app_opened',
  'game_start',
  'game_end',
  'run_started',
  'run_finished',
  'second_run_started',
  'leaderboard_opened',
  'donation_started',
  'donation_success',
  'donation_failed',
  'wallet_connect_started',
  'wallet_connect_success',
  'wallet_connect_failed',
  'share_clicked',
  'upload_opened'
]);

let bridgeStarted = false;
let initAttempted = false;
let initialized = false;
let sdkTrack = null;
let initPromise = null;

function getConfig() {
  const enabled = String(import.meta.env?.VITE_TG_ANALYTICS_ENABLED || '').trim() === 'true';
  const token = String(import.meta.env?.VITE_TG_ANALYTICS_TOKEN || '').trim();
  const appName = String(import.meta.env?.VITE_TG_ANALYTICS_APP_NAME || '').trim();
  return { enabled, token, appName };
}

function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !PRIVATE_KEYS.has(key)));
}

function setDebugState(extra = {}) {
  if (!import.meta.env?.DEV || typeof window === 'undefined') return;
  const cfg = getConfig();
  window.__tgAnalyticsDebug = {
    enabled: cfg.enabled,
    initialized,
    appName: cfg.appName || null,
    initAttempted,
    ...extra,
    trackTelegramEvent
  };
}

async function initTelegramAnalytics() {
  if (initialized) return true;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    initAttempted = true;
    const { enabled, token, appName } = getConfig();

    if (!enabled) {
      setDebugState({ reason: 'disabled' });
      return false;
    }

    if (!token || !appName) {
      logger.warn('[tg-analytics] init skipped: token/appName missing');
      setDebugState({ reason: 'missing_config' });
      return false;
    }

    try {
      const moduleName = '@telegram-apps/analytics';
      const sdk = await import(/* @vite-ignore */ moduleName);
      const initFn = sdk?.init || sdk?.default?.init;
      const trackFn = sdk?.track || sdk?.default?.track;

      if (typeof initFn !== 'function' || typeof trackFn !== 'function') {
        logger.warn('[tg-analytics] init skipped: sdk api unavailable');
        setDebugState({ reason: 'sdk_api_unavailable' });
        return false;
      }

      await initFn({ token, appName });
      sdkTrack = trackFn;
      initialized = true;
      setDebugState({ reason: 'initialized' });
      logger.info('[tg-analytics] initialized');
      return true;
    } catch (error) {
      logger.warn('[tg-analytics] init failed');
      setDebugState({ reason: 'init_error', error: error?.message || 'unknown' });
      return false;
    }
  })();

  return initPromise;
}

function trackTelegramEvent(eventName, payload = {}) {
  try {
    if (!initialized || typeof sdkTrack !== 'function') return false;
    const name = String(eventName || '').trim();
    if (!name) return false;
    sdkTrack(name, sanitizePayload(payload));
    return true;
  } catch (_error) {
    return false;
  }
}

function setupTelegramAnalyticsBridge() {
  if (bridgeStarted || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

  window.addEventListener(ANALYTICS_TRACK_EVENT, (event) => {
    try {
      const analyticsEvent = event?.detail;
      const eventName = String(analyticsEvent?.name || '').trim();
      if (!eventName || !ALLOWED_BRIDGE_EVENTS.has(eventName)) return;

      const payload = analyticsEvent?.payload && typeof analyticsEvent.payload === 'object'
        ? analyticsEvent.payload
        : {};

      trackTelegramEvent(eventName, payload);
    } catch (_error) {
      // ignore bridge errors
    }
  });

  bridgeStarted = true;
  logger.info('📊 Telegram Analytics bridge started.');
}

export { initTelegramAnalytics, trackTelegramEvent, setupTelegramAnalyticsBridge };
