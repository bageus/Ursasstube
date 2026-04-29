import { ANALYTICS_TRACK_EVENT } from './analytics.js';
import { capturePostHogEvent } from './posthog.js';
import { logger } from './logger.js';

let bridgeStarted = false;

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeGameStartPayload(payload = {}) {
  return {
    is_authorized: Boolean(payload.authenticated),
    mode: payload.mode,
    run_number: payload.run_index,
    difficulty_segment: payload.difficulty_segment,
    rides_left: payload.rides_left
  };
}

function normalizeGameEndPayload(payload = {}) {
  return {
    score: toNumber(payload.score),
    distance: toNumber(payload.distance),
    coins_gold: toNumber(payload.gold_coins),
    coins_silver: toNumber(payload.silver_coins),
    duration_sec: toNumber(payload.run_duration),
    death_reason: payload.reason,
    run_number: payload.run_index,
    difficulty_segment: payload.difficulty_segment
  };
}

function setupPostHogBridge() {
  if (bridgeStarted || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

  window.addEventListener(ANALYTICS_TRACK_EVENT, (event) => {
    const analyticsEvent = event?.detail;
    const eventName = String(analyticsEvent?.name || '').trim();
    if (!eventName) return;

    const payload = analyticsEvent?.payload && typeof analyticsEvent.payload === 'object'
      ? analyticsEvent.payload
      : {};

    if (eventName === 'game_start') {
      const normalizedPayload = normalizeGameStartPayload(payload);
      capturePostHogEvent('run_started', normalizedPayload);

      if (normalizedPayload.run_number === 2) {
        capturePostHogEvent('second_run_started', normalizedPayload);
      }
      return;
    }

    if (eventName === 'game_end') {
      capturePostHogEvent('run_finished', normalizeGameEndPayload(payload));
      return;
    }

    capturePostHogEvent(eventName, payload);
  });

  bridgeStarted = true;
  logger.info('📊 PostHog bridge started.');
}

export { setupPostHogBridge };
