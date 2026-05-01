let clearRuntimeConfigHandler = () => {};

function registerClearRuntimeConfig(handler) {
  clearRuntimeConfigHandler = typeof handler === 'function' ? handler : () => {};
}

function clearRuntimeConfigBridge() {
  clearRuntimeConfigHandler();
}

export {
  registerClearRuntimeConfig,
  clearRuntimeConfigBridge
};
