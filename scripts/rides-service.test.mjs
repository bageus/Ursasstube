import test from 'node:test';
import assert from 'node:assert/strict';

if (!globalThis.window) globalThis.window = {};
Object.assign(globalThis.window, {
  location: { href: 'http://localhost/' },
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false
});
if (!globalThis.document) globalThis.document = {};
Object.assign(globalThis.document, { createTextNode: (t) => t, getElementById: () => null });

const ridesModule = await import('../js/store/rides-service.js');
const { createRidesService, resetPlayerRides, getPlayerRides } = ridesModule;

function makeService(overrides = {}) {
  return createRidesService(
    {
      isUnauthRuntimeMode: () => Boolean(overrides.unauthMode),
      hasRideLimit: () => overrides.hasRideLimit ?? true
    },
    {
      isAuthenticated: () => overrides.isAuthenticated ?? true,
      getAuthIdentifier: () => '0xabc',
      requestJson: overrides.requestJson,
      requestJsonResult: overrides.requestJsonResult,
      buildAuthHeaders: () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer token' }),
      handleUnauthorizedResponse: () => {},
      generateRideSessionId: overrides.generateRideSessionId
    }
  );
}

test('useRide uses consume-ride and sends rideSessionId + auth header', async () => {
  let calledUrl = '';
  let body = null;
  let authHeader = '';
  const service = makeService({
    generateRideSessionId: () => 'uuid-1',
    requestJsonResult: async (url, options) => {
      calledUrl = url;
      body = JSON.parse(options.body);
      authHeader = options.headers.Authorization;
      return { ok: true, status: 200, data: { success: true, rides: { totalRides: 2 } } };
    }
  });

  try {
    const result = await service.useRide();
    assert.equal(result, true);
    assert.match(calledUrl, /\/api\/store\/consume-ride$/);
    assert.equal(body.rideSessionId, 'uuid-1');
    assert.equal(authHeader, 'Bearer token');
  } finally {}
});

test('useRide returns false on http and network errors', async () => {
  assert.equal(await makeService({ requestJsonResult: async () => ({ ok: false, status: 409, data: { rides: { totalRides: 1 } } }) }).useRide(), false);
  assert.equal(await makeService({ requestJsonResult: async () => { throw new Error('network'); } }).useRide(), false);
});

test('guest unlimited unauth runtime still returns true', async () => {
  resetPlayerRides();
  assert.equal(await makeService({ isAuthenticated: false, unauthMode: true, hasRideLimit: false }).useRide(), true);
  assert.equal(getPlayerRides().totalRides, 3);
});

test('in-flight guard prevents duplicate consume calls', async () => {
  let calls = 0;
  let resolveReq;
  const pending = new Promise((resolve) => { resolveReq = resolve; });
  const service = makeService({ requestJsonResult: async () => { calls += 1; await pending; return { ok: true, status: 200, data: { success: true, rides: { totalRides: 1 } } }; } });
  const p1 = service.useRide();
  const p2 = service.useRide();
  resolveReq();
  await Promise.all([p1, p2]);
  assert.equal(calls, 1);
});
