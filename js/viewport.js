import { DOM } from './state.js';

function getViewportSize() {
  const width =
    DOM.gameViewport?.clientWidth ||
    DOM.gameContent?.clientWidth ||
    DOM.gameWrapper?.clientWidth ||
    window.innerWidth ||
    360;
  const height =
    DOM.gameViewport?.clientHeight ||
    DOM.gameContent?.clientHeight ||
    DOM.gameWrapper?.clientHeight ||
    window.innerHeight ||
    640;

  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height))
  };
}

function getViewportCenter() {
  const { width, height } = getViewportSize();
  return {
    x: width * 0.5,
    y: height * 0.5
  };
}

export { getViewportCenter };
