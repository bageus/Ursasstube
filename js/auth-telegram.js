function isTelegramMiniApp() {
  return !!(window.Telegram && window.Telegram.WebApp &&
    window.Telegram.WebApp.initDataUnsafe &&
    window.Telegram.WebApp.initDataUnsafe.user);
}

function getTelegramUserData() {
  if (!isTelegramMiniApp()) return null;
  const user = window.Telegram.WebApp.initDataUnsafe.user;
  const id = String(user.id || '').trim();
  const username = String(user.username || '').trim();
  const loginIdentifier = username
    ? `${username}(${id})`
    : id;
  return {
    id,
    firstName: user.first_name || '',
    username,
    loginIdentifier,
    displayName: loginIdentifier || user.first_name || `TG#${user.id}`
  };
}

export {
  isTelegramMiniApp,
  getTelegramUserData,
};
