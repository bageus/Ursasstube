import { DOM } from './state.js';
import { SCREEN_CHANGED_EVENT } from './runtime-events.js';

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

function showMainMenuScreen() {
  setVisibilityClass(DOM.gameOver, 'visible', false);
  setVisibilityClass(DOM.gameStart, 'hidden', false);
  setVisibilityClass(DOM.storeScreen, 'visible', false);
  setVisibilityClass(DOM.rulesScreen, 'visible', false);
  setVisibilityClass(DOM.gameContainer, 'active', false);
  setMenuUiVisible(true);
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
  publishScreenChange('gameplay');
}

function showGameOverScreen() {
  setVisibilityClass(DOM.gameContainer, 'active', false);
  setVisibilityClass(DOM.gameOver, 'visible', true);
  setVisibilityClass(DOM.storeScreen, 'visible', false);
  setVisibilityClass(DOM.rulesScreen, 'visible', false);
  setMenuUiVisible(false);
  publishScreenChange('game-over');
}

export {
  showMainMenuScreen,
  showStoreScreen,
  hideStoreScreen,
  showRulesScreen,
  hideRulesScreen,
  showGameplayScreen,
  showGameOverScreen
};
