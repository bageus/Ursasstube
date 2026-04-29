const noop = () => {};

const posthog = {
  init: noop,
  capture: noop,
  identify: noop,
  reset: noop,
};

export default posthog;
