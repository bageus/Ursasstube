/**
 * @typedef {Object} GameRenderer
 * @property {string} name
 * @property {() => Promise<boolean>|boolean} init
 * @property {(snapshot?: unknown) => void} resize
 * @property {(snapshot: unknown) => void} render
 * @property {(snapshot: unknown) => void} [renderUi]
 * @property {() => void} destroy
 */

const REQUIRED_RENDERER_METHODS = ['init', 'resize', 'render', 'destroy'];

/**
 * @param {unknown} renderer
 * @returns {renderer is GameRenderer}
 */
function isGameRenderer(renderer) {
  if (!renderer || typeof renderer !== 'object') {
    return false;
  }

  return REQUIRED_RENDERER_METHODS.every((methodName) => typeof renderer[methodName] === 'function');
}

/**
 * @param {unknown} renderer
 * @returns {GameRenderer}
 */
function assertGameRenderer(renderer) {
  if (!isGameRenderer(renderer)) {
    throw new Error('Invalid renderer adapter contract');
  }

  return renderer;
}

export { assertGameRenderer, isGameRenderer };
