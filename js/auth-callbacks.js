const authCallbacks = {
  onWalletUiUpdate: async () => {},
  onLoadPlayerUpgrades: async () => {},
  onLoadLeaderboard: async () => {},
  onUpdateRidesDisplay: () => {},
  onAuthDisconnected: () => {}
};

function setAuthCallbacks(callbacks = {}) {
  if (typeof callbacks.onWalletUiUpdate === 'function') authCallbacks.onWalletUiUpdate = callbacks.onWalletUiUpdate;
  if (typeof callbacks.onLoadPlayerUpgrades === 'function') authCallbacks.onLoadPlayerUpgrades = callbacks.onLoadPlayerUpgrades;
  if (typeof callbacks.onLoadLeaderboard === 'function') authCallbacks.onLoadLeaderboard = callbacks.onLoadLeaderboard;
  if (typeof callbacks.onUpdateRidesDisplay === 'function') authCallbacks.onUpdateRidesDisplay = callbacks.onUpdateRidesDisplay;
  if (typeof callbacks.onAuthDisconnected === 'function') authCallbacks.onAuthDisconnected = callbacks.onAuthDisconnected;
}

async function runPostAuthSync({ withLeaderboard = true, withRidesDisplay = true } = {}) {
  await authCallbacks.onWalletUiUpdate();
  await authCallbacks.onLoadPlayerUpgrades();
  if (withLeaderboard) {
    await authCallbacks.onLoadLeaderboard();
  }
  if (withRidesDisplay) {
    authCallbacks.onUpdateRidesDisplay();
  }
}

function notifyAuthDisconnected() {
  authCallbacks.onAuthDisconnected();
}

export {
  setAuthCallbacks,
  runPostAuthSync,
  notifyAuthDisconnected,
};
