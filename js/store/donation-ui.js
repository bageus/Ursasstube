import { clearNode, createImageIcon } from '../dom-render.js';

export function createEmptyDonationUiState() {
  return {
    isLoading: false,
    error: '',
    products: [],
    history: [],
    historyLoading: false,
    historyError: '',
    refreshingPaymentId: '',
    refreshCooldowns: {}
  };
}

export function createEmptyDonationPaymentState() {
  return {
    isOpen: false,
    isCreating: false,
    isSubmitting: false,
    isInvokingWallet: false,
    error: '',
    walletError: '',
    selectedProductKey: '',
    payment: null,
    status: null,
    reward: null,
    txHash: '',
    invoiceUrl: ''
  };
}

function createDonationRewardToken({ iconSrc, amount, alt }) {
  const token = document.createElement('span');
  token.className = 'donation-card__reward-token';
  token.append(
    document.createTextNode(`+${amount} `),
    createImageIcon({
      src: iconSrc,
      width: 14,
      height: 14,
      verticalAlign: 'text-bottom',
      alt
    })
  );
  return token;
}

function renderDonationReward(target, reward = {}) {
  if (!target) return;
  clearNode(target);

  const gold = Number(reward.gold || 0);
  const silver = Number(reward.silver || 0);

  target.append(
    createDonationRewardToken({
      iconSrc: 'img/icon_gold.png',
      amount: gold,
      alt: 'Gold'
    }),
    document.createTextNode(' · '),
    createDonationRewardToken({
      iconSrc: 'img/icon_silver.png',
      amount: silver,
      alt: 'Silver'
    })
  );
}

function normalizeDonationDisplayStatus(status = '') {
  const normalizedStatus = String(status || '').toLowerCase();
  if (normalizedStatus === 'credited') return 'paid';
  return normalizedStatus;
}

function formatDonationHistoryDate(value) {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown date';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${day}/${month}/${year}  ${hours}:${minutes}`;
}

function formatCooldownMs(ms) {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : `0:${String(seconds).padStart(2, '0')}`;
}

