import { logger } from './logger.js';

const ANALYTICS_TRACK_EVENT = 'ursas:analytics-track';
const DIRECT_POSTHOG_EVENTS = new Set([
  'donation_started',
  'donation_success',
  'donation_failed',
  'second_run_started'
]);

function sanitizeAnalyticsPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') return {};

  const entries = Object.entries(payload).filter(([, value]) => value !== undefined && typeof value !== 'function');
  return Object.fromEntries(entries);
}

function trackAnalyticsEvent(name, payload = {}) {
  const event = {
    name: String(name || '').trim(),
    payload: sanitizeAnalyticsPayload(payload),
    timestamp: Date.now(),
    forwardedToPostHog: false
  };

  if (!event.name) return null;

  logger.info('📊 Analytics event:', event);

  if (DIRECT_POSTHOG_EVENTS.has(event.name)) {
    if (typeof window !== 'undefined') {
      const captureFn = window.__URSASS_POSTHOG__?.capturePostHogEvent;
      if (typeof captureFn === 'function') {
        captureFn(event.name, event.payload);
        event.forwardedToPostHog = true;
      }
    }
  }

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(ANALYTICS_TRACK_EVENT, { detail: event }));
  }

  return event;
}

export {
  ANALYTICS_TRACK_EVENT,
  trackAnalyticsEvent,
  sanitizeAnalyticsPayload
};
