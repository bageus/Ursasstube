# Code review: 10 improvement proposals (2026-04-05)

## 1) Decompose oversized baseline modules into bounded domains
The static-analysis guardrail allows six oversized baseline modules (`js/auth.js`, `js/game.js`, `js/phaser/entities/EntityRenderer.js`, `js/phaser/tunnel/TunnelRenderer.js`, `js/physics.js`, `js/store.js`).

**Proposal:** split these files into feature-level slices (state, rendering, orchestration, adapters) and enforce a hard no-new-oversized policy until the baseline is reduced to zero.

**Why:** faster onboarding, lower merge-conflict risk, and easier targeted testing.

## 2) Add unit coverage for networking edge cases in `request()`
`js/request.js` has retry/timeout behavior but no corresponding test suite in repository scripts.

**Proposal:** add focused tests for timeout, retryable status codes, non-retryable status codes, and external abort handling.

**Why:** this module is a shared reliability primitive; regressions here affect auth, store, and runtime APIs.

## 3) Distinguish user-initiated abort from timeout abort in request errors
In `request()`, all `AbortError` paths are mapped to `REQUEST_TIMEOUT`, including external signal cancellation.

**Proposal:** differentiate abort reasons (timeout vs caller cancel), e.g., by tagging timeout-triggered aborts and setting distinct error codes.

**Why:** this improves telemetry and UX messaging ("canceled" vs "timed out").

## 4) Add randomized exponential backoff for retries
Current retry delay is linear (`retryDelayMs * attempt`).

**Proposal:** switch to capped exponential backoff with jitter for retryable statuses/network failures.

**Why:** reduces retry storms and improves backend resilience under partial outages.

## 5) Add bootstrap-level error boundary and fallback UI
`js/main.js` boots runtime via dynamic import and starts immediately, but there is no top-level `try/catch` with user-visible fallback.

**Proposal:** wrap bootstrap in a guarded startup path that renders a recoverable error state and logs structured diagnostics.

**Why:** startup failures currently risk silent breakage or console-only diagnostics.

## 6) Reduce auth module coupling via explicit state container + service boundaries
`js/auth.js` mixes wallet transport, Telegram session parsing, DOM rendering, callback orchestration, and network calls in one large module.

**Proposal:** split into `auth-state`, `auth-service`, and `auth-ui` units with explicit contracts.

**Why:** improves testability, enables safer refactors, and shrinks blast radius of auth changes.

## 7) Replace blocking `alert()` flows with consistent in-app notifications
`js/auth.js` still relies on `alert()` in several failure paths.

**Proposal:** route errors through one UI notifier/toast system with categorized severity and action hints.

**Why:** better UX in Telegram/webview contexts and easier localization/analytics.

## 8) Harden static-analysis guardrails by burning down baseline allowlists
`scripts/check-static-analysis.mjs` contains baseline allowlists for oversized modules, unused exports, and implicit global writes.

**Proposal:** introduce a scheduled burn-down target (e.g., remove at least one baseline exception per iteration) and fail CI when target is missed.

**Why:** prevents "temporary baseline" from becoming permanent technical debt.

## 9) Add pre-commit quality gates and optional CI mirror for local checks
Validation exists in `npm run check`, but there is no repository-level pre-commit hook or documented CI parity gate.

**Proposal:** add a lightweight pre-commit hook (`check-syntax`, static-analysis) and CI job mirroring full `npm run check` + `npm run build`.

**Why:** catches issues earlier and makes validation expectations uniform across contributors.

## 10) Normalize npm environment warnings to keep logs signal-rich
Current check output includes repeated npm warning: `Unknown env config "http-proxy"`.

**Proposal:** document/fix environment config source so routine validation logs stay warning-clean.

**Why:** cleaner logs make real regressions easier to spot in local and CI runs.
