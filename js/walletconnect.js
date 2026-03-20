import { WC_PROJECT_ID } from './config.js';
import EthereumProvider from 'https://esm.sh/@walletconnect/ethereum-provider@2.23.0';

// WalletConnect v2 integration — fallback for environments without window.ethereum (e.g. Telegram Mini App)
const WC = {
  provider: null,
  accounts: [],

  async connect() {
    try {
      if (typeof EthereumProvider?.init !== 'function') {
        alert('❌ WalletConnect library failed to load. Please check your connection and try again.');
        return false;
      }

      if (WC_PROJECT_ID === 'PLACEHOLDER_WC_PROJECT_ID') {
        console.warn('⚠️ WalletConnect: WC_PROJECT_ID is a placeholder. Set a real project ID from https://cloud.walletconnect.com');
      }

      // Clean up any stale session
      if (this.provider) {
        try { await this.provider.disconnect(); } catch (e) { console.warn('WC stale session cleanup:', e); }
        this.provider = null;
        this.accounts = [];
      }

      this.provider = await EthereumProvider.init({
        projectId: WC_PROJECT_ID,
        chains: [56, 1],
        optionalChains: [56, 1],
        showQrModal: false,
        metadata: {
          name: 'URSASS TUBE',
          description: 'URSASS TUBE Game',
          url: window.location.origin,
          icons: [window.location.origin + '/img/favicon.png']
        }
      });

      let modalOverlay = null;
      let rejectCancel = null;
      const cancelPromise = new Promise((_, reject) => { rejectCancel = reject; });

      this.provider.on('display_uri', (uri) => {
        modalOverlay = WC._showModal(uri, () => {
          if (modalOverlay) { modalOverlay.remove(); modalOverlay = null; }
          rejectCancel(new Error('User cancelled'));
        });
      });

      await Promise.race([this.provider.connect(), cancelPromise]);

      if (modalOverlay) { modalOverlay.remove(); modalOverlay = null; }

      this.accounts = this.provider.accounts;
      return this.accounts.length > 0;
    } catch (error) {
      const modal = document.getElementById('wcConnectModal');
      if (modal) modal.remove();

      if (error.message === 'User cancelled') {
        this.provider = null;
        this.accounts = [];
        return false;
      }

      console.error('❌ WC connect error:', error);
      if (!error.message || !error.message.includes('User rejected')) {
        alert('❌ WalletConnect error: ' + (error.message || 'Connection failed'));
      }
      this.provider = null;
      this.accounts = [];
      return false;
    }
  },

  _showModal(uri, onCancel) {
    const existing = document.getElementById('wcConnectModal');
    if (existing) existing.remove();

    const encodedUri = encodeURIComponent(uri);
    const overlay = document.createElement('div');
    overlay.id = 'wcConnectModal';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.85); z-index: 99999;
      display: flex; align-items: center; justify-content: center;
    `;

    overlay.innerHTML = `
      <div style="
        background: #1a1a2e; border-radius: 16px; padding: 32px;
        max-width: 360px; width: 90%; text-align: center;
        border: 1px solid rgba(255,255,255,0.1); color: #fff;
        font-family: sans-serif;
      ">
        <div style="font-size: 24px; margin-bottom: 8px;">🔗 Connect Wallet</div>
        <div style="font-size: 13px; color: #aaa; margin-bottom: 24px;">
          Open your wallet app to connect
        </div>
        <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
          <a href="https://metamask.app.link/wc?uri=${encodedUri}" target="_blank" style="
            display: block; background: #E2761B; color: #fff;
            padding: 12px 20px; border-radius: 10px; font-size: 15px;
            text-decoration: none; font-weight: bold;
          ">🦊 MetaMask</a>
          <a href="https://link.trustwallet.com/wc?uri=${encodedUri}" target="_blank" style="
            display: block; background: #3375BB; color: #fff;
            padding: 12px 20px; border-radius: 10px; font-size: 15px;
            text-decoration: none; font-weight: bold;
          ">🛡️ Trust Wallet</a>
          <a href="${uri}" target="_blank" style="
            display: block; background: #3B99FC; color: #fff;
            padding: 12px 20px; border-radius: 10px; font-size: 15px;
            text-decoration: none; font-weight: bold;
          ">🔗 Other Wallet</a>
        </div>
        <div style="font-size: 12px; color: #666; margin-bottom: 16px;">
          After approving in your wallet, return here
        </div>
        <button id="wcCancelBtn" style="
          background: none; border: 1px solid #555; color: #aaa;
          padding: 8px 24px; border-radius: 8px; cursor: pointer;
          font-size: 14px;
        ">Cancel</button>
      </div>
    `;

    document.body.appendChild(overlay);

    const cancelHandler = () => {
      overlay.remove();
      if (onCancel) onCancel();
    };

    document.getElementById('wcCancelBtn').addEventListener('click', cancelHandler);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cancelHandler();
    });

    return overlay;
  },

  async signMessage(message) {
    if (!this.provider || !this.accounts[0]) return null;
    try {
      const signature = await this.provider.request({
        method: 'personal_sign',
        params: [message, this.accounts[0]]
      });
      return signature;
    } catch (error) {
      console.error('❌ WC sign error:', error);
      return null;
    }
  },

  async disconnect() {
    const modal = document.getElementById('wcConnectModal');
    if (modal) modal.remove();
    if (this.provider) {
      try { await this.provider.disconnect(); } catch (e) { console.warn('WC disconnect error:', e); }
      this.provider = null;
      this.accounts = [];
    }
  },

  isConnected() {
    return !!(this.provider && this.accounts.length > 0);
  }
};


export { WC };
