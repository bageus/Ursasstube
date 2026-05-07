import { ANALYTICS_TRACK_EVENT } from './analytics.js';
import { logger } from './logger.js';

const TG_ANALYTICS_CDN_URL = 'https://tganalytics.xyz/index.js';

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
  'share_result_clicked',
  'share_intent_opened',
  'upload_opened'
]);

const EVENT_NAME_ALIASES = {
  share_result_clicked: 'share_clicked',
  share_intent_opened: 'share_clicked',
};

let bridgeStarted = false;
let initAttempted = false;
let initialized = false;
let initPromise = null;

function getConfig() {
  const enabled = String(import.meta.env?.VITE_TG_ANALYTICS_ENABLED || '').trim();
  const token = String(import.meta.env?.VITE_TG_ANALYTICS_TOKEN || '').trim();
  const appName = String(import.meta.env?.VITE_TG_ANALYTICS_APP_NAME || '').trim();
  return { enabled, token, appName };
}

function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !PRIVATE_KEYS.has(key)));
}

function getTelegramAnalyticsClient() {
  if (typeof window === 'undefined') return null;
  return window.telegramAnalytics || window.TelegramAnalytics || window.tgAnalytics || null;
}

function hasTelegramLaunchParams() {
  if (typeof window === 'undefined') return false;

  const tg = window.Telegram?.WebApp;
  if (!tg || typeof tg !== 'object') return false;

  const hasInitData = typeof tg.initData === 'string' && tg.initData.trim().length > 0;
  const hasInitDataUnsafe = Boolean(tg.initDataUnsafe && Object.keys(tg.initDataUnsafe).length > 0);

  // Strict Telegram-only gate: URL launch params can leak to non-Telegram browser sessions
  // and trigger invalid SDK requests (HTTP 400).
  return hasInitData || hasInitDataUnsafe;
}

function loadTelegramAnalyticsSdk() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve(false);
  if (getTelegramAnalyticsClient()) return Promise.resolve(true);

  const existingScript = document.querySelector('script[data-tg-analytics-sdk="true"]');
  if (existingScript) {
    const hasClient = Boolean(getTelegramAnalyticsClient());
    if (hasClient) {
      logger.info('[tg-analytics] script loaded', { hasClient });
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        logger.warn('[tg-analytics] script load timeout');
        resolve(false);
      }, 5000);
      existingScript.addEventListener('load', () => {
        clearTimeout(timeoutId);
        logger.info('[tg-analytics] script loaded', {
          hasClient: Boolean(getTelegramAnalyticsClient())
        });
        resolve(Boolean(getTelegramAnalyticsClient()));
      }, { once: true });
      existingScript.addEventListener('error', () => {
        clearTimeout(timeoutId);
        logger.warn('[tg-analytics] script load failed');
        resolve(false);
      }, { once: true });
    });
  }

  return new Promise((resolve) => {
    const script = document.createElement('script');
    const timeoutId = setTimeout(() => {
      logger.warn('[tg-analytics] script load timeout');
      resolve(false);
    }, 5000);

    script.src = TG_ANALYTICS_CDN_URL;
    script.async = true;
    script.dataset.tgAnalyticsSdk = 'true';

    script.addEventListener('load', () => {
      clearTimeout(timeoutId);
      logger.info('[tg-analytics] script loaded', {
        hasClient: Boolean(getTelegramAnalyticsClient())
      });
      resolve(Boolean(getTelegramAnalyticsClient()));
    }, { once: true });

    script.addEventListener('error', () => {
      clearTimeout(timeoutId);
      logger.warn('[tg-analytics] script load failed');
      resolve(false);
    }, { once: true });

    document.head.append(script);
  });
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

    logger.info('[tg-analytics] init attempt', {
      enabled,
      hasToken: Boolean(token),
      appName
    });

    if (enabled !== 'true') {
      setDebugState({ reason: 'disabled' });
      return false;
    }

    if (!token || !appName) {
      logger.warn('[tg-analytics] init skipped: token/appName missing');
      setDebugState({ reason: 'missing_config' });
      return false;
    }

    const sdkLoaded = await loadTelegramAnalyticsSdk();
    if (!sdkLoaded) {
      setDebugState({ reason: 'sdk_load_failed' });
      return false;
    }

    const client = getTelegramAnalyticsClient();
    const initFn = client?.init;

    const href = typeof window?.location?.href === 'string' ? window.location.href : null;
    const origin = typeof window?.location?.origin === 'string' ? window.location.origin : null;

    logger.info('[tg-analytics] sdk loaded', {
      hasClient: Boolean(client),
      hasInit: typeof initFn === 'function',
      clientKeys: Object.keys(client || {}).slice(0, 20),
      appName,
      href: window.location.href,
      origin: window.location.origin,
      isTelegramWebApp: Boolean(window.Telegram?.WebApp),
      tgPlatform: window.Telegram?.WebApp?.platform || null
    });

    if (typeof initFn !== 'function') {
      logger.warn('[tg-analytics] init skipped: sdk init unavailable');
      setDebugState({ reason: 'sdk_init_unavailable' });
      return false;
    }

    if (!hasTelegramLaunchParams()) {
      logger.warn('[tg-analytics] init skipped: Telegram launch params missing', {
        href: window.location.href,
        origin: window.location.origin,
        isTelegramWebApp: Boolean(window.Telegram?.WebApp),
        tgPlatform: window.Telegram?.WebApp?.platform || null
      });
      setDebugState({ reason: 'telegram_launch_params_missing' });
      return false;
    }

    try {
      await initFn.call(client, { token, appName });
      initialized = true;
      setDebugState({ reason: 'initialized' });
      logger.info('[tg-analytics] initialized');
      return true;
    } catch (error) {
      logger.warn('[tg-analytics] init failed', {
        message: error?.message || 'unknown',
        name: error?.name || 'Error',
        stack: import.meta.env?.DEV ? error?.stack : undefined
      });
      setDebugState({ reason: 'init_error', error: error?.message || 'unknown' });
      return false;
    }
  })();

  return initPromise;
}

function trackTelegramEvent(eventName, payload = {}) {
  try {
    if (!initialized) return false;
    const rawName = String(eventName || '').trim();
    const name = EVENT_NAME_ALIASES[rawName] || rawName;
    if (!name) return false;

    const client = getTelegramAnalyticsClient();
    const trackFn = client?.track || client?.trackEvent || client?.sendEvent || client?.event;
    if (typeof trackFn !== 'function') return false;

    trackFn.call(client, name, sanitizePayload(payload));
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

export { initTelegramAnalytics, setupTelegramAnalyticsBridge, trackTelegramEvent };
