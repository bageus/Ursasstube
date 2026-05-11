import { DOM } from '../../state.js';
import { setGameOverPrompt } from '../../ui.js';

function hideMenuStartHook() {
  const hook = DOM.startHook;
  if (!hook) return;
  hook.hidden = true;
  hook.setAttribute('aria-hidden', 'true');
  hook.textContent = '';
}

function clearGameOverOnboardingHook() {
  return setGameOverPrompt(null, { source: 'preview', runToken: null });
}

export {
  hideMenuStartHook,
  clearGameOverOnboardingHook
};
