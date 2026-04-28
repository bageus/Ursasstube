import { ANALYTICS_TRACK_EVENT } from './analytics.js';
import { logger } from './logger.js';

const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';
const POSTHOG_SCRIPT_PATH = '/static/array.js';

let posthogStarted = false;

function resolvePosthogConfig() {
  if (typeof window === 'undefined') return null;

  const apiKey = typeof window.__URSASS_POSTHOG_KEY__ === 'string'
    ? window.__URSASS_POSTHOG_KEY__.trim()
    : '';

  if (!apiKey) return null;

  const apiHost = typeof window.__URSASS_POSTHOG_HOST__ === 'string' && window.__URSASS_POSTHOG_HOST__.trim()
    ? window.__URSASS_POSTHOG_HOST__.trim()
    : DEFAULT_POSTHOG_HOST;

  return { apiKey, apiHost };
}

function normalizeHost(host) {
  return String(host || '').replace(/\/+$/, '');
}

function buildMirroredPosthogEvents(name, payload = {}) {
  if (name === 'onboarding_hint_shown') {
    return [{ name: 'onboarding_started', payload: { version: 'v1', source: 'telegram' } }];
  }
  if (name === 'onboarding_hint_completed') {
    return [{ name: 'onboarding_completed', payload: { version: 'v1' } }];
  }
  if (name === 'game_start') {
    return [{
      name: 'run_started',
      payload: {
        is_authorized: Boolean(payload.authenticated),
        rides_left: Number(payload.rides_left ?? 0),
        source: 'telegram'
      }
    }];
  }
  if (name === 'game_end') {
    return [{
      name: 'run_finished',
      payload: {
        score: payload.score,
        distance: payload.distance,
        coins_gold: payload.gold_coins,
        coins_silver: payload.silver_coins,
        duration_sec: payload.run_duration,
        death_reason: payload.reason,
        had_shield: false,
        used_upgrade: 'unknown'
      }
    }];
  }
  return [];
}

function ensurePosthogGlobal() {
  const scope = window;
  if (scope.posthog && typeof scope.posthog.init === 'function') return scope.posthog;

  const posthog = [];
  posthog._i = [];
  posthog.__SV = 1;
  posthog.init = function init(token, config, name) {
    const targetName = name || 'posthog';
    const target = scope[targetName] = scope[targetName] || [];
    target.people = target.people || [];
    target.toString = function toString(append) {
      let base = 'posthog';
      if (targetName !== 'posthog') base += `.${targetName}`;
      return append ? `${base} (stub)` : base;
    };

    const methods = ['capture', 'identify', 'set_config', 'register', 'unregister', 'reset', 'group', 'alias'];
    for (const method of methods) {
      target[method] = function stubMethod(...args) {
        target.push([method, ...args]);
      };
    }

    posthog._i.push([token, config, targetName]);
  };

  scope.posthog = posthog;
  return posthog;
}

function loadPosthogScript(apiHost) {
  const scriptUrl = `${normalizeHost(apiHost)}${POSTHOG_SCRIPT_PATH}`;
  const existing = document.querySelector(`script[data-posthog-url="${scriptUrl}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      if (existing.dataset.loaded === '1') return resolve();
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('PostHog script failed to load.')), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = scriptUrl;
    script.dataset.posthogUrl = scriptUrl;
    script.addEventListener('load', () => {
      script.dataset.loaded = '1';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${scriptUrl}`)), { once: true });
    document.head.appendChild(script);
  });
}

async function initPosthogAnalytics() {
  if (posthogStarted || typeof window === 'undefined') return false;

  const config = resolvePosthogConfig();
  if (!config) {
    logger.info('📊 PostHog disabled: missing window.__URSASS_POSTHOG_KEY__.');
    return false;
  }

  const posthog = ensurePosthogGlobal();
  posthog.init(config.apiKey, {
    api_host: config.apiHost,
    person_profiles: 'identified_only',
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: true,
  });

  window.addEventListener(ANALYTICS_TRACK_EVENT, (event) => {
    const analyticsEvent = event?.detail;
    if (!analyticsEvent?.name) return;
    window.posthog?.capture?.(analyticsEvent.name, {
      ...analyticsEvent.payload,
      source: 'ursass_frontend',
      timestamp_ms: analyticsEvent.timestamp,
    });
    const mirroredEvents = buildMirroredPosthogEvents(analyticsEvent.name, analyticsEvent.payload);
    mirroredEvents.forEach((mirroredEvent) => {
      window.posthog?.capture?.(mirroredEvent.name, {
        ...mirroredEvent.payload,
        source: 'ursass_frontend',
        timestamp_ms: analyticsEvent.timestamp,
      });
    });
  });

  try {
    await loadPosthogScript(config.apiHost);
    posthogStarted = true;
    logger.info('📊 PostHog analytics initialized.');
    return true;
  } catch (error) {
    logger.warn('⚠️ PostHog script load failed:', error);
    return false;
  }
}

export { initPosthogAnalytics };
