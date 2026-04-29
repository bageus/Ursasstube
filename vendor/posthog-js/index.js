const DEFAULT_API_HOST = 'https://eu.i.posthog.com';
const EVENT_ENDPOINT_PATH = '/e/';

let state = {
  apiKey: '',
  apiHost: DEFAULT_API_HOST,
  distinctId: null,
  superProperties: {},
};

function safeUuid() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (_) {
    // ignore
  }

  return `anon_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeHost(host) {
  const value = String(host || '').trim();
  if (!value) return DEFAULT_API_HOST;
  return value.replace(/\/$/, '');
}

function ensureDistinctId() {
  if (!state.distinctId) {
    state.distinctId = safeUuid();
  }
  return state.distinctId;
}

function send(body) {
  if (!state.apiKey || typeof fetch !== 'function') return;

  const url = `${state.apiHost}${EVENT_ENDPOINT_PATH}`;
  const payload = {
    api_key: state.apiKey,
    ...body,
  };

  try {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
      credentials: 'omit',
      mode: 'cors',
    }).catch(() => {});
  } catch (_) {
    // ignore transport failures
  }
}

const posthog = {
  init(apiKey, config = {}) {
    state = {
      ...state,
      apiKey: String(apiKey || '').trim(),
      apiHost: normalizeHost(config?.api_host || DEFAULT_API_HOST),
    };
    ensureDistinctId();
  },

  capture(event, properties = {}) {
    const eventName = String(event || '').trim();
    if (!eventName) return;

    send({
      event: eventName,
      distinct_id: ensureDistinctId(),
      properties: {
        ...state.superProperties,
        ...(properties && typeof properties === 'object' ? properties : {}),
      },
      timestamp: new Date().toISOString(),
    });
  },

  identify(id, setProperties = {}) {
    const distinctId = String(id || '').trim();
    if (!distinctId) return;
    state.distinctId = distinctId;

    const personProperties = setProperties && typeof setProperties === 'object' ? setProperties : {};
    if (Object.keys(personProperties).length > 0) {
      send({
        event: '$identify',
        distinct_id: distinctId,
        properties: {
          $set: personProperties,
        },
        timestamp: new Date().toISOString(),
      });
    }
  },

  reset() {
    state.distinctId = safeUuid();
    state.superProperties = {};
  },
};

export default posthog;
