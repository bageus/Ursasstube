import { logger } from './logger.js';

const ANALYTICS_TRACK_EVENT = 'ursas:analytics-track';

function sanitizeAnalyticsPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') return {};

  const entries = Object.entries(payload).filter(([, value]) => value !== undefined && typeof value !== 'function');
  return Object.fromEntries(entries);
}

function trackAnalyticsEvent(name, payload = {}) {
  const event = {
    name: String(name || '').trim(),
    payload: sanitizeAnalyticsPayload(payload),
    timestamp: Date.now()
  };

  if (!event.name) return null;

  logger.info('📊 Analytics event:', event);

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
