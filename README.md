# bageus.github.io

## Development

The project boots through a Vite ES-module entrypoint (`js/main.js`).

Core game/platform modules are loaded directly as ESM, including the main game loop module (`js/game.js`).

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Validation

```bash
npm run check
```

## ES modules + Vite migration backlog

Current status: the app already runs via Vite and ESM entrypoint, but several runtime/static patterns are still in a pre-Vite style.

### 1) Move runtime-static assets under `public/` (or import from JS)

Remaining hardcoded runtime URLs should be migrated to Vite-native handling:
- `img/...` and `assets/...` strings in JS modules (`audio.js`, `assets.js`, `game.js`, `stabilize-menu.js`, etc.).
- inline HTML references in `index.html` and `innerHTML` templates (`auth.js`, `store.js`).

Why: this allows dropping the custom copy plugin from `vite.config.js`, and makes cache-busting deterministic in production builds.

### 2) Remove legacy `window.process` shim from `index.html`

There is still an inline script that defines `window.process` for Node-like compatibility. Prefer replacing the dependency that needs it, or providing a scoped Vite `define`/polyfill only where required.

### 3) Consolidate external script loading strategy

`telegram-web-app.js` is still loaded via static `<script ... defer>` in `index.html`.

Optional migration target:
- keep as-is but document as an intentional external runtime dependency; or
- load lazily (with explicit readiness checks) from module bootstrap code to make startup behavior fully module-controlled.

### 4) Migrate stylesheet loading to module graph (optional)

`css/style.css` is currently linked from HTML. For full Vite graph ownership, import it from `js/main.js`.

### 5) Replace `innerHTML` icon/image snippets with DOM-safe render helpers

Not strictly required for ESM, but this is a useful migration follow-up because many template fragments embed image paths and inline styles. Centralized render helpers will simplify a later move to imported assets.

### 6) After asset migration, simplify Vite config

When runtime static paths are removed, delete `copy-runtime-static-assets` plugin from `vite.config.js` and verify production output still works.
