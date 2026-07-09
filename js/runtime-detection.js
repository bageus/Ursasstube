function hasTelegramWebAppData() {
  if (typeof window === 'undefined') return false;

  try {
    const search = new URLSearchParams(window.location.search || '');
    const hash = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
    return Boolean(search.get('tgWebAppData') || hash.get('tgWebAppData'));
  } catch (_error) {
    return false;
  }
}

function hasTelegramWebAppStartParam() {
  if (typeof window === 'undefined') return false;

  try {
    const search = new URLSearchParams(window.location.search || '');
    const hash = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
    return Boolean(search.get('tgWebAppStartParam') || hash.get('tgWebAppStartParam'));
  } catch (_error) {
    return false;
  }
}

function hasTelegramUserAgent() {
  if (typeof navigator === 'undefined') return false;
  return /Telegram/i.test(navigator.userAgent || '');
}

export function isTelegramRuntime() {
  if (typeof window === 'undefined') return false;
  const webApp = window.Telegram?.WebApp;
  const hasInitData = typeof webApp?.initData === 'string' && webApp.initData.length > 0;
  return Boolean(hasInitData || hasTelegramWebAppData() || hasTelegramWebAppStartParam() || hasTelegramUserAgent());
}
