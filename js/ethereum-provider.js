function hasRequest(provider) {
  return !!(provider && typeof provider.request === 'function');
}

function pickFromProviders(providers = []) {
  if (!Array.isArray(providers) || providers.length === 0) return null;

  const preferred = providers.find((provider) => provider?.isMetaMask && hasRequest(provider));
  if (preferred) return preferred;

  return providers.find((provider) => hasRequest(provider)) || null;
}

export function getInjectedEthereumProvider() {
  if (typeof window === 'undefined') return null;

  const rootProvider = window.ethereum;
  if (!rootProvider) return null;

  const fromList = pickFromProviders(rootProvider.providers);
  if (fromList) return fromList;

  return hasRequest(rootProvider) ? rootProvider : null;
}
