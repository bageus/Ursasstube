import { isAuthenticated } from './api.js';
import { isTelegramAuthMode, getPrimaryAuthIdentifier, getTelegramAuthIdentifier } from './auth.js';
import { createRuntimeConfigController } from './store/runtime-config.js';
import { createRidesService, resetPlayerRides, setPlayerRides } from './store/rides-service.js';
import { createUpgradesService, resetUpgradeState, setPlayerStoreState } from './store/upgrades-service.js';
import { createDonationController } from './store/donation-controller.js';
import { createStoreBootstrap } from './store/bootstrap.js';
import { createStoreUiController } from './store/store-ui.js';

function applyStorePlayerState({
  playerUpgrades: nextPlayerUpgrades = null,
  playerEffects: nextPlayerEffects = null,
  playerBalance: nextPlayerBalance = { gold: 0, silver: 0 },
  playerRides: nextPlayerRides = null
} = {}) {
  setPlayerStoreState({
    nextPlayerUpgrades,
    nextPlayerEffects,
    nextPlayerBalance
  });
  setPlayerRides(nextPlayerRides);
}

function resetStorePlayerState() {
  resetUpgradeState();
  resetPlayerRides();
}

function getStoreStateSnapshot() {
  return {
    runtimeGameConfig: getRuntimeGameConfig(),
    isStoreDataLoading,
    pendingStorePurchases: pendingStorePurchases.size
  };
}

const runtimeConfigController = createRuntimeConfigController({
  setPlayerState(nextPlayerState) {
    applyStorePlayerState(nextPlayerState);
  }
});

const {
  getRuntimeGameConfig,
  isUnauthRuntimeMode,
  isStoreAvailable,
  canPersistProgress,
  isEligibleForLeaderboardFlow,
  hasRideLimit,
  applyRuntimeConfig,
  loadUnauthGameConfig,
  clearRuntimeConfig
} = runtimeConfigController;

const { loadPlayerRides, useRide, updateRidesDisplay } = createRidesService({
  isUnauthRuntimeMode,
  hasRideLimit
});

/* ===== STORE SYSTEM ===== */

let isStoreDataLoading = false;
const pendingStorePurchases = new Set();

const donationController = createDonationController({
  loadPlayerUpgrades: () => loadPlayerUpgrades(),
  updateStoreUI: () => updateStoreUI()
});

const {
  closeDonationModal,
  loadDonationProducts,
  loadDonationHistory,
  renderDonationProducts,
  renderDonationHistory,
  renderDonationPaymentModal,
  cleanupDonationAsync,
  resetDonationState,
  getUiState: getDonationUiState
} = donationController;

const upgradesService = createUpgradesService({
  pendingStorePurchases,
  setStoreDataLoading(nextValue) {
    isStoreDataLoading = nextValue;
  },
  loadDonationProducts,
  loadDonationHistory,
  renderDonationProducts,
  renderDonationHistory,
  renderDonationPaymentModal,
  setPlayerRides,
  updateRidesDisplay,
  getPrimaryAuthIdentifier,
  getTelegramAuthIdentifier,
  isTelegramAuthMode,
  isStoreAvailable,
  getRuntimeGameConfig,
  clearRuntimeConfig,
  isUnauthRuntimeMode
});

const applyStoreDefaultLockState = () => upgradesService.applyStoreDefaultLockState({ buyUpgrade });
const loadPlayerUpgrades = () => upgradesService.loadPlayerUpgrades();
const updateStoreUI = () => upgradesService.updateStoreUI({ buyUpgrade });

const storeUiController = createStoreUiController({
  isAuthenticated,
  loadDonationProducts: () => {
    const donationUiState = getDonationUiState();
    if (donationUiState.products.length === 0 && !donationUiState.isLoading) {
      loadDonationProducts();
    }
  },
  loadDonationHistory: () => {
    const donationUiState = getDonationUiState();
    if (donationUiState.history.length === 0 && !donationUiState.historyLoading) {
      loadDonationHistory();
    }
  },
  closeDonationModal,
  renderDonationProducts,
  renderDonationHistory,
  updateRidesDisplay,
  applyStoreDefaultLockState
});

const {
  setActiveStoreTab,
  bindDonationUi,
  resetStoreUiState,
  showRules,
  hideRules,
  updateRulesAudioButtons
} = storeUiController;

function resetStoreState() {
  resetDonationState();
  resetStorePlayerState();
  clearRuntimeConfig();
  isStoreDataLoading = false;

  const goldEl = document.getElementById("storeGoldVal");
  const silverEl = document.getElementById("storeSilverVal");
  if (goldEl) goldEl.textContent = "0";
  if (silverEl) silverEl.textContent = "0";

  resetStoreUiState();
}

async function buyUpgrade(key, tier) {
  return upgradesService.buyUpgrade(key, tier, {
    isStoreDataLoading() {
      return isStoreDataLoading;
    }
  });
}



const { initStoreBootstrap } = createStoreBootstrap({
  applyStoreDefaultLockState,
  bindDonationUi,
  setActiveStoreTab,
  renderDonationProducts,
  cleanupDonationAsync
});

export {
  initStoreBootstrap,
  loadUnauthGameConfig,
  clearRuntimeConfig,
  isUnauthRuntimeMode,
  isStoreAvailable,
  canPersistProgress,
  isEligibleForLeaderboardFlow,
  hasRideLimit,
  loadPlayerRides,
  useRide,
  updateRidesDisplay,
  applyStoreDefaultLockState,
  loadPlayerUpgrades,
  updateStoreUI,
  getStoreStateSnapshot,
  resetStoreState,
  showRules,
  hideRules,
  setActiveStoreTab,
  closeDonationModal
};
