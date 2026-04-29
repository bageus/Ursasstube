import { getInjectedEthereumProvider } from './ethereum-provider.js';
import { WC } from './walletconnect.js';

async function requestWalletSignature({ flow, primaryId = null, timestamp }) {
  let walletAddress;
  let signature;

  const normalizedFlow = flow === 'link' ? 'link' : 'auth';

  if (getInjectedEthereumProvider()) {
    const accounts = await getInjectedEthereumProvider().request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) return null;

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
      provider: getInjectedEthereumProvider(),
    };
  }

  const connected = await WC.connect();
  if (!connected) return null;

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
