# State ownership map

This document records which module owns each major runtime state domain after the Stage 4/5 decomposition.
It is the Stage 6 reference for future cleanup work: new code should mutate state through the owning module instead of reaching into unrelated modules.

## Ownership summary

| Domain | Owning module | Primary write API | Main readers |
| --- | --- | --- | --- |
| DOM/cache handles and gameplay runtime primitives | `js/state.js` | Direct object mutation on exported state containers (`gameState`, `player`, arrays) plus helper setters like `setBestScore`, `setBestDistance`, `setLaneCooldown` | `js/game.js`, `js/physics.js`, `js/renderer.js`, `js/ui.js` |
| Gameplay loop/session orchestration | `js/game.js`, `js/game/loop.js`, `js/game/session.js` | `initGame()`, loop controller methods, session controller methods | `js/game-runtime.js`, lifecycle/bootstrap wiring |
| Authentication session and linked identities | `js/auth.js` | `connectWalletAuth()`, `disconnectAuth()`, `setAuthCallbacks()` | `js/game/bootstrap.js`, `js/store.js`, `js/api.js` |
| Runtime config and unauthenticated capability flags | `js/store/runtime-config.js` via `js/store.js` | `applyRuntimeConfig()`, `loadUnauthGameConfig()`, `clearRuntimeConfig()` | `js/game/bootstrap.js`, store services |
| Ride inventory and ride countdown state | `js/store/rides-service.js` via `js/store.js` | `loadPlayerRides()`, `useRide()`, `setPlayerRides()`, `resetPlayerRides()` | `js/game/session.js`, store UI |
| Upgrade/effect/balance state | `js/store/upgrades-service.js` via `js/store.js` | `loadPlayerUpgrades()`, `buyUpgrade()`, `setPlayerStoreState()`, `resetUpgradeState()` | `js/game.js`, `js/physics.js`, store UI |
| Donation products/history/modal state | `js/store/donation-controller.js` and `js/store/donation-ui.js` via `js/store.js` | `loadDonationProducts()`, `loadDonationHistory()`, `closeDonationModal()`, `resetDonationState()` | store UI tabs and payment flow |
| Store screen/bootstrap tab state | `js/store/store-ui.js` and `js/store/bootstrap.js` via `js/store.js` | `setActiveStoreTab()`, `showRules()`, `hideRules()`, `initStoreBootstrap()` | `js/game/bootstrap.js`, store UI listeners |
| Audio enabled/muted settings and active tracks | `js/audio.js` | `setSfxEnabled()`, `setMusicEnabled()`, toggle helpers | menu/rules UI bindings, gameplay events |
| External integration lifecycle | `js/runtime-lifecycle.js`, `js/game/integrations/telegram.js`, `js/game/integrations/metamask.js` | lifecycle controller registration/cleanup methods | bootstrap/runtime wiring |

## State boundaries

### `js/state.js`: gameplay/runtime primitives

`js/state.js` is still the owner for the low-level mutable containers that power gameplay and rendering:

- `gameState`
- `player`
- `curves`
- `obstacles`, `bonuses`, `coins`, `spinTargets`
- `inputQueue`
- lazy DOM/canvas access (`DOM`, `ctx`)
- persisted best-score values and lane cooldown helpers

This module is intentionally low-level. Stage 6 follow-up should keep shrinking the number of modules that mutate these containers directly, but any new persistence or top-level gameplay counters should start here unless they clearly belong to auth/store/audio instead.

### `js/auth.js`: auth/session identity

`js/auth.js` owns:

- active auth mode (`wallet` vs `telegram`)
- connected wallet/provider references
- primary account identifiers
- linked Telegram/wallet identity metadata
- post-auth callback wiring for the rest of the app

Other modules should prefer exported query helpers like `hasWalletAuthSession()`, `isTelegramAuthMode()`, and `getPrimaryAuthIdentifier()` instead of reading auth internals.

### Store submodules: store-specific state domains

Store state is now intentionally split by concern:

- `js/store/runtime-config.js`: temporary runtime capability/config flags, especially unauth mode behavior.
- `js/store/rides-service.js`: ride inventory, resets, and ride display state.
- `js/store/upgrades-service.js`: upgrades, active player effects, balances, and purchase loading state.
- `js/store/donation-controller.js` + `js/store/donation-ui.js`: donation product/history/modal UI state.
- `js/store/store-ui.js` + `js/store/bootstrap.js`: screen/tab wiring and event bootstrap.
- `js/store.js`: orchestration facade that exposes the public store API used by the rest of the app.

Unless a caller is itself a store submodule, prefer importing the facade in `js/store.js` rather than reaching into multiple store submodules directly.

### `js/audio.js`: sound/music settings

`js/audio.js` owns both the loaded audio elements and the persisted on/off preferences for SFX/music. UI code should call the exported setters/toggles rather than writing `localStorage` keys directly.

## Persistence map

Current persistent browser storage usage is intentionally narrow:

| Storage key | Owner | Meaning |
| --- | --- | --- |
| `bestScore` | `js/state.js` | Highest recorded score shown across runs |
| `bestDistance` | `js/state.js` | Highest recorded distance shown across runs |
| `sfxEnabled` | `js/audio.js` | Whether sound effects are enabled |
| `musicEnabled` | `js/audio.js` | Whether music is enabled |

Notes:

- Store/auth/gameplay progression now primarily syncs through backend APIs and runtime controllers instead of ad hoc local storage writes.
- If a new storage key is added, document it here and keep the write API in the owning module.

## Practical rules for future refactors

1. If a module needs ride/upgrade/donation/auth data, import a read helper or facade from that owning domain first.
2. Avoid adding new cross-domain mutations from rendering code.
3. Keep `js/store.js` as the public orchestration layer; only import store submodules directly when the dependency is intentionally domain-specific.
4. Keep persistence writes co-located with the owner module and update this document when rules change.
