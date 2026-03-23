# Refactor architecture map

This document summarizes the post-refactor runtime structure after the Stage 4-7 decomposition.
Use it as the technical overview for future changes so new work lands in the correct module instead of recreating the old monoliths.

## Runtime entrypoints

- `js/main.js` is the Vite/browser module entrypoint. It loads the stylesheet and starts runtime boot wiring.
- `js/game-runtime.js` is the app bootstrap coordinator. It guards one-time startup, initializes input/store/game subsystems, and owns the top-level lifecycle hookup.
- `js/game.js` remains the obvious gameplay runtime entrypoint used by `js/game-runtime.js`.

## Lifecycle and platform integrations

- `js/runtime-lifecycle.js` owns global resize, visibility, Telegram viewport, MetaMask subscription, and ping timer setup/cleanup.
- `js/game/integrations/telegram.js` contains Telegram Mini App specific boot/integration helpers.
- `js/game/integrations/metamask.js` contains MetaMask-specific integration helpers.

## Game module split

- `js/game/bootstrap.js` owns initialization/auth/asset/UI bootstrap flow.
- `js/game/session.js` owns menu/start/restart/game-over session transitions.
- `js/game/loop.js` owns frame scheduling, loading-frame rendering, cached background lifecycle, and delayed resize orchestration.
- `js/game.js` owns the core gameplay runtime and coordinates the split game modules.

## Store module split

- `js/store/runtime-config.js` owns unauthenticated runtime/store capability configuration.
- `js/store/rides-service.js` owns ride inventory loading/consumption helpers and ride UI refresh.
- `js/store/upgrades-service.js` owns store upgrade/effect/balance state helpers.
- `js/store/donation-ui.js` owns donation modal/history/product rendering state.
- `js/store/donation-helpers.js` owns donation normalization, persistence, and external payment helper utilities.
- `js/store/donation-flow.js` owns donation purchase/reconciliation flow orchestration.
- `js/store/donation-controller.js` owns donation UI/controller wiring.
- `js/store/store-ui.js` owns store tabs/rules/reset screen wiring.
- `js/store/bootstrap.js` owns store DOM-ready and unload bootstrap wiring.
- `js/store.js` now acts as the store-level orchestrator across those submodules.

## Shared support modules

- `js/state.js` owns gameplay runtime state and persistence helpers.
- `js/auth.js` owns auth/session identity state and auth flows.
- `js/dom-render.js` owns DOM-safe render helpers for reusable UI construction.
- `js/renderer.js` and `js/physics.js` are still the largest gameplay-heavy modules and remain the main future decomposition targets if additional refactoring is needed.

## Validation and audit workflow

For any structural change, run:

```bash
npm run check
npm run build
```

Stage 7 follow-up audit notes:

- naming and legacy asset references were normalized for the remaining obvious typo-based asset paths;
- README now links both the ownership map and this architecture map;
- static analysis still tracks legacy oversized-module hotspots, but the current follow-up audit did not find new duplicate lifecycle wiring or newly introduced hidden globals.
