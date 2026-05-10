import { DOM } from '../../state.js';
import { setGameOverPrompt } from '../../ui.js';

function hideMenuStartHook() {
  const hook = DOM.startHook;
  if (!hook) return;
  hook.hidden = true;
  hook.setAttribute('aria-hidden', 'true');
  hook.textContent = '';
}

function showMenuStartHook(text) {
  const hook = DOM.startHook;
  if (!hook) return false;
  hook.hidden = false;
  hook.setAttribute('aria-hidden', 'false');
  hook.textContent = String(text || '').trim();
  return true;
}

function showGameOverPlayAgainHook(text) {
  if (!text) return false;
  return setGameOverPrompt({
    title: String(text),
    body: '',
    cta: 'PLAY AGAIN'
  }, { source: 'preview', runToken: null });
}

export {
  hideMenuStartHook,
  showMenuStartHook,
  showGameOverPlayAgainHook
};
