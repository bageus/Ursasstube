# Audit-driven refactor execution plan

This file is the single source of truth for the refactor roadmap.
Codex must use this document as the primary execution checklist for future implementation work.

## Hard rules for Codex

1. **Work only in small steps.** Never mix unrelated refactors in one pass.
2. **Before changing code, read the relevant section of this file** and execute only the current active stage.
3. **Do not skip stages.** Later stages may start only after all blocking items from the current stage are completed.
4. **After finishing any task, immediately mark it in this file** by replacing `- [ ]` with `- [x]`.
5. **If a task cannot be completed, do not mark it done.** Add a short nested note explaining the blocker.
6. **After finishing an entire stage, add a short dated progress note** under the stage with what changed and what remains.
7. **Keep behavior stable unless the task explicitly allows behavior changes.** Refactor first, optimize second.
8. **Run validation after every meaningful step.** Minimum: `npm run check`. If rendering/runtime code changed, also run `npm run build`.
9. **Do not expand public APIs without a strong reason.** Prefer reducing exports and hidden global dependencies.
10. **Do not introduce new `window` globals, inline HTML rendering, or duplicate event subscriptions.**
11. **If new findings appear during execution, record them in this file** under `Discovered during execution` instead of keeping them only in chat.
12. **If a completed item is later partially reverted, update this file honestly** and add a short explanation.

## Definition of done for each stage

A stage is considered complete only when all of the following are true:

- all required checklist items in the stage are marked `[x]`;
- validation commands for the stage were run successfully;
- this file was updated to reflect the completed items;
- no known blocker remains unresolved inside that stage.

---

## Stage 0 — Baseline and guardrails

Goal: stabilize the refactor process before structural changes.

- [x] Add ESLint or another stricter static analysis layer suitable for the current JS/Vite setup.
- [x] Define a minimal rule set that catches unused exports/imports, accidental globals, and oversized files.
- [x] Document the standard validation sequence for all future stages.
- [x] Record current large-module hotspots and treat them as primary decomposition targets.

Progress note (2026-03-23): Added a repository static-analysis guardrail script and wired it into `npm run check`. Current decomposition hotspots recorded from the guardrail baseline: `js/store.js` (2517 lines), `js/renderer.js` (1275), `js/physics.js` (782), `js/game.js` (733), and `js/auth.js` (627). Stage 0 implementation is complete; the next stage should start with lifecycle listener/timer inventory.

Validation:
- `npm run check`
- `npm run build`

---

## Stage 1 — Lifecycle consolidation

Goal: remove duplicated global subscriptions and centralize runtime lifecycle ownership.

- [x] Inventory all global listeners, timers, and bootstrap side effects.
- [x] Move ownership of resize, visibility, Telegram viewport, MetaMask, and ping timers into one lifecycle controller.
- [x] Remove duplicate resize subscriptions.
- [x] Add explicit cleanup/unsubscribe paths where possible.
- [x] Verify that boot still happens exactly once.

Inventory snapshot (2026-03-23):
- Bootstrap ownership is split between `js/game-runtime.js` (`DOMContentLoaded`, resize wiring, `initStoreBootstrap`, `initInputHandlers`, `initGame`), `js/renderer.js` (module-scope `window.resize` subscription), `js/stabilize-menu.js` (`window.load`), and `js/store.js` (its own `DOMContentLoaded` fallback path). This is the main source of "boot exactly once" risk.
- Global lifecycle listeners currently live in multiple places: `js/game.js` owns `document.visibilitychange` plus MetaMask `accountsChanged`/`chainChanged`; `js/game-runtime.js` and `js/renderer.js` both subscribe to resize; `js/store.js` owns `window.beforeunload`; `js/input.js` owns document touch/keyboard listeners.
- Active timer/requestAnimationFrame ownership is also fragmented: `js/game.js` drives the main loop plus gameplay/audio/reflow timers, `js/store.js` owns donation cooldown/countdown timers, `js/request.js` owns retry/timeout timers, and `js/stabilize-menu.js` uses `requestAnimationFrame` plus `setTimeout` for menu settling.
- Primary duplicate/global cleanup targets for the next step: duplicate resize ownership (`js/game-runtime.js` + `js/renderer.js`), missing unsubscribe paths for MetaMask listeners in `js/game.js`, and cross-module boot side effects spread across `js/game-runtime.js`, `js/store.js`, and `js/stabilize-menu.js`.

