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

let initialized = false;
let initStarted = false;
let trackFn = null;

function isEnabled() {
  return import.meta.env.VITE_TG_ANALYTICS_ENABLED === 'true';
}

function getConfig() {
  return {
    token: import.meta.env.VITE_TG_ANALYTICS_TOKEN,
    appName: import.meta.env.VITE_TG_ANALYTICS_APP_NAME
  };
}

function devLog(...args) {
  if (import.meta.env.DEV) {
    console.info('[tg-analytics]', ...args);
  }
}

function sanitizeParams(params = {}) {
  const safeParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (BLOCKED_PARAM_KEYS.has(key)) continue;
    safeParams[key] = value;
  }
  return safeParams;
}

export async function initTelegramAnalytics() {
  if (initialized || initStarted) return;
  if (!isEnabled()) {
    devLog('disabled by VITE_TG_ANALYTICS_ENABLED');
    return;
  }

  const { token, appName } = getConfig();
  if (!token || !appName) {
    devLog('missing token or appName; init skipped');
    return;
  }

  initStarted = true;
  try {
    const sdkModuleName = '@telegram-apps/analytics';
    const sdk = await import(/* @vite-ignore */ sdkModuleName);
    const initCandidate = sdk?.init || sdk?.default?.init || sdk?.initialize || sdk?.default?.initialize;
    const trackCandidate = sdk?.track || sdk?.default?.track || sdk?.trackEvent || sdk?.default?.trackEvent;

    if (typeof initCandidate !== 'function' || typeof trackCandidate !== 'function') {
      devLog('sdk API not found; init skipped');
      return;
    }

    initCandidate({ token, appName });
    trackFn = trackCandidate;
    initialized = true;
    devLog('initialized', { appName });
  } catch (error) {
    devLog('init failed', error);
  } finally {
    initStarted = false;
  }
}

export function trackTelegramEvent(eventName, params = {}) {
  if (!initialized || !isEnabled() || typeof trackFn !== 'function') return;

  const safeParams = sanitizeParams(params);
  try {
    trackFn(eventName, safeParams);
    devLog('event', eventName, safeParams);
  } catch (error) {
    devLog('track failed', eventName, error);
  }
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__tgAnalyticsDebug = {
    get enabled() {
      return isEnabled();
    },
    get initialized() {
      return initialized;
    },
    get appName() {
      return import.meta.env.VITE_TG_ANALYTICS_APP_NAME || '';
    },
    trackTelegramEvent
  };
}
