import { ANALYTICS_TRACK_EVENT } from './analytics.js';
import { logger } from './logger.js';
import { requestJsonResult, REQUEST_PROFILE_ANALYTICS_WRITE } from './request.js';

const ANALYTICS_ENDPOINT = '/api/analytics/events';
const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const DEFAULT_MAX_BATCH_SIZE = 20;
const DEFAULT_MAX_QUEUE_SIZE = 200;

function createAnalyticsDelivery({
  endpoint = ANALYTICS_ENDPOINT,
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
      const { ok } = await sendRequest(endpoint, {
        ...REQUEST_PROFILE_ANALYTICS_WRITE,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: batch, sentAt: Date.now() })
      });

      if (!ok) {
        queue.unshift(...batch);
      }
    } catch (error) {
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
    log.warn(`⚠️ Analytics queue overflow, dropped ${removedCount} oldest events.`);
  }

  function handleTrackEvent(event) {
    const analyticsEvent = event?.detail;
    if (!analyticsEvent || !analyticsEvent.name) return;
    queue.push(analyticsEvent);
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
    getQueueSize: () => queue.length
  };
}

let analyticsDeliveryInstance = null;

function setupAnalyticsDelivery() {
  if (analyticsDeliveryInstance) return analyticsDeliveryInstance;
  analyticsDeliveryInstance = createAnalyticsDelivery();
  return analyticsDeliveryInstance;
}

export {
  createAnalyticsDelivery,
  setupAnalyticsDelivery
};
