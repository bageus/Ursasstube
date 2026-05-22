const authCallbacks = {
  onWalletUiUpdate: async () => {},
  onLoadPlayerUpgrades: async () => {},
  onLoadLeaderboard: async () => {},
  onUpdateRidesDisplay: () => {},
  onAuthDisconnected: () => {},
  onAuthAuthenticated: () => {}
};

function setAuthCallbacks(callbacks = {}) {
  if (typeof callbacks.onWalletUiUpdate === 'function') authCallbacks.onWalletUiUpdate = callbacks.onWalletUiUpdate;
  if (typeof callbacks.onLoadPlayerUpgrades === 'function') authCallbacks.onLoadPlayerUpgrades = callbacks.onLoadPlayerUpgrades;
  if (typeof callbacks.onLoadLeaderboard === 'function') authCallbacks.onLoadLeaderboard = callbacks.onLoadLeaderboard;
  if (typeof callbacks.onUpdateRidesDisplay === 'function') authCallbacks.onUpdateRidesDisplay = callbacks.onUpdateRidesDisplay;
  if (typeof callbacks.onAuthDisconnected === 'function') authCallbacks.onAuthDisconnected = callbacks.onAuthDisconnected;
  if (typeof callbacks.onAuthAuthenticated === 'function') authCallbacks.onAuthAuthenticated = callbacks.onAuthAuthenticated;
}

async function runPostAuthSync({ withLeaderboard = true, withRidesDisplay = true } = {}) {
  await authCallbacks.onWalletUiUpdate();
  await authCallbacks.onLoadPlayerUpgrades();
  if (withLeaderboard) {
    try {
      await authCallbacks.onLoadLeaderboard();
    } catch (_error) {
      // Optional branch: leaderboard must never block auth-ready or app-ready flows.
    }
  }
  if (withRidesDisplay) {
    authCallbacks.onUpdateRidesDisplay();
  }
  authCallbacks.onAuthAuthenticated();
}

function notifyAuthDisconnected() {
  authCallbacks.onAuthDisconnected();
}

export {
  setAuthCallbacks,
  runPostAuthSync,
  notifyAuthDisconnected,
};
