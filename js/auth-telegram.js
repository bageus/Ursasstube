function isTelegramMiniApp() {
  return !!(window.Telegram && window.Telegram.WebApp &&
    window.Telegram.WebApp.initDataUnsafe &&
    window.Telegram.WebApp.initDataUnsafe.user);
}

function getTelegramUserData() {
  if (!isTelegramMiniApp()) return null;
  const user = window.Telegram.WebApp.initDataUnsafe.user;
  return {
    id: String(user.id),
    firstName: user.first_name || '',
    username: user.username || '',
    displayName: user.first_name || user.username || `TG#${user.id}`
  };
}

export {
  isTelegramMiniApp,
  getTelegramUserData,
};
