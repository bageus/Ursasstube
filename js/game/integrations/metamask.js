import { initializeMetaMaskLifecycle } from '../../core/runtime.js';
import { getInjectedEthereumProvider } from '../../ethereum-provider.js';
import { logger } from '../../logger.js';

let cleanupMetaMaskLifecycle = () => {};

function initializeMetaMaskIntegration({ onDisconnect, onReconnect, onChainChanged }) {
  if (!getInjectedEthereumProvider()) {
    return false;
  }

  logger.info('🔗 Subscribing to MetaMask events...');
  cleanupMetaMaskLifecycle();
  cleanupMetaMaskLifecycle = initializeMetaMaskLifecycle({
    onDisconnect,
    onReconnect,
    onChainChanged
  });
  return true;
}

export { initializeMetaMaskIntegration };
