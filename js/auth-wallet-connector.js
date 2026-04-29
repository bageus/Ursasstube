import { getInjectedEthereumProvider } from './ethereum-provider.js';
import { WC } from './walletconnect.js';
import { notifyError } from './notifier.js';

const BASE_CHAIN_ID_HEX = '0x2105';
const WRONG_NETWORK_TOAST_KEY = 'wrong-network-base';

function showWrongNetworkToast() {
  notifyError('❌ Wrong network: switch wallet to Base to continue.', {
    sticky: true,
    toastKey: WRONG_NETWORK_TOAST_KEY,
  });
}

async function ensureBaseNetwork(provider) {
  if (!provider?.request) return;

  try {
    const currentChainId = await provider.request({ method: 'eth_chainId' });
    if (String(currentChainId || '').toLowerCase() === BASE_CHAIN_ID_HEX) return;

    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: BASE_CHAIN_ID_HEX }],
    });
  } catch (error) {
    showWrongNetworkToast();
    throw new Error('Wrong network. Please switch wallet to Base (8453).');
  }
}

function subscribeWrongNetworkListener(provider) {
  if (!provider?.on || provider.__ursassBaseListenerAttached) return;

  provider.on('chainChanged', (chainId) => {
    if (String(chainId || '').toLowerCase() !== BASE_CHAIN_ID_HEX) {
      showWrongNetworkToast();
    }
  });
  provider.__ursassBaseListenerAttached = true;
}

async function requestWalletSignature({ flow, primaryId = null, timestamp }) {
  let walletAddress;
  let signature;

  const normalizedFlow = flow === 'link' ? 'link' : 'auth';

  if (getInjectedEthereumProvider()) {
    const provider = getInjectedEthereumProvider();
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) return null;

    await ensureBaseNetwork(provider);
    subscribeWrongNetworkListener(provider);

    walletAddress = accounts[0];
    const message = buildSigningMessage({
      flow: normalizedFlow,
      walletAddress,
      primaryId,
      timestamp,
    });

    signature = await getInjectedEthereumProvider().request({
      method: 'personal_sign',
      params: [message, walletAddress],
    });

    return {
      walletAddress,
      signature,
      provider,
    };
  }

  const connected = await WC.connect();
  if (!connected) return null;

  await ensureBaseNetwork(WC.provider);
  subscribeWrongNetworkListener(WC.provider);

  walletAddress = WC.accounts[0];
  const message = buildSigningMessage({
    flow: normalizedFlow,
    walletAddress,
    primaryId,
    timestamp,
  });
  signature = await WC.signMessage(message);
  if (!signature) return null;

  return {
    walletAddress,
    signature,
    provider: null,
  };
}

function buildSigningMessage({ flow, walletAddress, primaryId, timestamp }) {
  const normalizedWallet = String(walletAddress || '').toLowerCase();

  if (flow === 'link') {
    return `Link wallet\nWallet: ${normalizedWallet}\nPrimaryId: ${primaryId}\nTimestamp: ${timestamp}`;
  }

  return `Auth wallet\nWallet: ${normalizedWallet}\nTimestamp: ${timestamp}`;
}

export { requestWalletSignature };
