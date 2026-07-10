import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  TG_ANALYTICS_CDN_URL,
  TG_ANALYTICS_GLOBAL_NAMES,
  getTelegramAnalyticsDiagnostics,
} from '../js/telegram-analytics-diagnostics.js';

test('Telegram analytics diagnostics reports script and global state', () => {
  const scripts = [{
    src: TG_ANALYTICS_CDN_URL,
    async: true,
    dataset: { tgAnalyticsSdk: 'true' },
    readyState: 'complete',
  }];
  const fakeWindow = {
    telegramAnalytics: { init() {}, track() {}, version: 'test' },
    Telegram: { WebApp: { platform: 'tdesktop', initData: 'test' } },
    __tgAnalyticsDebug: {
      enabled: 'true',
      initialized: true,
      appName: 'ursas_tube',
      initAttempted: true,
      reason: 'initialized',
    },
    document: {
      querySelectorAll(selector) {
        return selector === 'script[src]' ? scripts : [];
      },
    },
  };

  const diagnostics = getTelegramAnalyticsDiagnostics(fakeWindow);

  assert.equal(diagnostics.cdnUrl, TG_ANALYTICS_CDN_URL);
  assert.deepEqual(diagnostics.expectedGlobals, TG_ANALYTICS_GLOBAL_NAMES);
  assert.deepEqual(diagnostics.detectedGlobals, ['telegramAnalytics']);
  assert.equal(diagnostics.hasClient, true);
  assert.equal(diagnostics.scriptCount, 1);
  assert.equal(diagnostics.telegramWebAppPresent, true);
  assert.equal(diagnostics.hasTelegramLaunchContext, true);
  assert.equal(diagnostics.debug.reason, 'initialized');
});

test('Telegram analytics SDK report command passes', () => {
  const result = spawnSync(process.execPath, ['scripts/report-telegram-analytics-sdk.mjs'], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Telegram analytics SDK report/);
  assert.match(result.stdout, /consoleSnippet/);
});
