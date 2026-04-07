function isTelegramMiniApp() {
  return !!(window.Telegram && window.Telegram.WebApp &&
    window.Telegram.WebApp.initDataUnsafe &&
    window.Telegram.WebApp.initDataUnsafe.user);
}

function getTelegramInitData() {
  return String(window.Telegram?.WebApp?.initData || '').trim();
}

async function waitForTelegramMiniApp({ timeoutMs = 2500, pollMs = 50 } = {}) {
  if (isTelegramMiniApp()) return true;
  const startedAt = Date.now();

  while ((Date.now() - startedAt) < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    if (isTelegramMiniApp()) return true;
  }

  return false;
}

function getTelegramUserData() {
  if (!isTelegramMiniApp()) return null;
  const user = window.Telegram.WebApp.initDataUnsafe.user;
  const id = String(user.id || '').trim();
  const username = String(user.username || '').trim();
  const loginIdentifier = username || id;
  return {
    id,
    firstName: user.first_name || '',
    username,
    loginIdentifier,
    displayName: username || id || user.first_name || `TG#${user.id}`
  };
}

export {
  isTelegramMiniApp,
  getTelegramInitData,
  waitForTelegramMiniApp,
  getTelegramUserData,
};
