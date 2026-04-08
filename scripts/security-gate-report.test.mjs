import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSecurityGateReport } from './check-security-gate-report.mjs';

function createValidReport() {
  return {
    gate: 'security',
    command: 'npm audit --omit=dev --audit-level=moderate',
    auditedAt: '2026-04-08T12:00:00.000Z',
    ciRunUrl: 'https://github.com/example/repo/actions/runs/123',
    status: 'approved',
  };
}

test('validateSecurityGateReport accepts approved report', () => {
  assert.doesNotThrow(() => validateSecurityGateReport(createValidReport()));
});

test('validateSecurityGateReport rejects missing ci url', () => {
  const report = createValidReport();
  report.ciRunUrl = '';
  assert.throws(() => validateSecurityGateReport(report), /ciRunUrl/);
});

test('validateSecurityGateReport rejects non-approved status', () => {
  const report = createValidReport();
  report.status = 'pending';
  assert.throws(() => validateSecurityGateReport(report), /status must be "approved"/);
});
