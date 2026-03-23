import { logger } from '../logger.js';
import { BACKEND_URL } from '../config.js';
import { request } from '../request.js';
import { isAuthenticated, getAuthIdentifier } from '../api.js';
import { createIconAtlas, createImageIcon, clearNode } from '../dom-render.js';
import { DOM } from '../state.js';

const DEFAULT_PLAYER_RIDES = Object.freeze({
  limited: true,
  freeRides: 3,
  paidRides: 0,
  totalRides: 3,
  resetInMs: 0,
  resetInFormatted: 'Ready'
});

let playerRides = { ...DEFAULT_PLAYER_RIDES };

export function getPlayerRides() {
  return playerRides;
}

function getPlayerRidesSnapshot() {
  return { ...playerRides };
}

function appendRidesLabel(target, { iconPosition, text }) {
  if (!target) return;
  clearNode(target);
  target.append(
    createIconAtlas({
      width: 28,
      height: 28,
      backgroundSize: '140px auto',
      backgroundPosition: iconPosition
    }),
    document.createTextNode(` ${text}`)
  );
}

export function renderStoreCurrencyButton(target, { prefixIconPosition = null, label, amount }) {
  if (!target) return;
  clearNode(target);
  if (prefixIconPosition) {
    target.append(
      createIconAtlas({
        width: 28,
        height: 28,
        backgroundSize: '140px auto',
        backgroundPosition: prefixIconPosition
      }),
      document.createTextNode(' ')
    );
  }
  target.append(document.createTextNode(`${label} — `));
  target.append(
    createImageIcon({
      src: 'img/icon_gold.png',
      width: 14,
      height: 14,
      verticalAlign: 'middle'
    }),
    document.createTextNode(` ${amount}`)
  );
}

export function setPlayerRides(nextPlayerRides = DEFAULT_PLAYER_RIDES) {
  playerRides = { ...DEFAULT_PLAYER_RIDES, ...(nextPlayerRides || {}) };
}

export function resetPlayerRides() {
  setPlayerRides(DEFAULT_PLAYER_RIDES);
}

function consumeLocalRide() {
  const currentRides = getPlayerRidesSnapshot();
  const totalRides = Number(currentRides.totalRides || 0);
  if (totalRides <= 0) {
    return false;
  }

  setPlayerRides({
    ...currentRides,
    totalRides: Math.max(0, totalRides - 1)
  });
  return true;
}

export function createRidesService({ isUnauthRuntimeMode, hasRideLimit }) {
  async function loadPlayerRides() {
    if (!isAuthenticated()) {
      if (isUnauthRuntimeMode()) return getPlayerRides();
      return;
    }
    const identifier = getAuthIdentifier();
    try {
      const response = await request(`${BACKEND_URL}/api/store/rides/${identifier}`);
      const data = await response.json();
      if (response.ok) {
        setPlayerRides(data);
        logger.info('🎟 Rides:', getPlayerRides());
      }
    } catch (error) {
      logger.error('❌ Error loading rides:', error);
    }
  }

  async function useRide() {
    if (!isAuthenticated()) {
      if (!isUnauthRuntimeMode()) return true;
      if (!hasRideLimit()) return true;

      if (!consumeLocalRide()) {
        updateRidesDisplay();
        return false;
      }
      updateRidesDisplay();
      return true;
    }
    const identifier = getAuthIdentifier();
    try {
      const response = await request(`${BACKEND_URL}/api/store/use-ride`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: identifier })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setPlayerRides(data.rides);
        updateRidesDisplay();
        logger.info(`🎟 Ride used. Remaining: ${getPlayerRides().totalRides}`);
        return true;
      }

      setPlayerRides(data.rides || getPlayerRides());
      updateRidesDisplay();
      return false;
    } catch (error) {
      logger.error('❌ Error consuming ride:', error);
      return true;
    }
  }

  function updateRidesDisplay() {
    const { ridesInfo, ridesText, ridesTimer, startBtn } = DOM;
    if (!ridesInfo) return;

    if (!isAuthenticated() && !isUnauthRuntimeMode()) {
      ridesInfo.classList.remove('visible');
      ridesInfo.setAttribute('aria-hidden', 'true');
      return;
    }

    ridesInfo.classList.add('visible');
    ridesInfo.setAttribute('aria-hidden', 'false');

    const currentRides = getPlayerRides();
    const total = currentRides.totalRides;
    const free = currentRides.freeRides;
    const paid = currentRides.paidRides;
    const limited = hasRideLimit();

    if (ridesText) {
      appendRidesLabel(ridesText, {
        iconPosition: '-84px -28px',
        text: limited ? `${total ?? '∞'} ride${total === 1 ? '' : 's'}` : 'Unlimited rides'
      });
      if (limited && paid > 0) {
        ridesText.append(document.createTextNode(` (${free} free + ${paid} purchased)`));
      }
    }

    if (ridesTimer) {
      if (limited && free < 3 && currentRides.resetInMs > 0) {
        appendRidesLabel(ridesTimer, {
          iconPosition: '-56px -28px',
          text: `Resets in ${currentRides.resetInFormatted}`
        });
        ridesTimer.style.display = '';
      } else {
        ridesTimer.style.display = 'none';
      }
    }

    if (startBtn) {
      if (limited && (total || 0) <= 0) {
        startBtn.style.opacity = '0.4';
        startBtn.style.pointerEvents = 'none';
        startBtn.textContent = `NO RIDES (${currentRides.resetInFormatted})`;
      } else {
        startBtn.style.opacity = '';
        startBtn.style.pointerEvents = '';
        startBtn.textContent = 'START GAME';
      }
    }
  }

  return {
    loadPlayerRides,
    useRide,
    updateRidesDisplay
  };
}