Progress note (2026-03-23): Completed the Stage 1 lifecycle inventory. Remaining work is to centralize ownership of resize, visibility, Telegram/MetaMask integrations, and timers without changing runtime behavior.
Progress note (2026-03-23): Added `js/runtime-lifecycle.js` as the shared owner for resize, visibility, Telegram viewport, MetaMask, and ping subscriptions; removed the duplicate renderer resize listener; and kept bootstrap single-run guards in `game-runtime.js`/`store.js` as the one-time boot protection. Stage 1 is now complete and the next step should start with Stage 2 global side-effect removal.

Blocking notes:
- `renderer.js`, `game-runtime.js`, and `game.js` currently share lifecycle responsibilities.

Validation:
- `npm run check`
- `npm run build`

---

## Stage 2 — Remove global side effects and hidden coupling

Goal: make modules more explicit and predictable.

- [x] Remove unnecessary `Object.assign(window, ...)` exports.
- [x] Replace implicit global access patterns with explicit imports.
- [x] Stop overriding `console.*` globally; keep logging explicit.
- [x] Reduce import-time side effects where feasible.
- [x] Re-check whether any debug globals are still truly required.

Progress note (2026-03-23): Removed legacy `Object.assign(window, ...)` exports from `js/request.js`, `js/assets.js`, and `js/particles.js`. Follow-up work also switched runtime logging call sites to explicit `logger` imports and removed the logger's `window` globals / `console.*` overrides. Remaining Stage 2 work is to reduce the remaining import-time side effects where feasible.
Progress note (2026-03-23): Reduced Stage 2 import-time side effects in `js/state.js` by lazily resolving DOM nodes, canvas context creation, and persisted best-score values instead of touching `document`/`localStorage` during module evaluation. Stage 2 is now complete; the next step should start with Stage 3 DOM-safety cleanup.

Blocking notes:
- None. Stage 2 is complete.

Validation:
- `npm run check`
- `npm run build`

---

## Stage 3 — DOM safety and rendering hygiene

Goal: remove remaining unsafe or inconsistent rendering paths.

- [x] Remove or isolate unsafe `innerHTML` helper usage.
- [x] Replace string-built leaderboard skeleton rendering with DOM node construction.
- [x] Standardize DOM access so repeated `document.getElementById(...)` usage is reduced in shared flows.
- [x] Keep UI rendering helpers small and DOM-safe.

Progress note (2026-03-23): Removed generic `innerHTML` writes from shared rendering helpers, rebuilt leaderboard skeletons with DOM node construction, and reused cached `DOM` references for wallet leaderboard stats so shared UI flows no longer depend on ad hoc `document.getElementById(...)` lookups. Stage 3 is now complete; the next step should start with Stage 4 store decomposition.

Blocking notes:
- None. Stage 3 is complete.

Validation:
- `npm run check`
- `npm run build`

---

## Stage 4 — Split `store.js`

Goal: decompose the highest-risk module first.

- [x] Extract runtime config logic into a dedicated module.
- [x] Extract rides logic into a dedicated module.
- [x] Extract upgrades/balance loading into a dedicated module.
- [x] Extract donation UI state and rendering into dedicated modules.
- [x] Extract store bootstrap/screen wiring into a dedicated module.
- [ ] Reduce `store.js` to orchestration or remove it entirely if decomposition is complete.

Suggested target structure:
- `js/store/runtime-config.js`
- `js/store/rides-service.js`
- `js/store/upgrades-service.js`
- `js/store/donation-ui.js`
- `js/store/store-ui.js`
- `js/store/bootstrap.js`

