import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateReleaseGates, formatSummary } from './check-release-gates.mjs';

const REPORTS = [
  { gate: 'security', path: 'security.json' },
  { gate: 'mobile-perf', path: 'mobile.json' },
];

test('evaluateReleaseGates returns ready=true when all reports are approved', () => {
  const summary = evaluateReleaseGates(REPORTS, (reportPath) => {
    if (reportPath === 'security.json') return { gate: 'security', status: 'approved' };
    return { gate: 'mobile-perf', status: 'approved' };
  });

  assert.equal(summary.ready, true);
  assert.equal(summary.pending.length, 0);
});

test('evaluateReleaseGates marks pending when report status is not approved', () => {
  const summary = evaluateReleaseGates(REPORTS, (reportPath) => {
    if (reportPath === 'security.json') return { gate: 'security', status: 'pending' };
    return { gate: 'mobile-perf', status: 'approved' };
  });

  assert.equal(summary.ready, false);
  assert.equal(summary.pending.length, 1);
  assert.match(formatSummary(summary), /Pending gates: 1/);
});

test('evaluateReleaseGates marks pending when gate id mismatches', () => {
  const summary = evaluateReleaseGates(REPORTS, () => ({ gate: 'wrong', status: 'approved' }));
  assert.equal(summary.ready, false);
  assert.equal(summary.pending.length, 2);
});
