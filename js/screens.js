import { DOM } from './state.js';
import { SCREEN_CHANGED_EVENT } from './core/runtime.js';

function publishScreenChange(screen) {
  window.dispatchEvent(new CustomEvent(SCREEN_CHANGED_EVENT, {
    detail: { screen, timestamp: Date.now() }
  }));
}

function setDisplay(node, value) {
  if (node) node.style.display = value;
}

function setVisibilityClass(node, className, isVisible) {
  if (!node) return;
  node.classList.toggle(className, isVisible);
}

function setMenuUiVisible(isVisible) {
  setDisplay(DOM.audioTogglesGlobal, isVisible ? 'flex' : 'none');
  setDisplay(DOM.walletCorner, isVisible ? 'flex' : 'none');
}

function setEyesVisibility(isVisible) {
  if (DOM.menuEyes) {
    DOM.menuEyes.style.visibility = isVisible ? 'visible' : 'hidden';
    DOM.menuEyes.style.opacity = isVisible ? '1' : '0';
  }
  if (DOM.startTransitionEyes) {
    DOM.startTransitionEyes.style.visibility = isVisible ? 'visible' : 'hidden';
    DOM.startTransitionEyes.style.opacity = isVisible ? '1' : '0';
  }
}

function showMainMenuScreen() {
  setVisibilityClass(DOM.gameOver, 'visible', false);
  setVisibilityClass(DOM.gameStart, 'hidden', false);
  setVisibilityClass(DOM.storeScreen, 'visible', false);
  setVisibilityClass(DOM.rulesScreen, 'visible', false);
  setVisibilityClass(DOM.gameContainer, 'active', false);
  setMenuUiVisible(true);
  setEyesVisibility(true);
  publishScreenChange('menu');
}

function showStoreScreen() {
  setVisibilityClass(DOM.gameStart, 'hidden', true);
  setVisibilityClass(DOM.storeScreen, 'visible', true);
  setVisibilityClass(DOM.rulesScreen, 'visible', false);
  setVisibilityClass(DOM.gameOver, 'visible', false);
  setMenuUiVisible(false);
  publishScreenChange('store');
}

function hideStoreScreen() {
  setVisibilityClass(DOM.storeScreen, 'visible', false);
  setVisibilityClass(DOM.gameStart, 'hidden', false);
  setMenuUiVisible(true);
  publishScreenChange('menu');
}

function showRulesScreen() {
  setVisibilityClass(DOM.rulesScreen, 'visible', true);
  setMenuUiVisible(false);
  publishScreenChange('rules');
}

function hideRulesScreen() {
  setVisibilityClass(DOM.rulesScreen, 'visible', false);
  setMenuUiVisible(true);
  publishScreenChange('menu');
}

function showGameplayScreen() {
  setVisibilityClass(DOM.gameContainer, 'active', true);
  setVisibilityClass(DOM.gameOver, 'visible', false);
  setVisibilityClass(DOM.gameStart, 'hidden', true);
  setVisibilityClass(DOM.storeScreen, 'visible', false);
  setVisibilityClass(DOM.rulesScreen, 'visible', false);
  setMenuUiVisible(false);
  setEyesVisibility(false);
  if (DOM.darkScreen) {
    DOM.darkScreen.classList.remove('start-transition-active');
    DOM.darkScreen.style.display = 'none';
  }
  publishScreenChange('gameplay');
}

function showPreparingGameplayScreen() {
  setVisibilityClass(DOM.gameContainer, 'active', true);
  setVisibilityClass(DOM.gameStart, 'hidden', true);
  setVisibilityClass(DOM.gameOver, 'visible', false);
  setVisibilityClass(DOM.storeScreen, 'visible', false);
  setVisibilityClass(DOM.rulesScreen, 'visible', false);
  setMenuUiVisible(false);
  setEyesVisibility(false);
  publishScreenChange('preparing');
}

function showGameOverScreen() {
  setVisibilityClass(DOM.gameContainer, 'active', false);
  setVisibilityClass(DOM.gameOver, 'visible', true);
  setVisibilityClass(DOM.storeScreen, 'visible', false);
  setVisibilityClass(DOM.rulesScreen, 'visible', false);
  setMenuUiVisible(false);
  publishScreenChange('game-over');
}

function showPlayerMenuScreen() {
  setVisibilityClass(DOM.gameStart, 'hidden', true);
  setVisibilityClass(DOM.storeScreen, 'visible', false);
  setVisibilityClass(DOM.rulesScreen, 'visible', false);
  setVisibilityClass(DOM.gameOver, 'visible', false);
  if (DOM.playerMenuOverlay) {
    DOM.playerMenuOverlay.hidden = false;
    DOM.playerMenuOverlay.classList.add('visible');
  }
  setMenuUiVisible(false);
  setEyesVisibility(false);
  publishScreenChange('player-menu');
}

function hidePlayerMenuScreen() {
  if (DOM.playerMenuOverlay) {
    DOM.playerMenuOverlay.classList.remove('visible');
    DOM.playerMenuOverlay.hidden = true;
  }
  showMainMenuScreen();
}

export {
  showMainMenuScreen,
  showStoreScreen,
  hideStoreScreen,
  showRulesScreen,
  hideRulesScreen,
  showPreparingGameplayScreen,
  showGameplayScreen,
  showGameOverScreen,
  showPlayerMenuScreen,
  hidePlayerMenuScreen
};
