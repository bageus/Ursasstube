import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const DEFAULT_REPORT_PATH = 'docs/security-gate-report-latest.json';

function isValidIso(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function validateSecurityGateReport(report) {
  if (!report || typeof report !== 'object') {
    throw new Error('report must be an object');
  }
  if (report.gate !== 'security') {
    throw new Error('report.gate must be "security"');
  }
  if (report.command !== 'npm audit --omit=dev --audit-level=moderate') {
    throw new Error('report.command must match required security gate command');
  }
  if (!isValidIso(report.auditedAt)) {
    throw new Error('report.auditedAt must be a valid ISO date');
  }
  if (!report.ciRunUrl || typeof report.ciRunUrl !== 'string') {
    throw new Error('report.ciRunUrl must be a non-empty string');
  }
  if (report.status !== 'approved') {
    throw new Error(`report.status must be "approved", got "${report.status}"`);
  }
}

function main() {
  const reportPath = process.argv[2] || DEFAULT_REPORT_PATH;
  const fullPath = path.resolve(rootDir, reportPath);
  const report = JSON.parse(readFileSync(fullPath, 'utf8'));
  validateSecurityGateReport(report);
  console.log(`✅ security gate report passed (${reportPath})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(`❌ security gate report failed: ${error.message}`);
    process.exit(1);
  }
}

export { validateSecurityGateReport };
