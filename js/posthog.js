import posthog from 'posthog-js';
import { logger } from './logger.js';

let posthogReady = false;
let posthogInitialized = false;
const POSTHOG_PREINIT_QUEUE_LIMIT = 20;
const posthogPreinitQueue = [];

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
  if (!eventName) return;

  const normalizedPayload = payload && typeof payload === 'object' ? payload : {};

  if (!posthogReady) {
    if (posthogPreinitQueue.length >= POSTHOG_PREINIT_QUEUE_LIMIT) {
      posthogPreinitQueue.shift();
    }
    posthogPreinitQueue.push({ eventName, payload: normalizedPayload });
    return;
  }

  try {
    posthog.capture(eventName, normalizedPayload);
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

function initPostHog() {
  if (posthogInitialized || posthogReady) return;

  const key = import.meta.env?.VITE_POSTHOG_KEY;
  const host = import.meta.env?.VITE_POSTHOG_HOST || window?.__URSASS_POSTHOG_HOST__ || undefined;
  const appEnv = import.meta.env?.VITE_APP_ENV || 'unknown';

  if (!key) {
    logger.warn('⚠️ PostHog key is missing (VITE_POSTHOG_KEY/window.__URSASS_POSTHOG_KEY__). PostHog is disabled.');
    return;
  }

  try {
    posthog.init(key, {
      ...(host ? { api_host: host } : {}),
      autocapture: false,
      capture_pageview: false,
      person_profiles: 'identified_only',
      disable_session_recording: true
    });

    logger.info(`📊 PostHog init: host=${host || 'default'} env=${appEnv}`);

    posthogReady = true;
    posthogInitialized = true;

    while (posthogPreinitQueue.length > 0) {
      const queued = posthogPreinitQueue.shift();
      if (!queued?.eventName) continue;
      capturePostHogEvent(queued.eventName, queued.payload || {});
    }

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
