import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMetricsReport } from '../js/analytics-metrics.js';

test('buildMetricsReport computes avg runtime, conversion and retention', () => {
  const events = [
    { name: 'game_start', timestamp: Date.parse('2026-04-01T10:00:00Z'), payload: { wallet: '0xaaa' } },
    { name: 'session_length', timestamp: Date.parse('2026-04-01T10:10:00Z'), payload: { wallet: '0xaaa', duration_seconds: 120 } },
    { name: 'upgrade_purchase', timestamp: Date.parse('2026-04-02T11:00:00Z'), payload: { wallet: '0xaaa' } },
    { name: 'game_start', timestamp: Date.parse('2026-04-01T09:00:00Z'), payload: { wallet: '0xbbb' } },
    { name: 'session_length', timestamp: Date.parse('2026-04-01T09:06:00Z'), payload: { wallet: '0xbbb', duration_seconds: 60 } },
    { name: 'game_start', timestamp: Date.parse('2026-04-08T12:00:00Z'), payload: { wallet: '0xaaa' } },
    { name: 'game_end', timestamp: Date.parse('2026-04-08T12:10:00Z'), payload: { wallet: '0xaaa', run_duration: 18, difficulty_segment: 'new' } },
    { name: 'game_end', timestamp: Date.parse('2026-04-08T12:15:00Z'), payload: { wallet: '0xaaa', run_duration: 42, difficulty_segment: 'new' } }
  ];

  const report = buildMetricsReport(events);
  assert.equal(report.totalEvents, 8);
  assert.equal(report.users, 2);
  assert.equal(report.avgRunTimeSeconds, 90);
  assert.equal(report.conversion, 0.5);
  assert.equal(report.retentionD1, 0.5);
  assert.equal(report.retentionD7, 0.5);
  assert.deepEqual(report.difficultySegments.new, {
    runs: 2,
    avgRunDurationSeconds: 30,
    gameoverUnder20sRate: 0.5,
  });
});
