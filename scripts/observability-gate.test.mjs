import test from 'node:test';
import assert from 'node:assert/strict';
import { validateObservabilityGateReport } from './check-observability-gate.mjs';

function createValidReport() {
  return {
    gate: 'observability-e2e',
    status: 'approved',
    windows: [
      {
        windowId: 'release-canary-1',
        sent: 400,
        delivered: 400,
        failed: 0,
        dropped: 0,
        retries: 3,
      },
    ],
  };
}

test('validateObservabilityGateReport accepts approved lossless report', () => {
  assert.doesNotThrow(() => validateObservabilityGateReport(createValidReport()));
});

test('validateObservabilityGateReport rejects failed delivery windows', () => {
  const report = createValidReport();
  report.windows[0].failed = 1;
  assert.throws(() => validateObservabilityGateReport(report), /failed must be 0/);
});

test('validateObservabilityGateReport rejects dropped events', () => {
  const report = createValidReport();
  report.windows[0].dropped = 1;
  assert.throws(() => validateObservabilityGateReport(report), /dropped must be 0/);
});

test('validateObservabilityGateReport rejects non-approved report status', () => {
  const report = createValidReport();
  report.status = 'pending';
  assert.throws(() => validateObservabilityGateReport(report), /status must be "approved"/);
});
