import EthereumProvider from '@walletconnect/ethereum-provider';
import { WC_PROJECT_ID } from './config.js';
import { createCenteredOverlay, createElement } from './dom-render.js';
import { logger } from './logger.js';
import { notifyError } from './notifier.js';

// WalletConnect v2 integration — fallback for environments without window.ethereum (e.g. Telegram Mini App)
const WC = {
  provider: null,
  accounts: [],

  async connect() {
    try {
      if (typeof EthereumProvider?.init !== 'function') {
        notifyError('❌ WalletConnect dependency failed to load. Please refresh and try again.');
        return false;
      }

      if (WC_PROJECT_ID === 'PLACEHOLDER_WC_PROJECT_ID') {
        logger.warn('⚠️ WalletConnect: WC_PROJECT_ID is a placeholder. Set a real project ID from https://cloud.walletconnect.com');
      }

      // Clean up any stale session
      if (this.provider) {
        try { await this.provider.disconnect(); } catch (e) { logger.warn('WC stale session cleanup:', e); }
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

      logger.error('❌ WC connect error:', error);
      if (!error.message || !error.message.includes('User rejected')) {
        notifyError('❌ WalletConnect error: ' + (error.message || 'Connection failed'));
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
    const createWalletLink = ({ href, label, background }) => createElement('a', {
      textContent: label,
      attributes: { href, target: '_blank', rel: 'noopener noreferrer' },
      style: {
        display: 'block',
        background,
        color: '#fff',
        padding: '12px 20px',
        borderRadius: '10px',
        fontSize: '15px',
        textDecoration: 'none',
        fontWeight: 'bold'
      }
    });

    const cancelButton = createElement('button', {
      id: 'wcCancelBtn',
      textContent: 'Cancel',
      style: {
        background: 'none',
        border: '1px solid #555',
        color: '#aaa',
        padding: '8px 24px',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '14px'
      }
    });

    const panel = createElement('div', {
      style: {
        background: '#1a1a2e',
        borderRadius: '16px',
        padding: '32px',
        maxWidth: '360px',
        width: '90%',
        textAlign: 'center',
        border: '1px solid rgba(255,255,255,0.1)',
        color: '#fff',
        fontFamily: 'sans-serif'
      },
      children: [
        createElement('div', {
          textContent: '🔗 Connect Wallet',
          style: { fontSize: '24px', marginBottom: '8px' }
        }),
        createElement('div', {
          textContent: 'Open your wallet app to connect',
          style: { fontSize: '13px', color: '#aaa', marginBottom: '24px' }
        }),
        createElement('div', {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            marginBottom: '20px'
          },
          children: [
            createWalletLink({
              href: `https://metamask.app.link/wc?uri=${encodedUri}`,
              label: '🦊 MetaMask',
              background: '#E2761B'
            }),
            createWalletLink({
              href: `https://link.trustwallet.com/wc?uri=${encodedUri}`,
              label: '🛡️ Trust Wallet',
              background: '#3375BB'
            }),
            createWalletLink({
              href: uri,
              label: '🔗 Other Wallet',
              background: '#3B99FC'
            })
          ]
        }),
        createElement('div', {
          textContent: 'After approving in your wallet, return here',
          style: { fontSize: '12px', color: '#666', marginBottom: '16px' }
        }),
        cancelButton
      ]
    });

    const overlay = createCenteredOverlay({
      id: 'wcConnectModal',
      children: [panel]
    });

    document.body.appendChild(overlay);

    const cancelHandler = () => {
      overlay.remove();
      if (onCancel) onCancel();
    };

    cancelButton.addEventListener('click', cancelHandler);
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
      logger.error('❌ WC sign error:', error);
      return null;
    }
  },

  async disconnect() {
    const modal = document.getElementById('wcConnectModal');
    if (modal) modal.remove();
    if (this.provider) {
      try { await this.provider.disconnect(); } catch (e) { logger.warn('WC disconnect error:', e); }
      this.provider = null;
      this.accounts = [];
    }
  },

  isConnected() {
    return !!(this.provider && this.accounts.length > 0);
  }
};


export { WC };