export function createDonationUiController({
  getUiState,
  getPaymentState,
  getDonationDisplayPrice,
  getDonationHistoryDisplayPrice,
  getDonationHistoryMethodLabel,
  getClientSideDonationStatus,
  getDonationRefreshCooldownRemaining,
  handleDonationBuy,
  hasPreparedTelegramInvoice,
  refreshDonationHistoryEntry,
  syncDonationCountdown
}) {
  function renderDonationFeedback() {
    const donationUiState = getUiState();
    const feedbackEl = document.getElementById('donationFeedback');
    const loadingEl = document.getElementById('donationLoading');
    const emptyEl = document.getElementById('donationEmpty');

    if (feedbackEl) {
      feedbackEl.hidden = !donationUiState.error;
      feedbackEl.textContent = donationUiState.error || '';
    }
    if (loadingEl) loadingEl.hidden = !donationUiState.isLoading;
    if (emptyEl) emptyEl.hidden = donationUiState.isLoading || donationUiState.error || donationUiState.products.length > 0;
  }

  function renderDonationProducts() {
    const donationUiState = getUiState();
    const donationPaymentState = getPaymentState();
    const listEl = document.getElementById('donationList');

    renderDonationFeedback();
    if (!listEl) return;
    clearNode(listEl);

    donationUiState.products.forEach((product) => {
      const card = document.createElement('article');
      card.className = 'donation-card';

      const header = document.createElement('div');
      header.className = 'donation-card__header';

      const title = document.createElement('h3');
      title.className = 'donation-card__title';
      title.textContent = product.title || product.key;

      const displayPrice = getDonationDisplayPrice(product);
      const price = document.createElement('div');
      price.className = 'donation-card__price';
      price.textContent = `${displayPrice.amount ?? '—'} ${displayPrice.currency}`;

      header.append(title, price);

      const description = document.createElement('div');
      description.className = 'donation-card__description';
      renderDonationReward(description, product.grant);

      const button = document.createElement('button');
      const isSinglePurchaseOffer = product.purchaseLimit === 'once';
      const isPurchasedSingleOffer = isSinglePurchaseOffer && product.alreadyPurchased;
      const isExplicitlyUnavailable = isSinglePurchaseOffer
        ? (!product.canPurchase && isPurchasedSingleOffer)
        : false;
      const unavailable = isPurchasedSingleOffer || isExplicitlyUnavailable;
      button.className = 'donation-card__buy';
      button.type = 'button';
      button.disabled = unavailable || donationPaymentState.isCreating;
      button.textContent = unavailable
        ? (product.alreadyPurchased ? 'Already purchased' : 'Unavailable')
        : hasPreparedTelegramInvoice(product)
          ? 'Open invoice'
          : 'Buy';
      button.addEventListener('click', () => handleDonationBuy(product));

      card.append(header, description, button);
      listEl.appendChild(card);
    });
  }

  function renderDonationHistory() {
    const donationUiState = getUiState();
    const listEl = document.getElementById('donationHistoryList');
    const loadingEl = document.getElementById('donationHistoryLoading');
    const emptyEl = document.getElementById('donationHistoryEmpty');
    const feedbackEl = document.getElementById('donationHistoryFeedback');

    if (loadingEl) loadingEl.hidden = !donationUiState.historyLoading;
    if (feedbackEl) {
      feedbackEl.hidden = !donationUiState.historyError;
      feedbackEl.textContent = donationUiState.historyError || '';
    }
    if (emptyEl) emptyEl.hidden = donationUiState.historyLoading || Boolean(donationUiState.historyError) || donationUiState.history.length > 0;
    if (!listEl) return;

    clearNode(listEl);

    donationUiState.history.forEach((entry) => {
      const card = document.createElement('article');
      card.className = 'donation-history-card';

      const row = document.createElement('div');
      row.className = 'donation-history-card__row';

      const datetime = document.createElement('div');
      datetime.className = 'donation-history-card__datetime';
      datetime.textContent = formatDonationHistoryDate(entry.createdAt);

      const title = document.createElement('div');
      title.className = 'donation-history-card__title';
      title.textContent = entry.title || entry.productTitle || entry.productKey || entry.paymentId || 'Donation purchase';

      const method = document.createElement('div');
      method.className = 'donation-history-card__datetime';
      method.textContent = getDonationHistoryMethodLabel(entry);

      const amount = document.createElement('div');
      amount.className = 'donation-history-card__amount';
      const displayPrice = getDonationHistoryDisplayPrice(entry);
      amount.textContent = `${displayPrice.amount ?? '—'} ${displayPrice.currency}`;

      const resolvedStatus = getClientSideDonationStatus(entry) || 'unknown';
      const displayStatus = normalizeDonationDisplayStatus(resolvedStatus) || 'unknown';
      const status = document.createElement('div');
      status.className = 'donation-history-card__status';
      status.dataset.status = donationUiState.refreshingPaymentId === entry.paymentId ? 'refreshing' : displayStatus;
      status.textContent = displayStatus;

      row.append(datetime, title, method, amount, status);

      if (entry.paymentId && resolvedStatus === 'pending') {
        const refreshBtn = document.createElement('button');
        refreshBtn.type = 'button';
        refreshBtn.className = 'payment-secondary-btn donation-history-card__refresh';
        const cooldownRemaining = getDonationRefreshCooldownRemaining(entry.paymentId);
        refreshBtn.disabled = donationUiState.refreshingPaymentId === entry.paymentId || cooldownRemaining > 0;
        refreshBtn.textContent = donationUiState.refreshingPaymentId === entry.paymentId
          ? 'Refreshing…'
          : cooldownRemaining > 0
            ? `Refresh in ${formatCooldownMs(cooldownRemaining)}`
            : 'Refresh';
        refreshBtn.addEventListener('click', () => refreshDonationHistoryEntry(entry.paymentId));
        row.appendChild(refreshBtn);
      }

      card.appendChild(row);
      listEl.appendChild(card);
    });
  }

  function renderDonationPaymentModal() {
    syncDonationCountdown();
  }

  return {
    renderDonationFeedback,
    renderDonationProducts,
    renderDonationHistory,
    renderDonationPaymentModal
  };
}