Progress note (2026-03-23): Extracted unauth runtime-config state, capability helpers, and config loading into `js/store/runtime-config.js`, leaving `store.js` responsible only for wiring player-state updates from that controller. Remaining Stage 4 work is rides, upgrades, donation UI, and bootstrap decomposition.
Progress note (2026-03-23): Extracted rides state, ride consumption/loading flows, and rides UI rendering helpers into `js/store/rides-service.js`. Remaining Stage 4 work is upgrades, donation UI, and bootstrap decomposition.
Progress note (2026-03-23): Extracted upgrades state, upgrade normalization/loading, purchase orchestration, and store upgrade rendering into `js/store/upgrades-service.js`, while updating `game.js` and `physics.js` to import store gameplay state directly from the new store submodules. Remaining Stage 4 work is donation UI and bootstrap decomposition.
Progress note (2026-03-23): Extracted donation UI state factories and donation product/history rendering into `js/store/donation-ui.js`, leaving `store.js` focused on donation payment orchestration and shared store coordination. Remaining Stage 4 work is store bootstrap decomposition and further reduction of `store.js`.
Progress note (2026-03-23): Started the remaining bootstrap decomposition by moving DOM-ready and unload listener ownership into `js/store/bootstrap.js`. Remaining Stage 4 work is to finish store screen wiring extraction and further reduce `store.js`.
Progress note (2026-03-23): Finished extracting store tab/rules/reset screen wiring into `js/store/store-ui.js`, so `store.js` now delegates bootstrap and screen-state behavior to dedicated store submodules. Remaining Stage 4 work is to further reduce `store.js` toward orchestration-only ownership.
Progress note (2026-03-23): Extracted donation pricing/history normalization, pending-payment persistence, Telegram invoice helpers, and wallet transaction helpers into `js/store/donation-helpers.js`, reducing `store.js` to donation flow orchestration plus remaining async coordination. Remaining Stage 4 work is to finish slimming `store.js` toward orchestration-only ownership before marking the stage complete.

Validation:
- `npm run check`
- `npm run build`

---

## Stage 5 — Split `game.js`

Goal: separate bootstrap, session flow, and runtime loop concerns.

- [ ] Extract app/game bootstrap from gameplay session control.
- [ ] Extract external integrations (Telegram, MetaMask) from core gameplay flow.
- [ ] Extract loop/timer orchestration from initialization logic.
- [ ] Keep game start/game over/menu transitions behavior-compatible.
- [ ] Verify there is one obvious entrypoint for the runtime.

Suggested target structure:
- `js/game/bootstrap.js`
- `js/game/session.js`
- `js/game/loop.js`
- `js/game/integrations/telegram.js`
- `js/game/integrations/metamask.js`

Validation:
- `npm run check`
- `npm run build`

---

## Stage 6 — State ownership cleanup

Goal: make state boundaries explicit across gameplay, auth, store, and audio.

- [ ] Document which module owns each major state domain.
- [ ] Reduce cross-module mutation of shared state where feasible.
- [ ] Introduce clearer read/write APIs for auth/store/game state.
- [ ] Review localStorage usage and keep persistence rules explicit.
- [ ] Remove stale or misleading public exports discovered during refactor.

Validation:
- `npm run check`
- `npm run build`

---

## Stage 7 — Dead code and public API cleanup

Goal: remove leftovers after structural refactor.

- [ ] Re-scan for unused exports/imports after decomposition.
- [ ] Remove dead helpers and stale compatibility code.
- [ ] Minimize public exports to only what is used.
- [ ] Re-check naming quality, typos, and legacy asset references.
- [ ] Update README and technical docs to reflect the final structure.

Validation:
- `npm run check`
- `npm run build`

---

## Discovered during execution

Add new findings here during implementation.

- None yet.

---

## Progress log

- 2026-03-23: Initial execution plan created from project audit. No implementation stages completed yet.
