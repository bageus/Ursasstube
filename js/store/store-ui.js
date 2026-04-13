import { DOM } from '../state.js';
import { showRulesScreen, hideRulesScreen } from '../screens.js';
import { syncAllAudioUI } from '../audio.js';
import { syncRulesControls } from '../ai-mode.js';

export function createStoreUiController({
  isAuthenticated,
  loadDonationProducts,
  loadDonationHistory,
  closeDonationModal,
  renderDonationProducts,
  renderDonationHistory,
  updateRidesDisplay,
  applyStoreDefaultLockState
}) {
  let activeStoreTab = 'upgrade';

  function setActiveStoreTab(tab) {
    activeStoreTab = tab === 'donation' ? 'donation' : 'upgrade';

    document.querySelectorAll('[data-store-tab]').forEach((button) => {
      const isActive = button.dataset.storeTab === activeStoreTab;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });

    document.querySelectorAll('[data-store-panel]').forEach((panel) => {
      const isActive = panel.dataset.storePanel === activeStoreTab;
      panel.classList.toggle('is-active', isActive);
      panel.hidden = !isActive;
    });

    if (activeStoreTab === 'donation' && isAuthenticated()) {
      loadDonationProducts();
      loadDonationHistory();
    }
  }

  function bindDonationUi() {
    document.querySelectorAll('[data-store-tab]').forEach((button) => {
      button.addEventListener('click', () => setActiveStoreTab(button.dataset.storeTab));
    });

    document.querySelectorAll('[data-donation-close]').forEach((button) => {
      button.addEventListener('click', closeDonationModal);
    });
  }

  function resetStoreUiState() {
    applyStoreDefaultLockState();
    setActiveStoreTab('upgrade');
    renderDonationProducts();
    renderDonationHistory();
    closeDonationModal();
    updateRidesDisplay();
  }

  function showRules() {
    showRulesScreen();
    syncRulesControls();
    if (DOM.rulesScreen) {
      updateRulesAudioButtons();
    }
  }

  function hideRules() {
    hideRulesScreen();
  }

  function updateRulesAudioButtons() {
    syncAllAudioUI();
  }

  return {
    setActiveStoreTab,
    bindDonationUi,
    resetStoreUiState,
    showRules,
    hideRules,
    updateRulesAudioButtons
  };
}
