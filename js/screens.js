import { DOM } from './state.js';

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
}

function showStoreScreen() {
  setVisibilityClass(DOM.gameStart, 'hidden', true);
  setVisibilityClass(DOM.storeScreen, 'visible', true);
  setVisibilityClass(DOM.rulesScreen, 'visible', false);
  setVisibilityClass(DOM.gameOver, 'visible', false);
  setMenuUiVisible(false);
}

function hideStoreScreen() {
  setVisibilityClass(DOM.storeScreen, 'visible', false);
  setVisibilityClass(DOM.gameStart, 'hidden', false);
  setMenuUiVisible(true);
}

function showRulesScreen() {
  setVisibilityClass(DOM.rulesScreen, 'visible', true);
  setMenuUiVisible(false);
}

function hideRulesScreen() {
  setVisibilityClass(DOM.rulesScreen, 'visible', false);
  setMenuUiVisible(true);
}

function showGameplayScreen() {
  setVisibilityClass(DOM.gameContainer, 'active', true);
  setVisibilityClass(DOM.gameOver, 'visible', false);
  setVisibilityClass(DOM.gameStart, 'hidden', true);
  setVisibilityClass(DOM.storeScreen, 'visible', false);
  setVisibilityClass(DOM.rulesScreen, 'visible', false);
  setMenuUiVisible(false);
}

function showGameOverScreen() {
  setVisibilityClass(DOM.gameContainer, 'active', false);
  setVisibilityClass(DOM.gameOver, 'visible', true);
  setVisibilityClass(DOM.storeScreen, 'visible', false);
  setVisibilityClass(DOM.rulesScreen, 'visible', false);
  setMenuUiVisible(false);
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
