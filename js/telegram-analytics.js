import { ANALYTICS_TRACK_EVENT } from './analytics.js';

const PUBLIC_CONFIG_URL = 'https://api.ursasstube.fun/api/public-config';
const FETCH_TIMEOUT_MS = 1500;

const BLOCKED_PARAM_KEYS = new Set([
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

const TELEGRAM_EVENT_ALLOWLIST = new Set([
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
  'wallet_connect_failed'
]);

let initPromise = null;
let initialized = false;
let manualEventTrackingSupported = false;
let trackFn = null;
let bridgeReady = false;

function devLog(...args) {
  if (import.meta.env.DEV) {
    console.info('[tg-analytics]', ...args);
  }
}

function getEnvFallbackConfig() {
  return {
    enabled: import.meta.env.VITE_TG_ANALYTICS_ENABLED === 'true',
    token: import.meta.env.VITE_TG_ANALYTICS_TOKEN,
    appName: import.meta.env.VITE_TG_ANALYTICS_APP_NAME
  };
}

async function fetchPublicConfigWithTimeout() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(PUBLIC_CONFIG_URL, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`public-config status ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveTelegramAnalyticsConfig() {
  const fallback = getEnvFallbackConfig();

  try {
    const config = await fetchPublicConfigWithTimeout();
    const remote = config?.telegramAnalytics;
    if (!remote || typeof remote !== 'object') {
      return fallback;
    }

    return {
      enabled: typeof remote.enabled === 'boolean' ? remote.enabled : fallback.enabled,
      token: remote.token || fallback.token,
      appName: remote.appName || fallback.appName
    };
  } catch (error) {
    devLog('public-config fetch failed, fallback to env', error);
    return fallback;
  }
}

function sanitizePayload(payload = {}) {
  if (!payload || typeof payload !== 'object') return {};

  const safePayload = {};
  for (const [key, value] of Object.entries(payload)) {
    if (BLOCKED_PARAM_KEYS.has(key)) continue;
    safePayload[key] = value;
  }

  return safePayload;
}

export async function initTelegramAnalytics() {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const config = await resolveTelegramAnalyticsConfig();

      if (!config.enabled) {
        devLog('disabled by config');
        return;
      }

      if (!config.token || !config.appName) {
        devLog('missing token or appName; init skipped');
        return;
      }

      const sdk = await import('@telegram-apps/analytics');
      const initCandidate = sdk?.init || sdk?.default?.init || sdk?.initialize || sdk?.default?.initialize;

      if (typeof initCandidate !== 'function') {
        devLog('init API not found in sdk');
        return;
      }

      initCandidate({ token: config.token, appName: config.appName });

      const trackCandidate = sdk?.track || sdk?.default?.track || sdk?.trackEvent || sdk?.default?.trackEvent;
      manualEventTrackingSupported = typeof trackCandidate === 'function';
      trackFn = manualEventTrackingSupported ? trackCandidate : null;

      if (!manualEventTrackingSupported) {
        devLog('sdk does not expose custom event tracking; bridge is safe no-op');
      }

      initialized = true;
      devLog('initialized', { appName: config.appName });
    } catch (error) {
      devLog('init failed', error);
    }
  })();

  await initPromise;
}

export function trackTelegramAnalyticsEvent(name, payload = {}) {
  const eventName = String(name || '').trim();
  if (!eventName || !TELEGRAM_EVENT_ALLOWLIST.has(eventName)) return;

  const safePayload = sanitizePayload(payload);

  if (!initialized || !manualEventTrackingSupported || typeof trackFn !== 'function') {
    devLog('track skipped (no-op)', eventName, safePayload);
    return;
  }

  try {
    trackFn(eventName, safePayload);
  } catch (error) {
    devLog('track failed', eventName, error);
  }
}

export function setupTelegramAnalyticsBridge() {
  if (bridgeReady || typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return;
  }

  window.addEventListener(ANALYTICS_TRACK_EVENT, (event) => {
    const analyticsEvent = event?.detail;
    const eventName = String(analyticsEvent?.name || '').trim();
    if (!eventName) return;

    const payload = analyticsEvent?.payload && typeof analyticsEvent.payload === 'object'
      ? analyticsEvent.payload
      : {};

    trackTelegramAnalyticsEvent(eventName, payload);
  });

  bridgeReady = true;
  devLog('bridge ready');
}
