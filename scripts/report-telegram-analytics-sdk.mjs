import { readFileSync } from 'node:fs';
import {
  TG_ANALYTICS_CDN_URL,
  TG_ANALYTICS_GLOBAL_NAMES,
} from '../js/telegram-analytics-diagnostics.js';

const source = readFileSync('js/telegram-analytics.js', 'utf8');

const checks = {
  cdnUrl: TG_ANALYTICS_CDN_URL,
  expectedGlobals: TG_ANALYTICS_GLOBAL_NAMES,
  sourceUsesCdnUrl: source.includes(TG_ANALYTICS_CDN_URL),
  sourceChecksGlobals: TG_ANALYTICS_GLOBAL_NAMES.filter((name) => source.includes(`window.${name}`)),
  sourceHasScriptMarker: source.includes('data-tg-analytics-sdk') || source.includes('tgAnalyticsSdk'),
  sourceHasLoadFunction: source.includes('function loadTelegramAnalyticsSdk'),
  sourceHasInitFunction: source.includes('function initTelegramAnalytics'),
  sourceHasTraceEndpoint: source.includes('tganalytics.xyz/events'),
};

const consoleSnippet = `(() => {\n  const globals = ${JSON.stringify(TG_ANALYTICS_GLOBAL_NAMES)}.map((name) => {\n    const client = window[name];\n    return { name, present: Boolean(client), keys: client && typeof client === 'object' ? Object.keys(client).slice(0, 20) : [] };\n  });\n  const scripts = [...document.querySelectorAll('script[src]')]\n    .filter((script) => script.src === '${TG_ANALYTICS_CDN_URL}' || script.dataset.tgAnalyticsSdk === 'true')\n    .map((script) => ({ src: script.src, async: script.async, marker: script.dataset.tgAnalyticsSdk || null }));\n  return { scripts, globals, telegramWebApp: Boolean(window.Telegram?.WebApp), tgPlatform: window.Telegram?.WebApp?.platform || null };\n})()`;

console.log('Telegram analytics SDK report');
console.log(JSON.stringify({ ...checks, consoleSnippet }, null, 2));

if (!checks.sourceUsesCdnUrl) {
  console.error('telegram-analytics.js does not use the configured SDK URL.');
  process.exit(1);
}
if (checks.sourceChecksGlobals.length === 0) {
  console.error('telegram-analytics.js does not check expected analytics globals.');
  process.exit(1);
}
if (!checks.sourceHasLoadFunction || !checks.sourceHasInitFunction) {
  console.error('telegram-analytics.js loader/init contract is missing.');
  process.exit(1);
}
