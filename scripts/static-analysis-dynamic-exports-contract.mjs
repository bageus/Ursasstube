import { connectWalletAuthFlow } from '../js/auth-authentication.js';
import {
  capturePostHogEvent,
  identifyPostHogUser,
  initPostHog,
  resetPostHogUser,
} from '../js/posthog.js';

// These exports are consumed through dynamic import bridges at runtime.
// Keeping this static contract lets the static-analysis guard understand that
// they are public module boundaries without changing lazy-loading behavior.
void [
  connectWalletAuthFlow,
  capturePostHogEvent,
  identifyPostHogUser,
  initPostHog,
  resetPostHogUser,
];
