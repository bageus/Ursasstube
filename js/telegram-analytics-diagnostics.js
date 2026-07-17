const TG_ANALYTICS_CDN_URL = 'https://tganalytics.xyz/index.js';
const TG_ANALYTICS_GLOBAL_NAMES = Object.freeze([
  'telegramAnalytics',
  'TelegramAnalytics',
  'tgAnalytics',
]);

function getWindowObject(target = globalThis.window) {
  return target && typeof target === 'object' ? target : null;
}

function getScriptDiagnostics(windowObject) {
  const documentObject = windowObject?.document || globalThis.document;
  if (!documentObject || typeof documentObject.querySelectorAll !== 'function') return [];

  return [...documentObject.querySelectorAll('script[src]')]
    .filter((script) => script?.src === TG_ANALYTICS_CDN_URL || script?.dataset?.tgAnalyticsSdk === 'true')
    .map((script) => ({
      src: script.src || null,
      async: Boolean(script.async),
      hasDatasetMarker: script?.dataset?.tgAnalyticsSdk === 'true',
      readyState: script.readyState || null,
    }));
}

function getGlobalDiagnostics(windowObject) {
  return TG_ANALYTICS_GLOBAL_NAMES.map((name) => {
    const client = windowObject?.[name] || null;
    return {
      name,
      present: Boolean(client),
      type: client ? typeof client : 'undefined',
      hasInit: typeof client?.init === 'function',
      hasTrack: ['track', 'trackEvent', 'sendEvent', 'event'].some((key) => typeof client?.[key] === 'function'),
      keys: client && typeof client === 'object' ? Object.keys(client).slice(0, 20) : [],
    };
  });
}

function hasTelegramLaunchContext(windowObject) {
  const tg = windowObject?.Telegram?.WebApp;
  if (!tg || typeof tg !== 'object') return false;
  return Boolean(
    (typeof tg.initData === 'string' && tg.initData.trim())
    || (tg.initDataUnsafe && Object.keys(tg.initDataUnsafe).length > 0)
    || tg
  );
}

function getTelegramAnalyticsDiagnostics(targetWindow = globalThis.window) {
  const windowObject = getWindowObject(targetWindow);
  const scripts = getScriptDiagnostics(windowObject);
  const globals = getGlobalDiagnostics(windowObject);
  const detectedGlobals = globals.filter((entry) => entry.present).map((entry) => entry.name);
  const debugState = windowObject?.__tgAnalyticsDebug || null;
  const tg = windowObject?.Telegram?.WebApp || null;

  return {
    cdnUrl: TG_ANALYTICS_CDN_URL,
    expectedGlobals: [...TG_ANALYTICS_GLOBAL_NAMES],
    detectedGlobals,
    hasClient: detectedGlobals.length > 0,
    globals,
    scriptCount: scripts.length,
    scripts,
    telegramWebAppPresent: Boolean(tg),
    telegramPlatform: tg?.platform || null,
    hasTelegramLaunchContext: hasTelegramLaunchContext(windowObject),
    debug: debugState ? {
      enabled: debugState.enabled,
      initialized: Boolean(debugState.initialized),
      appName: debugState.appName || null,
      initAttempted: Boolean(debugState.initAttempted),
      reason: debugState.reason || null,
      error: debugState.error || null,
    } : null,
  };
}

export {
  TG_ANALYTICS_CDN_URL,
  TG_ANALYTICS_GLOBAL_NAMES,
  getTelegramAnalyticsDiagnostics,
};
