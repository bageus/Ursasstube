const GIFT_INDICATOR_ID = 'onboardingGiftIndicator';

function unmountGiftIndicator() {
  const node = document.getElementById(GIFT_INDICATOR_ID);
  if (node?.parentElement) node.parentElement.removeChild(node);
}

export { unmountGiftIndicator };
