import test from 'node:test';
import assert from 'node:assert/strict';

test('runPostAuthSync swallows leaderboard failures and completes', async () => {
  const mod = await import(`../js/auth-callbacks.js?t=${Date.now()}`);
  let ridesUpdated = false;
  let authNotified = false;

  mod.setAuthCallbacks({
    onWalletUiUpdate: async () => {},
    onLoadPlayerUpgrades: async () => {},
    onLoadLeaderboard: async () => { throw new Error('timeout'); },
    onUpdateRidesDisplay: () => { ridesUpdated = true; },
    onAuthAuthenticated: () => { authNotified = true; }
  });

  await assert.doesNotReject(() => mod.runPostAuthSync());
  assert.equal(ridesUpdated, true);
  assert.equal(authNotified, true);
});

