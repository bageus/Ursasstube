import { logger } from '../logger.js';
import { BACKEND_URL } from '../config.js';
import { requestJson, requestJsonResult, REQUEST_PROFILE_STORE_READ, REQUEST_PROFILE_STORE_WRITE } from '../request.js';
import { isAuthenticated, getAuthIdentifier } from '../api.js';
import { createIconAtlas, clearNode } from '../dom-render.js';
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
    createIconAtlas({
      width: 14,
      height: 14,
      backgroundSize: '70px auto',
      backgroundPosition: '-28px -42px'
    }),
    document.createTextNode(` ${amount}`)
  );
}

export function setPlayerRides(nextPlayerRides = DEFAULT_PLAYER_RIDES) {
  const merged = { ...DEFAULT_PLAYER_RIDES, ...(nextPlayerRides || {}) };
  const toFinite = (value, fallback) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  };
  const freeRides = Math.max(0, toFinite(merged.freeRides, DEFAULT_PLAYER_RIDES.freeRides));
  const paidRides = Math.max(0, toFinite(merged.paidRides, DEFAULT_PLAYER_RIDES.paidRides));
  const totalRides = Math.max(0, toFinite(merged.totalRides, freeRides + paidRides));
  const resetInMs = Math.max(0, toFinite(merged.resetInMs, DEFAULT_PLAYER_RIDES.resetInMs));
  const resetInFormatted = String(merged.resetInFormatted || '').trim() || 'Ready';
  playerRides = {
    ...merged,
    freeRides,
    paidRides,
    totalRides,
    resetInMs,
    resetInFormatted
  };
}

export function resetPlayerRides() {
  setPlayerRides(DEFAULT_PLAYER_RIDES);
}

export function createRidesService({ isUnauthRuntimeMode, hasRideLimit }) {
  async function loadPlayerRides() {
    if (!isAuthenticated()) {
      if (isUnauthRuntimeMode()) return getPlayerRides();
      return;
    }
    const identifier = getAuthIdentifier();
    try {
      const data = await requestJson(`${BACKEND_URL}/api/store/rides/${identifier}`, REQUEST_PROFILE_STORE_READ);
      setPlayerRides(data);
      logger.info('🎟 Rides:', getPlayerRides());
    } catch (error) {
      logger.error('❌ Error loading rides:', error);
      setPlayerRides(getPlayerRides());
    }
  }

  async function useRide() {
    if (!isAuthenticated()) {
      if (!isUnauthRuntimeMode()) return true;
      if (!hasRideLimit()) return true;

      const currentRides = getPlayerRides();
      const totalRides = Number(currentRides.totalRides || 0);
      if (totalRides <= 0) {
        updateRidesDisplay();
        return false;
      }

      setPlayerRides({
        ...currentRides,
        totalRides: Math.max(0, totalRides - 1)
      });
      updateRidesDisplay();
      return true;
    }
    const identifier = getAuthIdentifier();
    try {
      const { ok, data } = await requestJsonResult(`${BACKEND_URL}/api/store/use-ride`, {
        ...REQUEST_PROFILE_STORE_WRITE,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: identifier })
      });

      if (ok && data.success) {
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
    const { ridesInfo, ridesText, ridesTimer, startBtn, restartBtn } = DOM;
    if (!ridesInfo) return;

    if (!isAuthenticated() && !isUnauthRuntimeMode()) {
      ridesInfo.classList.remove('visible');
      ridesInfo.setAttribute('aria-hidden', 'true');
      return;
    }

    ridesInfo.classList.add('visible');
    ridesInfo.setAttribute('aria-hidden', 'false');

    const currentRides = getPlayerRides();
    const total = Number.isFinite(Number(currentRides.totalRides)) ? Number(currentRides.totalRides) : 0;
    const free = Number.isFinite(Number(currentRides.freeRides)) ? Number(currentRides.freeRides) : 0;
    const paid = Number.isFinite(Number(currentRides.paidRides)) ? Number(currentRides.paidRides) : 0;
    const resetInFormatted = String(currentRides.resetInFormatted || '').trim() || 'Ready';
    const limited = hasRideLimit();

    if (ridesText) {
      appendRidesLabel(ridesText, {
        iconPosition: '-112px -84px',
        text: limited ? `${total ?? '∞'} ride${total === 1 ? '' : 's'}` : 'Unlimited rides'
      });
      if (limited && paid > 0) {
        ridesText.append(document.createTextNode(` (${free} free + ${paid} purchased)`));
      }
    }

    if (ridesTimer) {
      if (limited && free < 3 && Number(currentRides.resetInMs || 0) > 0) {
        appendRidesLabel(ridesTimer, {
          iconPosition: '-112px -28px',
          text: `Resets in ${resetInFormatted}`
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
        startBtn.textContent = `NO RIDES (${resetInFormatted})`;
      } else {
        startBtn.style.opacity = '';
        startBtn.style.pointerEvents = '';
        startBtn.textContent = 'START GAME';
      }
    }

    if (restartBtn) {
      if (limited && (total || 0) <= 0) {
        restartBtn.style.opacity = '0.4';
        restartBtn.style.pointerEvents = 'none';
        restartBtn.textContent = `NO RIDES (${resetInFormatted})`;
      } else {
        restartBtn.style.opacity = '';
        restartBtn.style.pointerEvents = '';
        restartBtn.textContent = 'PLAY AGAIN';
      }
    }
  }

  return {
    loadPlayerRides,
    useRide,
    updateRidesDisplay
  };
}
