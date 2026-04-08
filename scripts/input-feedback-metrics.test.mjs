import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInputFeedbackMetrics } from '../js/game/input-feedback-metrics.js';

test('buildInputFeedbackMetrics returns good bucket for low latency', () => {
  assert.deepEqual(
    buildInputFeedbackMetrics({
      inputLatencySumMs: 360,
      inputLatencySampleCount: 3,
    }),
    {
      input_latency_sample_count: 3,
      input_latency_avg_ms: 120,
      input_feedback_bucket: 'good',
    },
  );
});

test('buildInputFeedbackMetrics returns late bucket for high latency', () => {
  assert.deepEqual(
    buildInputFeedbackMetrics({
      inputLatencySumMs: 1500,
      inputLatencySampleCount: 5,
    }),
    {
      input_latency_sample_count: 5,
      input_latency_avg_ms: 300,
      input_feedback_bucket: 'late',
    },
  );
});

test('buildInputFeedbackMetrics normalizes invalid numbers', () => {
  assert.deepEqual(
    buildInputFeedbackMetrics({
      inputLatencySumMs: Number.NaN,
      inputLatencySampleCount: -3,
    }),
    {
      input_latency_sample_count: 0,
      input_latency_avg_ms: 0,
      input_feedback_bucket: 'good',
    },
  );
});
