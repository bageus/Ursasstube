import test from 'node:test';
import assert from 'node:assert/strict';
import { ANALYTICS_TRACK_EVENT, trackAnalyticsEvent, sanitizeAnalyticsPayload } from '../js/analytics.js';

test('sanitizeAnalyticsPayload removes undefined and function values', () => {
  const payload = sanitizeAnalyticsPayload({
    score: 100,
    note: undefined,
    handler: () => {}
  });

  assert.deepEqual(payload, { score: 100 });
});

test('trackAnalyticsEvent dispatches browser event with normalized payload', () => {
  const previousWindow = globalThis.window;
  const target = new EventTarget();
  let captured = null;

  target.dispatchEvent = target.dispatchEvent.bind(target);
  target.addEventListener = target.addEventListener.bind(target);
  target.removeEventListener = target.removeEventListener.bind(target);
  target.addEventListener(ANALYTICS_TRACK_EVENT, (event) => {
    captured = event.detail;
  });

  globalThis.window = target;

  try {
    const result = trackAnalyticsEvent('game_end', {
      score: 123,
      reason: 'Spikes',
      ignored: undefined
    });

    assert.equal(result.name, 'game_end');
    assert.equal(result.payload.score, 123);
    assert.equal(result.payload.reason, 'Spikes');
    assert.equal(Object.hasOwn(result.payload, 'ignored'), false);
    assert.equal(captured?.name, 'game_end');
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
