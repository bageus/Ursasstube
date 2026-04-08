import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const DEFAULT_REPORT_PATH = 'docs/observability-gate-report-latest.json';
const MIN_DELIVERY_RATE = 0.995;

function assertFiniteNumber(value, fieldPath) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Expected non-negative number at ${fieldPath}`);
  }
}

function validateChannelWindow(windowSample, index) {
  const prefix = `windows[${index}]`;
  if (!windowSample || typeof windowSample !== 'object') {
    throw new Error(`Expected object at ${prefix}`);
  }
  if (!windowSample.windowId || typeof windowSample.windowId !== 'string') {
    throw new Error(`Missing non-empty string at ${prefix}.windowId`);
  }

  const sent = Number(windowSample.sent);
  const delivered = Number(windowSample.delivered);
  const failed = Number(windowSample.failed);
  const dropped = Number(windowSample.dropped);
  const retries = Number(windowSample.retries ?? 0);

  assertFiniteNumber(sent, `${prefix}.sent`);
  assertFiniteNumber(delivered, `${prefix}.delivered`);
  assertFiniteNumber(failed, `${prefix}.failed`);
  assertFiniteNumber(dropped, `${prefix}.dropped`);
  assertFiniteNumber(retries, `${prefix}.retries`);

  if (sent === 0) {
    throw new Error(`${prefix}.sent must be > 0`);
  }
  if (delivered > sent) {
    throw new Error(`${prefix}.delivered (${delivered}) cannot exceed sent (${sent})`);
  }
  if (failed !== 0) {
    throw new Error(`${prefix}.failed must be 0 for observability gate`);
  }
  if (dropped !== 0) {
    throw new Error(`${prefix}.dropped must be 0 for observability gate`);
  }

  const deliveryRate = delivered / sent;
  if (deliveryRate < MIN_DELIVERY_RATE) {
    throw new Error(`${prefix}.deliveryRate=${deliveryRate.toFixed(4)} below ${MIN_DELIVERY_RATE.toFixed(3)}`);
  }
}

function validateObservabilityGateReport(report) {
  if (!report || typeof report !== 'object') {
    throw new Error('Report payload must be an object');
  }
  if (report.gate !== 'observability-e2e') {
    throw new Error('report.gate must be "observability-e2e"');
  }
  if (!Array.isArray(report.windows) || report.windows.length === 0) {
    throw new Error('report.windows must contain at least one window sample');
  }
  for (let i = 0; i < report.windows.length; i += 1) {
    validateChannelWindow(report.windows[i], i);
  }
  if (report.status !== 'approved') {
    throw new Error(`report.status must be "approved", got "${report.status}"`);
  }
}

function main() {
  const reportPath = process.argv[2] || DEFAULT_REPORT_PATH;
  const fullPath = path.resolve(rootDir, reportPath);
  const report = JSON.parse(readFileSync(fullPath, 'utf8'));
  validateObservabilityGateReport(report);
  console.log(`✅ observability gate passed (${reportPath})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(`❌ observability gate failed: ${error.message}`);
    process.exit(1);
  }
}

export { validateObservabilityGateReport };
