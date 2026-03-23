# Refactor plan

This file is our working plan for safe refactoring with minimal regression risk.

## Goals

1. Reduce hidden coupling between gameplay logic and UI DOM.
2. Split oversized modules gradually, without changing game behavior.
3. Keep every step small, testable, and reversible.

## Rules of work

- Prefer small refactors over large rewrites.
- Do not change gameplay tuning and rendering behavior unless explicitly planned.
- After every step, run `npm run check` and `npm run build`.
- If a refactor increases risk, stop and validate before continuing.

## Roadmap

### Step 1 — Centralize shared DOM references

Status: completed

Scope:
- move frequently reused DOM nodes into the shared `DOM` map;
- replace scattered `document.getElementById(...)` calls in safe UI/screen-control paths;
- do not alter runtime behavior.

Why first:
- very low risk;
- reduces duplication;
- makes future module splitting easier.

Files:
- `js/state.js`
- `js/game.js`
- `js/ui.js`
- `js/store.js`

Validation:
- `npm run check`
- `npm run build`

### Step 2 — Extract screen visibility/controller helpers

Status: completed

Scope:
- move menu/store/game-over/rules visibility toggles into a dedicated module;
- keep existing CSS classes and DOM ids unchanged.

### Step 3 — Extract game bootstrap/runtime subscriptions

Status: completed

Scope:
- separate initialization, event subscriptions, and periodic timers from core game flow.

### Step 4 — Remove remaining string-based modal rendering

Status: completed

Scope:
- replace `innerHTML` overlay composition with DOM node builders where practical.

### Step 5 — Move external CDN runtime imports under Vite dependency control

Status: completed

Scope:
- migrate runtime CDN imports to package-managed dependencies;
- verify auth and wallet flows after migration.

Files:
- `index.html`
- `js/auth.js`
- `js/walletconnect.js`

Validation:
- `npm run check`
- `npm run build`
