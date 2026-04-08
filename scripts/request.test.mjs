import test from 'node:test';
import assert from 'node:assert/strict';
import { request, requestJson, requestJsonResult } from '../js/request.js';

function createAbortError(message = 'Aborted') {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

test('request retries retryable HTTP status and eventually succeeds', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response('temporary failure', { status: 500 });
    }
    return new Response('ok', { status: 200 });
  };

  try {
    const response = await request('https://example.com/retry', {
      retries: 1,
      retryDelayMs: 1,
      timeoutMs: 50,
    });

    assert.equal(response.status, 200);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('request does not retry non-retryable HTTP status', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = async () => {
    calls += 1;
    return new Response('bad request', { status: 400 });
  };

  try {
    const response = await request('https://example.com/no-retry', {
      retries: 3,
      retryDelayMs: 1,
      timeoutMs: 50,
    });

    assert.equal(response.status, 400);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('request throws timeout error metadata when fetch hangs', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (_url, options = {}) =>
    new Promise((resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(createAbortError('Timed out')), {
        once: true,
      });
    });

  try {
    await assert.rejects(
      () =>
        request('https://example.com/timeout', {
          retries: 0,
          timeoutMs: 10,
        }),
      (error) => {
        assert.equal(error.name, 'RequestError');
        assert.equal(error.code, 'REQUEST_TIMEOUT');
        assert.equal(error.isTimeout, true);
        assert.equal(error.isAbort, true);
        assert.equal(error.isNetwork, false);
        assert.equal(error.attempt, 1);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('request surfaces external abort as REQUEST_ABORTED and does not retry', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = async (_url, options = {}) => {
    calls += 1;
    if (calls === 1) {
      return new Promise((resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(createAbortError('Externally aborted')), {
          once: true,
        });
      });
    }
    return new Response('ok', { status: 200 });
  };

  const controller = new AbortController();

  try {
    const promise = request('https://example.com/external-abort', {
      retries: 1,
      retryDelayMs: 1,
      timeoutMs: 50,
      signal: controller.signal,
    });

    controller.abort();

    await assert.rejects(
      () => promise,
      (error) => {
        assert.equal(error.name, 'RequestError');
        assert.equal(error.code, 'REQUEST_ABORTED');
        assert.equal(error.isTimeout, false);
        assert.equal(error.isAbort, true);
        assert.equal(error.isNetwork, false);
        assert.equal(error.attempt, 1);
        return true;
      },
    );

    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('request rejects unsupported URL protocols before fetch', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = async () => {
    calls += 1;
    return new Response('ok', { status: 200 });
  };

  try {
    await assert.rejects(
      () => request('javascript:alert(1)'),
      (error) => {
        assert.equal(error.name, 'RequestError');
        assert.equal(error.code, 'REQUEST_UNSUPPORTED_PROTOCOL');
        return true;
      },
    );

    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('requestJson validates response.ok and parses JSON safely', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 });
    }
    if (calls === 2) {
      return new Response('not-json', { status: 200 });
    }
    return new Response(JSON.stringify({ mode: 'unauth' }), { status: 200 });
  };

  try {
    await assert.rejects(
      () => requestJson('https://example.com/fails-status', { retries: 0 }),
      (error) => {
        assert.equal(error.name, 'RequestError');
        assert.equal(error.code, 'REQUEST_HTTP_ERROR');
        assert.equal(error.status, 503);
        return true;
      },
    );

    await assert.rejects(
      () => requestJson('https://example.com/invalid-json', { retries: 0 }),
      (error) => {
        assert.equal(error.name, 'RequestError');
        assert.equal(error.code, 'REQUEST_INVALID_JSON');
        assert.equal(error.status, 200);
        return true;
      },
    );

    const result = await requestJson('https://example.com/success');
    assert.deepEqual(result, { mode: 'unauth' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('request clamps retries to hard maximum', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = async () => {
    calls += 1;
    return new Response('temporary failure', { status: 503 });
  };

  try {
    const response = await request('https://example.com/retries-clamped', {
      retries: 99,
      retryDelayMs: 1,
      timeoutMs: 50,
    });

    assert.equal(response.status, 503);
    assert.equal(calls, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('requestJsonResult returns ok/status/data without enforcing HTTP ok', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => new Response(JSON.stringify({ success: false, error: 'invalid signature' }), { status: 401 });

  try {
    const result = await requestJsonResult('https://example.com/auth', { retries: 0 });
    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
    assert.deepEqual(result.data, { success: false, error: 'invalid signature' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
