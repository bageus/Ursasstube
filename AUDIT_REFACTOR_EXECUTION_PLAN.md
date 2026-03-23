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

- [ ] Add ESLint or another stricter static analysis layer suitable for the current JS/Vite setup.
- [ ] Define a minimal rule set that catches unused exports/imports, accidental globals, and oversized files.
- [ ] Document the standard validation sequence for all future stages.
- [ ] Record current large-module hotspots and treat them as primary decomposition targets.

Validation:
- `npm run check`
- `npm run build`

---

## Stage 1 — Lifecycle consolidation

Goal: remove duplicated global subscriptions and centralize runtime lifecycle ownership.

- [ ] Inventory all global listeners, timers, and bootstrap side effects.
- [ ] Move ownership of resize, visibility, Telegram viewport, MetaMask, and ping timers into one lifecycle controller.
- [ ] Remove duplicate resize subscriptions.
- [ ] Add explicit cleanup/unsubscribe paths where possible.
- [ ] Verify that boot still happens exactly once.

Blocking notes:
- `renderer.js`, `game-runtime.js`, and `game.js` currently share lifecycle responsibilities.

Validation:
- `npm run check`
- `npm run build`

---

## Stage 2 — Remove global side effects and hidden coupling

Goal: make modules more explicit and predictable.

- [ ] Remove unnecessary `Object.assign(window, ...)` exports.
- [ ] Replace implicit global access patterns with explicit imports.
- [ ] Stop overriding `console.*` globally; keep logging explicit.
- [ ] Reduce import-time side effects where feasible.
- [ ] Re-check whether any debug globals are still truly required.

Blocking notes:
- `logger.js`, `request.js`, `assets.js`, and `particles.js` currently expose globals or mutate runtime globally.

Validation:
- `npm run check`
- `npm run build`

---

## Stage 3 — DOM safety and rendering hygiene

Goal: remove remaining unsafe or inconsistent rendering paths.

- [ ] Remove or isolate unsafe `innerHTML` helper usage.
- [ ] Replace string-built leaderboard skeleton rendering with DOM node construction.
- [ ] Standardize DOM access so repeated `document.getElementById(...)` usage is reduced in shared flows.
- [ ] Keep UI rendering helpers small and DOM-safe.

Blocking notes:
- `dom-render.js` still supports raw HTML injection.
- `ui.js` still uses HTML strings for skeleton rendering.

Validation:
- `npm run check`
- `npm run build`

---

## Stage 4 — Split `store.js`

Goal: decompose the highest-risk module first.

- [ ] Extract runtime config logic into a dedicated module.
- [ ] Extract rides logic into a dedicated module.
- [ ] Extract upgrades/balance loading into a dedicated module.
- [ ] Extract donation UI state and rendering into dedicated modules.
- [ ] Extract store bootstrap/screen wiring into a dedicated module.
- [ ] Reduce `store.js` to orchestration or remove it entirely if decomposition is complete.

Suggested target structure:
- `js/store/runtime-config.js`
- `js/store/rides-service.js`
- `js/store/upgrades-service.js`
- `js/store/donation-ui.js`
- `js/store/store-ui.js`
- `js/store/bootstrap.js`

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
