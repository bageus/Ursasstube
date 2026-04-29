import { getInjectedEthereumProvider } from '../../js/ethereum-provider.js';
class InjectedEthereumProviderBridge {
  constructor(options = {}) {
    this.options = options;
    this.ethereum = typeof window !== 'undefined' ? getInjectedEthereumProvider() ?? null : null;
    this.accounts = [];
    this.listeners = new Map();
  }

  static async init(options = {}) {
    if (typeof window !== 'undefined') {
      const globalProvider = window.WalletConnectEthereumProvider?.default || window.WalletConnectEthereumProvider;
      if (typeof globalProvider?.init === 'function') {
        return globalProvider.init(options);
      }
    }

    return new InjectedEthereumProviderBridge(options);
  }

  on(eventName, listener) {
    if (!this.listeners.has(eventName)) this.listeners.set(eventName, new Set());
    this.listeners.get(eventName).add(listener);
    return this;
  }

  removeListener(eventName, listener) {
    const set = this.listeners.get(eventName);
    if (set) set.delete(listener);
    return this;
  }

  emit(eventName, ...args) {
    const set = this.listeners.get(eventName);
    if (!set) return;
    for (const listener of set) listener(...args);
  }

  async connect() {
    if (!this.ethereum?.request) {
      throw new Error('WalletConnect provider is unavailable in this environment');
    }
    const accounts = await this.ethereum.request({ method: 'eth_requestAccounts' });
    this.accounts = Array.isArray(accounts) ? accounts : [];
    return this.accounts;
  }

  async request(payload) {
    if (!this.ethereum?.request) {
      throw new Error('WalletConnect provider is unavailable in this environment');
    }
    return this.ethereum.request(payload);
  }

  async disconnect() {
    this.accounts = [];
  }
}

export default InjectedEthereumProviderBridge;
