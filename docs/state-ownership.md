# State ownership map

This document records which module owns each major mutable state domain after the Stage 4/5 decomposition.
It is the Stage 6 baseline for future API cleanup work: writes should stay inside the owning module unless an exported setter/controller explicitly allows them.

## Ownership summary

| Domain | Primary owner | Read access | Approved write path | Notes |
| --- | --- | --- | --- | --- |
| Core gameplay runtime (`gameState`, `player`, spawn arrays, lane cooldown, best score/distance) | `js/state.js` | `js/game.js`, `js/physics.js`, `js/renderer.js`, `js/ui.js`, `js/audio.js`, `js/input.js` | Gameplay startup/reset writes should go through `initializeGameplayRun(...)`, `applyGameplayUpgradeState(...)`, and `clearGameplayCollections()`. Persisted best-score writes must go through `setBestScore(...)` / `setBestDistance(...)`, and save/report flows should read `getGameplayProgressSnapshot()`. | Shared runtime mutation is narrower now, but this is still the largest mutable surface. |
| Auth/session identity (`authMode`, `primaryId`, wallet/Telegram linkage) | `js/auth.js` | `js/api.js`, `js/game/bootstrap.js`, `js/runtime-lifecycle.js`, `js/store.js`, `js/ui.js` | Session transitions now funnel through auth-owned helpers (`applyAuthSession(...)` / `clearAuthSessionState()` internally) plus the public auth flows (`connectWalletAuth`, `disconnectAuth`, Telegram bootstrap helpers, `setAuthCallbacks`). Cross-module reads should use exported selectors or `getAuthStateSnapshot()`. | Other modules should not recreate auth-session resets inline. |
| Unauthenticated runtime/store config (`runtimeGameConfig`, capability flags) | `js/store/runtime-config.js` via `js/store.js` | `js/game/bootstrap.js`, `js/store/upgrades-service.js`, `js/store/rides-service.js`, `js/ui.js` | `applyRuntimeConfig`, `loadUnauthGameConfig`, `clearRuntimeConfig`. | This module is the owner for “play without auth” store capabilities and limits. |
| Ride inventory/state (`playerRides`) | `js/store/rides-service.js` orchestrated by `js/store.js` | `js/game/session.js`, `js/store.js`, `js/ui.js` | Store-level writes should go through `applyStorePlayerState(...)` / `resetStorePlayerState()` in `js/store.js`, while runtime consumption still uses `loadPlayerRides`, `useRide`, and `updateRidesDisplay`. | UI refreshes should go through `updateRidesDisplay()`. |
| Store upgrade/effect/balance state (`playerUpgrades`, `playerEffects`, store balance) | `js/store/upgrades-service.js` orchestrated by `js/store.js` | `js/game.js`, `js/game/session.js`, `js/physics.js`, `js/store.js`, `js/ui.js` | Store-level writes should go through `applyStorePlayerState(...)` / `resetStorePlayerState()` in `js/store.js`; feature flows should use `loadPlayerUpgrades`, `buyUpgrade`, and `getGameplayUpgradeSnapshot()`. | Gameplay code reads upgrade/effect snapshots but should not write raw store state. |
| Donation modal/history/product state | `js/store/donation-controller.js` + `js/store/donation-flow.js` + `js/store/donation-ui.js` | `js/store.js`, `js/store/store-ui.js` | Donation controller methods (`loadDonationProducts`, `loadDonationHistory`, `closeDonationModal`, payment modal renderers). | Donation persistence helpers live in `js/store/donation-helpers.js`. |
| Store screen/tab/rules UI state | `js/store/store-ui.js` | `js/store.js`, `js/ui.js` | `setActiveStoreTab`, `resetStoreUiState`, `showRules`, `hideRules`, `updateRulesAudioButtons`. | Keep screen toggles here instead of re-spreading listeners into `store.js`. |
| Runtime lifecycle subscriptions/timers | `js/runtime-lifecycle.js` | `js/game-runtime.js` | `initializeRuntimeLifecycle`, cleanup returned by the lifecycle controller. | Owns resize, visibility, Telegram viewport, MetaMask listeners, and ping timers. |
| Audio settings + active playback state | `js/audio.js` | `js/game/session.js`, `js/store/store-ui.js`, `js/main.js`, other UI flows | `setSfxEnabled`, `setMusicEnabled`, `toggleSfxMute`, `toggleMusicMute`, `restoreAudioSettings`. | `audioManager` owns concrete `<audio>` elements; `audioSettings` owns persisted toggle preferences. |
| API/leaderboard request state | Call-site local state in `js/api.js`, `js/request.js`, donation/store services | Feature modules that invoke the requests | Promise-returning service functions only. | No shared singleton cache currently exists outside store/auth/game state. |

## Cross-module mutation rules

1. **Selectors over shared object reach-in.** Modules outside an owner should prefer exported getters/selectors/controllers over importing broad mutable objects when that API already exists.
2. **UI refresh stays with the owner.** If a state domain requires a paired UI update (rides, store tabs, donation modal, audio toggles), use the owner’s public update/render function instead of partially patching DOM from another module.
3. **Persistence writes stay centralized.** `localStorage` writes are only allowed in the owner module listed below unless Stage 6 explicitly moves them.
4. **Runtime wiring goes through controllers.** Lifecycle, bootstrap, and donation/store flows should register through their controller module instead of adding new global listeners/timers ad hoc.

## Persistence registry

Current browser persistence usage is intentionally small and explicit.

| Storage key | Owner module | Purpose | Read path | Write path |
| --- | --- | --- | --- | --- |
| `bestScore` | `js/state.js` | Persist highest score across sessions. | `getBestScore()` lazy initialization in `js/state.js`. | `setBestScore(value)`. |
| `bestDistance` | `js/state.js` | Persist longest distance across sessions. | `getBestDistance()` lazy initialization in `js/state.js`. | `setBestDistance(value)`. |
| `sfxEnabled` | `js/audio.js` | Persist SFX mute preference. | `restoreAudioSettings()`. | `setSfxEnabled(enabled)`. |
| `musicEnabled` | `js/audio.js` | Persist music mute preference. | `restoreAudioSettings()`. | `setMusicEnabled(enabled)`. |
| `ursass.logLevel` | `js/logger.js` | Persist logger verbosity/debug override. | Logger bootstrap in `js/logger.js`. | `logger.setLevel(...)` and query-param override sync. |
| `ursass.pendingDonationPayments.v1` | `js/store/donation-helpers.js` | Persist pending donation/payment reconciliation metadata between reloads. | `getDonationPendingStore()` helper chain. | `setDonationPendingEntry(...)` / `clearDonationPendingEntry(...)`. |

### Persistence rules

- `js/state.js` owns player best-score persistence only; gameplay modules must not call `localStorage` directly for score/distance.
- `js/audio.js` owns audio preference persistence only; UI modules should toggle through exported audio setters.
- `js/logger.js` is the only module allowed to persist logging configuration.
- Donation pending-payment persistence must stay inside `js/store/donation-helpers.js` so payment recovery logic remains coupled to donation normalization.
- New persistent keys should be added to this table before or with the code change that introduces them.

## Stage 6 follow-up targets

- Reduce direct imports of broad mutable gameplay/store state where a smaller selector can be introduced without changing behavior.
- Tighten the remaining direct gameplay runtime mutations where a focused owner helper can replace broad object writes without obscuring hot-path logic.
