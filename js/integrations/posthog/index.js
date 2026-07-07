let postHogModulePromise = null;

async function loadPostHogModule() {
  if (!postHogModulePromise) {
    postHogModulePromise = import('../../posthog.js')
      .catch((error) => {
        postHogModulePromise = null;
        throw error;
      });
  }

  return postHogModulePromise;
}

function callPostHog(fnName, args) {
  return loadPostHogModule()
    .then((module) => {
      const fn = module?.[fnName];
      if (typeof fn === 'function') return fn(...args);
      return undefined;
    })
    .catch((error) => {
      console.warn(`⚠️ PostHog ${fnName} failed`, error);
      return undefined;
    });
}

function initPostHog(...args) {
  return callPostHog('initPostHog', args);
}

function capturePostHogEvent(...args) {
  return callPostHog('capturePostHogEvent', args);
}

function identifyPostHogUser(...args) {
  return callPostHog('identifyPostHogUser', args);
}

function resetPostHogUser(...args) {
  return callPostHog('resetPostHogUser', args);
}

export {
  initPostHog,
  capturePostHogEvent,
  identifyPostHogUser,
  resetPostHogUser
};