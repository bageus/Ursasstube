function onDomReady(callback) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback, { once: true });
    return;
  }

  callback();
}

function createStoreBootstrap({
  applyStoreDefaultLockState,
  bindDonationUi,
  setActiveStoreTab,
  renderDonationProducts,
  cleanupDonationAsync
}) {
  let storeBootstrapInitialized = false;

  function initializeStoreScreen() {
    applyStoreDefaultLockState();
    bindDonationUi();
    setActiveStoreTab('upgrade');
    renderDonationProducts();
  }

  function initStoreBootstrap() {
    if (storeBootstrapInitialized) return;

    onDomReady(initializeStoreScreen);
    window.addEventListener('beforeunload', cleanupDonationAsync);
    storeBootstrapInitialized = true;
  }

  return { initStoreBootstrap };
}

export { createStoreBootstrap };
