import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const DEFAULT_REPORT_PATH = 'docs/mobile-perf-gate-report-latest.json';
const DEFAULT_THRESHOLDS = Object.freeze({
  minDevices: 2,
  minFpsP50: 55,
  maxFrameMsP95: 22,
  minSampleCount: 300,
});

function assertFiniteNumber(value, fieldPath) {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid number at ${fieldPath}`);
  }
}

function validateDeviceSample(sample, index, thresholds = DEFAULT_THRESHOLDS) {
  const fieldPrefix = `devices[${index}]`;
  if (!sample || typeof sample !== 'object') {
    throw new Error(`Invalid object at ${fieldPrefix}`);
  }
  if (!sample.deviceId || typeof sample.deviceId !== 'string') {
    throw new Error(`Missing non-empty string at ${fieldPrefix}.deviceId`);
  }
  if (!sample.deviceName || typeof sample.deviceName !== 'string') {
    throw new Error(`Missing non-empty string at ${fieldPrefix}.deviceName`);
  }
  if (sample.measurementMode !== 'real-device') {
    throw new Error(`${fieldPrefix}.measurementMode must be "real-device"`);
  }
  assertFiniteNumber(sample.sampleCount, `${fieldPrefix}.sampleCount`);
  assertFiniteNumber(sample.fpsP50, `${fieldPrefix}.fpsP50`);
  assertFiniteNumber(sample.frameMsP95, `${fieldPrefix}.frameMsP95`);

  if (sample.sampleCount < thresholds.minSampleCount) {
    throw new Error(`${fieldPrefix}.sampleCount=${sample.sampleCount} is below threshold ${thresholds.minSampleCount}`);
  }
  if (sample.fpsP50 < thresholds.minFpsP50) {
    throw new Error(`${fieldPrefix}.fpsP50=${sample.fpsP50} is below threshold ${thresholds.minFpsP50}`);
  }
  if (sample.frameMsP95 > thresholds.maxFrameMsP95) {
    throw new Error(`${fieldPrefix}.frameMsP95=${sample.frameMsP95} exceeds threshold ${thresholds.maxFrameMsP95}`);
  }
}

function validateMobilePerfReport(report, thresholds = DEFAULT_THRESHOLDS) {
  if (!report || typeof report !== 'object') {
    throw new Error('Report payload must be an object');
  }

  if (report.gate !== 'mobile-perf') {
    throw new Error('report.gate must be "mobile-perf"');
  }

  if (!Array.isArray(report.devices)) {
    throw new Error('report.devices must be an array');
  }

  if (report.devices.length < thresholds.minDevices) {
    throw new Error(`report.devices must contain at least ${thresholds.minDevices} device samples`);
  }

  for (let i = 0; i < report.devices.length; i += 1) {
    validateDeviceSample(report.devices[i], i, thresholds);
  }

  if (report.status !== 'approved') {
    throw new Error(`report.status must be "approved", got "${report.status}"`);
  }
}

function loadJson(jsonPath) {
  const fullPath = path.resolve(rootDir, jsonPath);
  const raw = readFileSync(fullPath, 'utf8');
  return JSON.parse(raw);
}

function main() {
  const reportPath = process.argv[2] || DEFAULT_REPORT_PATH;
  const report = loadJson(reportPath);
  validateMobilePerfReport(report);
  console.log(`✅ mobile perf gate passed (${reportPath})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(`❌ mobile perf gate failed: ${error.message}`);
    process.exit(1);
  }
}

export {
  validateMobilePerfReport,
};
