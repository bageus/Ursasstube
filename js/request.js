/* ===== NETWORK REQUEST HELPER ===== */

const REQUEST_DEFAULT_TIMEOUT_MS = 8000;
const REQUEST_DEFAULT_RETRIES = 1;
const REQUEST_DEFAULT_RETRY_DELAY_MS = 400;
const REQUEST_MAX_RETRY_DELAY_MS = 4000;
const REQUEST_RETRY_BACKOFF_MULTIPLIER = 2;
const REQUEST_RETRY_JITTER_RATIO = 0.2;
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

const REQUEST_ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRequestUrl(rawUrl) {
  if (!(typeof rawUrl === 'string' || rawUrl instanceof URL)) {
    throw new RequestError('Unsupported request URL type', {
      code: 'REQUEST_INVALID_URL',
      url: String(rawUrl ?? '')
    });
  }

  try {
    return new URL(rawUrl, 'http://localhost');
  } catch (_error) {
    throw new RequestError('Invalid request URL', {
      code: 'REQUEST_INVALID_URL',
      url: String(rawUrl ?? '')
    });
  }
}

function validateRequestUrlProtocol(rawUrl) {
  const parsedUrl = getRequestUrl(rawUrl);
  if (!REQUEST_ALLOWED_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new RequestError('Unsupported URL protocol', {
      code: 'REQUEST_UNSUPPORTED_PROTOCOL',
      url: String(rawUrl ?? '')
    });
  }
}


function getRetryDelayMs(baseDelayMs, attempt) {
  const safeBase = Math.max(0, Number(baseDelayMs) || 0);
  const exponentialDelay = safeBase * Math.pow(REQUEST_RETRY_BACKOFF_MULTIPLIER, Math.max(0, attempt - 1));
  const jitterSpread = exponentialDelay * REQUEST_RETRY_JITTER_RATIO;
  const jitter = jitterSpread > 0 ? (Math.random() * 2 - 1) * jitterSpread : 0;
  const jitteredDelay = exponentialDelay + jitter;
  return Math.max(0, Math.min(REQUEST_MAX_RETRY_DELAY_MS, Math.round(jitteredDelay)));
}

function shouldRetryRequest(error, responseStatus, attempt, maxAttempts) {
  if (attempt >= maxAttempts) return false;

  if (error) {
    return error.isTimeout || error.isNetwork;
  }

  return REQUEST_RETRY_STATUSES.has(responseStatus);
}

async function request(url, options = {}) {
  validateRequestUrlProtocol(url);

  const {
    timeoutMs = REQUEST_DEFAULT_TIMEOUT_MS,
    retries = REQUEST_DEFAULT_RETRIES,
    retryDelayMs = REQUEST_DEFAULT_RETRY_DELAY_MS,
    signal,
    ...fetchOptions
  } = options;

  const method = (fetchOptions.method || 'GET').toUpperCase();
  const maxAttempts = Math.max(1, retries + 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const timeoutController = new AbortController();
    const externalAbort = () => timeoutController.abort();
    let timeoutId = null;
    let timeoutTriggered = false;

    try {
      if (signal) {
        if (signal.aborted) timeoutController.abort();
        signal.addEventListener('abort', externalAbort, { once: true });
      }

      timeoutId = setTimeout(() => {
        timeoutTriggered = true;
        timeoutController.abort();
      }, timeoutMs);

      const response = await fetch(url, {
        ...fetchOptions,
        signal: timeoutController.signal
      });

      if (shouldRetryRequest(null, response.status, attempt, maxAttempts)) {
        await delay(getRetryDelayMs(retryDelayMs, attempt));
        continue;
      }

      return response;
    } catch (error) {
      const isAbort = error && error.name === 'AbortError';
      const isTimeoutAbort = isAbort && timeoutTriggered;
      const isExternalAbort = isAbort && !timeoutTriggered;
      const normalizedError = new RequestError(
        isTimeoutAbort ? 'Request timeout exceeded' : isExternalAbort ? 'Request was aborted' : 'Network request failed',
        {
          code: isTimeoutAbort ? 'REQUEST_TIMEOUT' : isExternalAbort ? 'REQUEST_ABORTED' : 'NETWORK_ERROR',
          url,
          method,
          attempt,
          isTimeout: isTimeoutAbort,
          isAbort,
          isNetwork: !isAbort,
          cause: error
        }
      );

      if (shouldRetryRequest(normalizedError, null, attempt, maxAttempts)) {
        await delay(getRetryDelayMs(retryDelayMs, attempt));
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

async function requestJson(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const response = await request(url, options);
  let data;

  try {
    data = await response.json();
  } catch (error) {
    throw new RequestError('Invalid JSON response', {
      code: 'REQUEST_INVALID_JSON',
      status: response.status,
      url,
      method,
      cause: error
    });
  }

  if (!response.ok) {
    throw new RequestError(`HTTP ${response.status}`, {
      code: 'REQUEST_HTTP_ERROR',
      status: response.status,
      url,
      method,
      cause: data
    });
  }

  return data;
}

export { request, requestJson };
