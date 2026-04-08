import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const DEFAULT_REPORT_PATH = 'docs/rollback-gate-report-latest.json';
const MAX_DRILL_AGE_DAYS = 30;

function isIsoDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function requireTrue(value, fieldPath) {
  if (value !== true) {
    throw new Error(`${fieldPath} must be true`);
  }
}

function validateRollbackGateReport(report, now = new Date()) {
  if (!report || typeof report !== 'object') {
    throw new Error('Report payload must be an object');
  }
  if (report.gate !== 'rollback-hotfix') {
    throw new Error('report.gate must be "rollback-hotfix"');
  }
  if (report.status !== 'approved') {
    throw new Error(`report.status must be "approved", got "${report.status}"`);
  }
  if (!isIsoDate(report.lastDrillAt)) {
    throw new Error('report.lastDrillAt must be a valid ISO date');
  }

  const drillDate = new Date(report.lastDrillAt);
  const ageDays = (now.getTime() - drillDate.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > MAX_DRILL_AGE_DAYS) {
    throw new Error(`rollback drill is too old: ${ageDays.toFixed(1)} days (max ${MAX_DRILL_AGE_DAYS})`);
  }
  if (ageDays < -1) {
    throw new Error('report.lastDrillAt cannot be in the future');
  }

  const checklist = report.checklist;
  if (!checklist || typeof checklist !== 'object') {
    throw new Error('report.checklist must be an object');
  }

  requireTrue(checklist.releaseTagPinned, 'checklist.releaseTagPinned');
  requireTrue(checklist.rollbackCommandValidated, 'checklist.rollbackCommandValidated');
  requireTrue(checklist.dbBackwardCompatibilityVerified, 'checklist.dbBackwardCompatibilityVerified');
  requireTrue(checklist.hotfixBranchFlowValidated, 'checklist.hotfixBranchFlowValidated');
  requireTrue(checklist.onCallNotified, 'checklist.onCallNotified');
  requireTrue(checklist.incidentTemplateReady, 'checklist.incidentTemplateReady');
}

function main() {
  const reportPath = process.argv[2] || DEFAULT_REPORT_PATH;
  const fullPath = path.resolve(rootDir, reportPath);
  const report = JSON.parse(readFileSync(fullPath, 'utf8'));
  validateRollbackGateReport(report);
  console.log(`✅ rollback gate passed (${reportPath})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(`❌ rollback gate failed: ${error.message}`);
    process.exit(1);
  }
}

export { validateRollbackGateReport };
