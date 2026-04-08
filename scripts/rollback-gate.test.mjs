import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRollbackGateReport } from './check-rollback-gate.mjs';

function createValidReport() {
  return {
    gate: 'rollback-hotfix',
    status: 'approved',
    lastDrillAt: '2026-04-05T12:00:00.000Z',
    checklist: {
      releaseTagPinned: true,
      rollbackCommandValidated: true,
      dbBackwardCompatibilityVerified: true,
      hotfixBranchFlowValidated: true,
      onCallNotified: true,
      incidentTemplateReady: true,
    },
  };
}

test('validateRollbackGateReport accepts approved and fresh drill report', () => {
  const now = new Date('2026-04-08T00:00:00.000Z');
  assert.doesNotThrow(() => validateRollbackGateReport(createValidReport(), now));
});

test('validateRollbackGateReport rejects stale rollback drills', () => {
  const report = createValidReport();
  report.lastDrillAt = '2026-02-01T12:00:00.000Z';
  const now = new Date('2026-04-08T00:00:00.000Z');
  assert.throws(() => validateRollbackGateReport(report, now), /too old/);
});

test('validateRollbackGateReport rejects missing checklist items', () => {
  const report = createValidReport();
  report.checklist.hotfixBranchFlowValidated = false;
  const now = new Date('2026-04-08T00:00:00.000Z');
  assert.throws(() => validateRollbackGateReport(report, now), /hotfixBranchFlowValidated must be true/);
});

test('validateRollbackGateReport rejects non-approved status', () => {
  const report = createValidReport();
  report.status = 'pending';
  const now = new Date('2026-04-08T00:00:00.000Z');
  assert.throws(() => validateRollbackGateReport(report, now), /status must be "approved"/);
});
