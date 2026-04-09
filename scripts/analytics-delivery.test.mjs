import test from 'node:test';
import assert from 'node:assert/strict';
import { ANALYTICS_TRACK_EVENT } from '../js/analytics.js';
import { createAnalyticsDelivery } from '../js/analytics-delivery.js';

function createEventTargetMock() {
  const listeners = new Map();

  return {
    addEventListener(name, handler) {
      const bucket = listeners.get(name) || [];
      bucket.push(handler);
      listeners.set(name, bucket);
    },
    removeEventListener(name, handler) {
      const bucket = listeners.get(name) || [];
      listeners.set(name, bucket.filter((item) => item !== handler));
    },
    dispatch(name, detail) {
      const bucket = listeners.get(name) || [];
      for (const handler of bucket) {
        handler({ detail });
      }
    }
  };
}

test('analytics delivery sends queued events when batch size is reached', async () => {
  const eventTarget = createEventTargetMock();
  const calls = [];

  const delivery = createAnalyticsDelivery({
    eventTarget,
    maxBatchSize: 1,
    flushIntervalMs: 10000,
    requestFn: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, data: { accepted: 1 } };
    },
    loggerInstance: { warn() {} }
  });

  eventTarget.dispatch(ANALYTICS_TRACK_EVENT, {
    name: 'game_start',
    payload: { seed: 1 },
    timestamp: 1
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/telemetry\/events$/);

  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.events.length, 1);
  assert.equal(payload.events[0].name, 'game_start');
  assert.deepEqual(delivery.getStats(), {
    enqueued: 1,
    delivered: 1,
    failed: 0,
    dropped: 0,
    flushAttempts: 1,
    requeued: 0,
    lastErrorMessage: null,
    queueSize: 0,
  });

  delivery.stop();
});

test('analytics delivery re-queues batch when request returns non-ok', async () => {
  const eventTarget = createEventTargetMock();
  const delivery = createAnalyticsDelivery({
    eventTarget,
    maxBatchSize: 5,
    flushIntervalMs: 10000,
    requestFn: async () => ({ ok: false, status: 500, data: {} }),
    loggerInstance: { warn() {} }
  });

  eventTarget.dispatch(ANALYTICS_TRACK_EVENT, {
    name: 'currency_spent',
    payload: { amount: 10 },
    timestamp: 2
  });

  await delivery.flush();
  assert.equal(delivery.getQueueSize(), 1);
  assert.equal(delivery.getStats().failed, 1);
  assert.equal(delivery.getStats().requeued, 1);
  delivery.stop();
});

test('analytics delivery tracks dropped events when queue overflows', async () => {
  const eventTarget = createEventTargetMock();
  const delivery = createAnalyticsDelivery({
    eventTarget,
    maxBatchSize: 50,
    maxQueueSize: 2,
    flushIntervalMs: 10000,
    requestFn: async () => ({ ok: true, status: 200, data: {} }),
    loggerInstance: { warn() {} }
  });

  eventTarget.dispatch(ANALYTICS_TRACK_EVENT, { name: 'e1', payload: {}, timestamp: 1 });
  eventTarget.dispatch(ANALYTICS_TRACK_EVENT, { name: 'e2', payload: {}, timestamp: 2 });
  eventTarget.dispatch(ANALYTICS_TRACK_EVENT, { name: 'e3', payload: {}, timestamp: 3 });

  assert.equal(delivery.getQueueSize(), 2);
  assert.equal(delivery.getStats().dropped, 1);
  delivery.stop();
});
