import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('main bootstrap prepares runtime loader before Telegram analytics init', () => {
  const source = readFileSync('js/main.js', 'utf8');
  const loaderImport = source.indexOf("./runtime-sdk-loader.js");
  const analyticsImport = source.indexOf("./telegram-analytics.js");
  const loaderCall = source.indexOf('loadRuntimeSdk();');
  const analyticsSchedule = source.indexOf('scheduleTelegramAnalyticsInit();');

  assert.notEqual(loaderImport, -1);
  assert.notEqual(analyticsImport, -1);
  assert.notEqual(loaderCall, -1);
  assert.notEqual(analyticsSchedule, -1);
  assert.ok(loaderCall < analyticsSchedule);
});
