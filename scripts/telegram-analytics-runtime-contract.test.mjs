import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('runtime loader stays separate from Telegram analytics SDK', () => {
  const loaderSource = readFileSync('js/runtime-sdk-loader.js', 'utf8');
  assert.equal(loaderSource.includes('tganalytics'), false);
  assert.equal(loaderSource.includes('telegram-analytics'), false);
});

test('Telegram analytics init remains owned by main bootstrap', () => {
  const mainSource = readFileSync('js/main.js', 'utf8');
  assert.match(mainSource, /telegram-analytics\.js/);
  assert.match(mainSource, /initTelegramAnalytics/);
  assert.match(mainSource, /scheduleTelegramAnalyticsInit/);
});

test('Telegram analytics keeps its own CDN loader and launch guard', () => {
  const analyticsSource = readFileSync('js/telegram-analytics.js', 'utf8');
  assert.match(analyticsSource, /tganalytics\.xyz\/index\.js/);
  assert.match(analyticsSource, /loadTelegramAnalyticsSdk/);
  assert.match(analyticsSource, /hasTelegramLaunchParams/);
  assert.match(analyticsSource, /window\.Telegram\?\.WebApp/);
});
