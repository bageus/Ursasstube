/* ===== NETWORK REQUEST HELPER ===== */

import { BACKEND_DISABLED, BACKEND_URL } from './config.js';

const REQUEST_DEFAULT_TIMEOUT_MS = 8000;
const REQUEST_DEFAULT_RETRIES = 1;
const REQUEST_DEFAULT_RETRY_DELAY_MS = 400;
const REQUEST_RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

class RequestError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'RequestError';
    this.code = details.code || 'REQUEST_FAILED';
    this.status = Number.isFinite(details.status) ? details.status : null;
    this.url = details.url || '';
    this.method = details.method || 'GET';
    this.attempt = Number.isFinite(details.attempt) ? details.attempt : 1;
    this.isTimeout = Boolean(details.isTimeout);
    this.isNetwork = Boolean(details.isNetwork);
    this.isAbort = Boolean(details.isAbort);
    this.cause = details.cause || null;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryRequest(error, responseStatus, attempt, maxAttempts) {
  if (attempt >= maxAttempts) return false;

  if (error) {
    return error.isTimeout || error.isNetwork;
  }

  return REQUEST_RETRY_STATUSES.has(responseStatus);
}

function isBackendRequest(url) {
  return typeof url === 'string' && url.startsWith(BACKEND_URL);
}

async function request(url, options = {}) {
  const {
    timeoutMs = REQUEST_DEFAULT_TIMEOUT_MS,
    retries = REQUEST_DEFAULT_RETRIES,
    retryDelayMs = REQUEST_DEFAULT_RETRY_DELAY_MS,
    signal,
    ...fetchOptions
  } = options;

  const method = (fetchOptions.method || 'GET').toUpperCase();

  if (BACKEND_DISABLED && isBackendRequest(url)) {
    throw new RequestError('Backend request blocked because backend mode is offline', {
      code: 'BACKEND_DISABLED',
      url,
      method,
      attempt: 1
    });
  }

  const maxAttempts = Math.max(1, retries + 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const timeoutController = new AbortController();
    const externalAbort = () => timeoutController.abort();
    let timeoutId = null;

    try {
      if (signal) {
        if (signal.aborted) timeoutController.abort();
        signal.addEventListener('abort', externalAbort, { once: true });
      }

      timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

      const response = await fetch(url, {
        ...fetchOptions,
        signal: timeoutController.signal
      });

      if (shouldRetryRequest(null, response.status, attempt, maxAttempts)) {
        await delay(retryDelayMs * attempt);
        continue;
      }

      return response;
    } catch (error) {
      const isAbort = error && error.name === 'AbortError';
      const normalizedError = new RequestError(
        isAbort ? 'Request timeout exceeded' : 'Network request failed',
        {
          code: isAbort ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
          url,
          method,
          attempt,
          isTimeout: isAbort,
          isAbort,
          isNetwork: !isAbort,
          cause: error
        }
      );

      if (shouldRetryRequest(normalizedError, null, attempt, maxAttempts)) {
        await delay(retryDelayMs * attempt);
        continue;
      }

      throw normalizedError;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (signal) signal.removeEventListener('abort', externalAbort);
    }
  }

  throw new RequestError('Request failed after retries', {
    code: 'REQUEST_RETRIES_EXHAUSTED',
    url,
    method
  });
}


export { RequestError, request };
