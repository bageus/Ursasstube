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
let fetchTraceInstalled = false;

function getConfig() {
  const enabled = String(import.meta.env?.VITE_TG_ANALYTICS_ENABLED || '').trim();
  const token = String(import.meta.env?.VITE_TG_ANALYTICS_TOKEN || '').trim();
  const rawAppName = String(import.meta.env?.VITE_TG_ANALYTICS_APP_NAME || '').trim();
  const appName = rawAppName === 'ursass_tube' ? 'ursas_tube' : rawAppName;
  return { enabled, token, appName, rawAppName };
}

function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const entries = [];
  const sourceEntries = Object.entries(payload);

  for (const [key, value] of sourceEntries) {
    if (PRIVATE_KEYS.has(key)) continue;
    if (value === undefined) continue;

    const valueType = typeof value;
    if (valueType === 'string') {
      entries.push([key, value.slice(0, 120)]);
      continue;
    }
    if (valueType === 'number') {
      if (Number.isFinite(value)) entries.push([key, value]);
      continue;
    }
    if (valueType === 'boolean') {
      entries.push([key, value]);
      continue;
    }
    if (value === null) {
      entries.push([key, null]);
    }
  }

  return Object.fromEntries(entries.slice(0, 32));
}

function getTelegramAnalyticsClient() {
  if (typeof window === 'undefined') return null;
  return window.telegramAnalytics || window.TelegramAnalytics || window.tgAnalytics || null;
}

function installTelegramAnalyticsFetchTrace() {
  if (fetchTraceInstalled || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  const traceEnabled = import.meta.env?.DEV || window.__URSASS_TG_ANALYTICS_TRACE__ === true;
  if (!traceEnabled) return;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const [input, init] = args;
    const url = typeof input === 'string' ? input : input?.url;
    const isTgAnalyticsRequest = typeof url === 'string' && url.includes('tganalytics.xyz/events');
    if (!isTgAnalyticsRequest) return originalFetch(...args);

    const response = await originalFetch(...args);
    try {
      const requestBody = typeof init?.body === 'string' ? init.body : null;
      const headersObject = (() => {
        const source = init?.headers;
        if (!source) return {};
        if (typeof Headers !== 'undefined' && source instanceof Headers) {
          return Object.fromEntries(source.entries());
        }
        if (Array.isArray(source)) return Object.fromEntries(source);
        if (typeof source === 'object') return { ...source };
        return {};
      })();
      const authHeader = headersObject['Tga-Auth-Token'] || headersObject['tga-auth-token'] || null;
      const maskedAuthHeader = typeof authHeader === 'string' && authHeader.length > 6
        ? `${authHeader.slice(0, 3)}...${authHeader.slice(-3)}`
        : authHeader;
      const responseBody = await response.clone().text();
      logger.info('[tg-analytics][trace] /events response', {
        status: response.status,
        ok: response.ok,
        requestHeaders: {
          ...headersObject,
          ...(authHeader ? { 'Tga-Auth-Token': maskedAuthHeader } : {})
        },
        requestBody,
        responseBody
      });
    } catch (_error) {
      // no-op
    }
    return response;
  };
  fetchTraceInstalled = true;
}

function hasTelegramLaunchParams() {
  if (typeof window === 'undefined') return false;

  const tg = window.Telegram?.WebApp;
  if (!tg || typeof tg !== 'object') return false;

  const hasInitData = typeof tg.initData === 'string' && tg.initData.trim().length > 0;
  const hasInitDataUnsafe = Boolean(tg.initDataUnsafe && Object.keys(tg.initDataUnsafe).length > 0);

  // In some Telegram clients initData can arrive slightly позже bootstrap.
  // If WebApp object is present, allow init and rely on SDK-side validation.
  return hasInitData || hasInitDataUnsafe || Boolean(tg);
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
    installTelegramAnalyticsFetchTrace();
    const { enabled, token, appName, rawAppName } = getConfig();

    logger.info('[tg-analytics] init attempt', {
      enabled,
      hasToken: Boolean(token),
      appName
    });

    if (rawAppName === 'ursass_tube' && appName !== rawAppName) {
      logger.warn('[tg-analytics] corrected appName typo from "ursass_tube" to "ursas_tube"');
    }

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
      logger.warn('[tg-analytics] init skipped: Telegram WebApp missing', {
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

  const result = await initPromise;
  if (!initialized) {
    initPromise = null;
  }
  return result;
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
