# bageus.github.io

## Development

The project boots through a Vite ES-module entrypoint (`js/main.js`).
Legacy game scripts are generated into `js/legacy-app.generated.js` before running dev/build/preview.

Core platform modules are now loaded directly as ESM (`js/logger.js`, `js/config.js`, `js/request.js`, `js/api.js`, `js/security.js`, `js/assets.js`, `js/state.js`, `js/input.js`, `js/audio.js`, `js/particles.js`, `js/perf.js`, `js/walletconnect.js`, `js/ui.js`, `js/store.js`, `js/physics.js`) before the generated legacy compatibility bundle.

The generated compatibility bundle starts with explicit bindings from `window` (for example: `CONFIG`, `BACKEND_URL`, `request`, `escapeHtml`) to keep legacy references stable during migration.

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Legacy bundle generation

```bash
npm run legacy:build
```


## Validation

```bash
npm run check
```
