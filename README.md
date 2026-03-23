# bageus.github.io

## Development

The project boots through a Vite ES-module entrypoint (`js/main.js`).

Core game/platform modules are loaded directly as ESM, including the main game loop module (`js/game.js`).

```bash
npm install
npm run dev
```

### Visual-only mode (backend disabled)

To test only the frontend visuals without backend auth / leaderboard / store requests, open the app with `?backend=off`, for example:

```
http://localhost:5173/?renderer=phaser&backend=off
```

This forces an offline unauth config, hides leaderboard persistence, disables wallet auth, and keeps the run loop available for visual checks.

## Build

```bash
npm run build
npm run preview
```

## Validation

```bash
npm run check
```

## Performance notes

- The main steady-state FPS cost is still the tube renderer in `js/renderer.js`: it rebuilds the tunnel from many canvas quads every frame and adds several extra fill/stroke passes for bevel, shadow, and glow.
- Render diagnostics are no longer based on quad count alone. `gameState.debugStats` now tracks both render counts (`q`, estimated tube passes `p`, visible O/B/C/T objects) and per-frame timings (`tubeMs`, `drawMs`, `updateMs`, `uiMs`, `frameMs`).
- If `Renderq` stays flat while FPS drops, treat the timing breakdown as the source of truth: stable geometry with higher `frameMs` usually means the cost moved into draw, update, UI, or extra tube passes rather than raw quad count.
- `TubeRenderer` now measures its own execution time and reuses depth-level bevel/shadow style strings instead of rebuilding identical `rgba(...)` values inside the hot loop.
- The tube renderer still caches segment trigonometry per frame so the game keeps the same visual output while avoiding repeated `Math.sin`/`Math.cos` calls across all depth layers.
- Converting assets from PNG to WebP can still help with download size and memory pressure, but it usually does not solve gameplay FPS by itself after assets are already loaded.

## ES modules + Vite migration backlog

Current status: migration is complete — the app runs via Vite and ESM entrypoint, runtime static assets live in `public/` (`public/assets`, `public/img`), the legacy `window.process` shim is removed, stylesheet loading goes through module graph (`js/main.js` imports `css/style.css`), and Vite config is simplified (no runtime static copy plugin).

### 1) ✅ Move runtime-static assets under `public/` (or import from JS)

Completed: runtime static directories were moved from repository root to Vite `public/` (`public/assets`, `public/img`), so existing runtime URLs (`assets/...`, `img/...`) now resolve through Vite-native static handling.

Follow-up (optional) for deeper Vite graph ownership:
- `img/...` and `assets/...` strings in JS modules (`audio.js`, `assets.js`, `game.js`, `stabilize-menu.js`, etc.).
- inline HTML references in `index.html` and `innerHTML` templates (`auth.js`, `store.js`).

Why: this allows dropping the custom copy plugin from `vite.config.js`, and makes cache-busting deterministic in production builds.

### 2) ✅ Remove legacy `window.process` shim from `index.html`

Completed: removed inline `window.process` shim from `index.html`. No replacement/polyfill is currently required by runtime dependencies.

### 3) ✅ Consolidate external script loading strategy

Completed (chosen strategy): keep `telegram-web-app.js` as a static external `<script ... defer>` in `index.html` and treat it as an intentional runtime dependency for Telegram Mini App environment.

Why this is acceptable right now:
- Telegram usage in app code is guarded by runtime checks (`window.Telegram && window.Telegram.WebApp`) before access.
- This keeps bootstrap predictable without adding an extra loader layer.

### 4) ✅ Migrate stylesheet loading to module graph (optional)

Completed: removed HTML `<link rel="stylesheet" ...>` and imported `css/style.css` from `js/main.js` for Vite graph ownership.

### 5) ✅ Replace `innerHTML` icon/image snippets with DOM-safe render helpers

Completed: introduced shared DOM render helpers (`js/dom-render.js`) and replaced dynamic icon/image HTML snippets in key runtime UI paths (`store.js`, `auth.js`, `ui.js`) with element-based rendering (`createElement` + `textContent`/`append`). This removes string-templated icon/image markup from those flows and keeps dynamic UI updates DOM-safe.

### 6) ✅ After asset migration, simplify Vite config

Completed: removed `copy-runtime-static-assets` plugin from `vite.config.js` because runtime-static directories are now served from `public/`.

Validation: `npm run build` succeeds and production output works without manual post-build copying.
