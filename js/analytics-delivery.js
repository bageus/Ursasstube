import { ANALYTICS_TRACK_EVENT } from './analytics.js';
import { BACKEND_URL } from './config.js';
import { logger } from './logger.js';
import { requestJsonResult, REQUEST_PROFILE_ANALYTICS_WRITE } from './request.js';

const DEFAULT_ANALYTICS_ENDPOINT = `${BACKEND_URL}/api/telemetry/events`;
const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const DEFAULT_MAX_BATCH_SIZE = 20;
const DEFAULT_MAX_QUEUE_SIZE = 200;
const NON_RETRYABLE_STATUSES = new Set([400, 401, 403, 404, 413, 422]);

function createAnalyticsDelivery({
  endpoint = DEFAULT_ANALYTICS_ENDPOINT,
  eventTarget = typeof window !== 'undefined' ? window : null,
  requestFn,
  loggerInstance,
  flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS,
  maxBatchSize = DEFAULT_MAX_BATCH_SIZE,
  maxQueueSize = DEFAULT_MAX_QUEUE_SIZE
} = {}) {
  const sendRequest = requestFn || requestJsonResult;
  const log = loggerInstance || logger;
  const queue = [];
  let flushTimer = null;
  let flushing = false;
  const stats = {
    enqueued: 0,
    delivered: 0,
    failed: 0,
    dropped: 0,
    flushAttempts: 0,
    requeued: 0,
    lastErrorMessage: null,
  };

  function scheduleFlush() {
    if (flushTimer || flushIntervalMs <= 0) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush().catch((error) => {
        log.warn('⚠️ Analytics flush failed:', error);
      });
    }, flushIntervalMs);
  }

  async function flush() {
    if (flushing || queue.length === 0) return;
    flushing = true;

    const batchSize = Math.max(1, Math.min(maxBatchSize, queue.length));
    const batch = queue.splice(0, batchSize);

    try {
      stats.flushAttempts += 1;
      const { ok, status } = await sendRequest(endpoint, {
        ...REQUEST_PROFILE_ANALYTICS_WRITE,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: batch, sentAt: Date.now() })
      });

      const isNonRetryable = NON_RETRYABLE_STATUSES.has(status);

      if (!ok && !isNonRetryable) {
        stats.failed += batch.length;
        stats.requeued += batch.length;
        queue.unshift(...batch);
      }
      if (!ok && isNonRetryable) {
        stats.failed += batch.length;
        stats.dropped += batch.length;
        stats.lastErrorMessage = `Non-retryable analytics status ${status}`;
        log.warn(`⚠️ Analytics events dropped due to non-retryable status ${status}.`);
      }
      if (ok) {
        stats.delivered += batch.length;
      }
    } catch (error) {
      stats.failed += batch.length;
      stats.requeued += batch.length;
      stats.lastErrorMessage = error?.message || String(error);
      queue.unshift(...batch);
      throw error;
    } finally {
      flushing = false;
      if (queue.length > 0) scheduleFlush();
    }
  }

  function trimQueue() {
    if (queue.length <= maxQueueSize) return;
    const removedCount = queue.length - maxQueueSize;
    queue.splice(0, removedCount);
    stats.dropped += removedCount;
    log.warn(`⚠️ Analytics queue overflow, dropped ${removedCount} oldest events.`);
  }

  function handleTrackEvent(event) {
    const analyticsEvent = event?.detail;
    if (!analyticsEvent || !analyticsEvent.name) return;
    queue.push(analyticsEvent);
    stats.enqueued += 1;
    trimQueue();

    if (queue.length >= maxBatchSize) {
      flush().catch((error) => {
        log.warn('⚠️ Analytics immediate flush failed:', error);
      });
      return;
    }

    scheduleFlush();
  }

  function start() {
    if (!eventTarget?.addEventListener) return;
    eventTarget.addEventListener(ANALYTICS_TRACK_EVENT, handleTrackEvent);
  }

  function stop() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (eventTarget?.removeEventListener) {
      eventTarget.removeEventListener(ANALYTICS_TRACK_EVENT, handleTrackEvent);
    }
  }

  start();

  return {
    flush,
    stop,
    getQueueSize: () => queue.length,
    getStats: () => ({
      ...stats,
      queueSize: queue.length,
    }),
  };
}

let analyticsDeliveryInstance = null;

function setupAnalyticsDelivery() {
  if (analyticsDeliveryInstance) return analyticsDeliveryInstance;
  const globalEndpoint = typeof window !== 'undefined' ? window.__URSASS_ANALYTICS_ENDPOINT__ : '';
  const endpoint = typeof globalEndpoint === 'string' && globalEndpoint.trim().length > 0
    ? globalEndpoint.trim()
    : DEFAULT_ANALYTICS_ENDPOINT;
  analyticsDeliveryInstance = createAnalyticsDelivery({ endpoint });
  return analyticsDeliveryInstance;
}

export {
  createAnalyticsDelivery,
  setupAnalyticsDelivery
};
