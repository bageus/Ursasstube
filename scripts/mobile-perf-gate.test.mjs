import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMobilePerfReport } from './check-mobile-perf-gate.mjs';

function createValidReport() {
  return {
    gate: 'mobile-perf',
    status: 'approved',
    devices: [
      {
        deviceId: 'ios-iphone-13',
        deviceName: 'iPhone 13',
        measurementMode: 'real-device',
        sampleCount: 420,
        fpsP50: 60,
        frameMsP95: 18.9,
      },
      {
        deviceId: 'android-pixel-7',
        deviceName: 'Pixel 7',
        measurementMode: 'real-device',
        sampleCount: 390,
        fpsP50: 58,
        frameMsP95: 20.3,
      },
    ],
  };
}

test('validateMobilePerfReport accepts approved report above thresholds', () => {
  assert.doesNotThrow(() => validateMobilePerfReport(createValidReport()));
});

test('validateMobilePerfReport rejects non-approved report status', () => {
  const report = createValidReport();
  report.status = 'pending';
  assert.throws(() => validateMobilePerfReport(report), /status must be "approved"/);
});

test('validateMobilePerfReport rejects non real-device measurement mode', () => {
  const report = createValidReport();
  report.devices[0].measurementMode = 'synthetic';
  assert.throws(() => validateMobilePerfReport(report), /measurementMode must be "real-device"/);
});

test('validateMobilePerfReport rejects FPS and frametime threshold violations', () => {
  const report = createValidReport();
  report.devices[1].fpsP50 = 49;
  assert.throws(() => validateMobilePerfReport(report), /fpsP50=49 is below threshold/);

  report.devices[1].fpsP50 = 58;
  report.devices[1].frameMsP95 = 29;
  assert.throws(() => validateMobilePerfReport(report), /frameMsP95=29 exceeds threshold/);
});
