import posthog from 'posthog-js';
import { ANALYTICS_TRACK_EVENT } from './analytics.js';
import { logger } from './logger.js';

let posthogReady = false;
let bridgeBound = false;

function getTelegramContext() {
  try {
    const tg = window?.Telegram?.WebApp;
    const tgUser = tg?.initDataUnsafe?.user;

    return {
      isTelegram: Boolean(tg),
      platform: tg?.platform || null,
      version: tg?.version || null,
      startParam: tg?.initDataUnsafe?.start_param || null,
      userLanguage: tgUser?.language_code || null,
      userIsPremium: typeof tgUser?.is_premium === 'boolean' ? tgUser.is_premium : null
    };
  } catch (error) {
    logger.warn('⚠️ Failed to read Telegram WebApp context for PostHog:', error);
    return {
      isTelegram: false,
      platform: null,
      version: null,
      startParam: null,
      userLanguage: null,
      userIsPremium: null
    };
  }
}

function capturePostHogEvent(name, payload = {}) {
  const eventName = String(name || '').trim();
  if (!eventName || !posthogReady) return;

  try {
    posthog.capture(eventName, payload && typeof payload === 'object' ? payload : {});
  } catch (error) {
    logger.warn(`⚠️ Failed to capture PostHog event "${eventName}":`, error);
  }
}

function identifyPostHogUser({ id, source, properties } = {}) {
  if (!posthogReady || !id) return;

  try {
    const distinctId = String(id).trim();
    if (!distinctId) return;
    posthog.identify(distinctId, {
      source: source || 'unknown',
      ...(properties && typeof properties === 'object' ? properties : {})
    });
  } catch (error) {
    logger.warn('⚠️ Failed to identify PostHog user:', error);
  }
}

function resetPostHogUser() {
  if (!posthogReady) return;

  try {
    posthog.reset();
  } catch (error) {
    logger.warn('⚠️ Failed to reset PostHog user:', error);
  }
}

function bindAnalyticsBridge() {
  if (bridgeBound || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

  window.addEventListener(ANALYTICS_TRACK_EVENT, (event) => {
    const analyticsEvent = event?.detail;
    if (!analyticsEvent?.name) return;
    capturePostHogEvent(analyticsEvent.name, analyticsEvent.payload || {});
  });

  bridgeBound = true;
}

function initPostHog() {
  const key = import.meta.env?.VITE_POSTHOG_KEY;
  const host = import.meta.env?.VITE_POSTHOG_HOST;
  const appEnv = import.meta.env?.VITE_APP_ENV || 'unknown';

  if (!key) {
    logger.warn('⚠️ VITE_POSTHOG_KEY is missing. PostHog is disabled.');
    bindAnalyticsBridge();
    return;
  }

  try {
    posthog.init(key, {
      api_host: host,
      autocapture: false,
      capture_pageview: false,
      person_profiles: 'identified_only',
      disable_session_recording: true
    });

    posthogReady = true;
    bindAnalyticsBridge();

    const tg = getTelegramContext();
    capturePostHogEvent('app_opened', {
      app_env: appEnv,
      path: window?.location?.pathname || '/',
      referrer: document?.referrer || null,
      is_telegram: tg.isTelegram,
      tg_platform: tg.platform,
      tg_version: tg.version,
      tg_start_param: tg.startParam,
      tg_user_language: tg.userLanguage,
      tg_user_is_premium: tg.userIsPremium
    });
  } catch (error) {
    logger.warn('⚠️ Failed to init PostHog:', error);
  }
}

export {
  initPostHog,
  capturePostHogEvent,
  identifyPostHogUser,
  resetPostHogUser
};
