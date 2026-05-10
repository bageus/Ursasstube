let spotlightRoot = null;

function ensureSpotlightRoot() {
  if (spotlightRoot || typeof document === 'undefined') return spotlightRoot;
  spotlightRoot = document.createElement('div');
  spotlightRoot.id = 'onboarding-spotlight-root';
  spotlightRoot.hidden = true;
  spotlightRoot.setAttribute('aria-hidden', 'true');
  document.body.appendChild(spotlightRoot);
  return spotlightRoot;
}

function hideSpotlight() {
  if (!spotlightRoot) return;
  spotlightRoot.hidden = true;
  spotlightRoot.setAttribute('aria-hidden', 'true');
  spotlightRoot.innerHTML = '';
}

function showSpotlight({ target, text = '', showSkip = true, onSkip, onTargetClick } = {}) {
  const root = ensureSpotlightRoot();
  if (!root) return false;

  root.hidden = false;
  root.setAttribute('aria-hidden', 'false');
  root.innerHTML = `<button type="button" class="onboarding-spotlight-target">${text || ''}</button>`;

  const targetBtn = root.querySelector('.onboarding-spotlight-target');
  targetBtn?.addEventListener('click', () => {
    if (typeof onTargetClick === 'function') onTargetClick({ target });
  });

  if (showSkip) {
    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.textContent = 'Skip';
    skipBtn.className = 'onboarding-spotlight-skip';
    skipBtn.addEventListener('click', () => {
      hideSpotlight();
      if (typeof onSkip === 'function') onSkip();
    });
    root.appendChild(skipBtn);
  }

  return true;
}

