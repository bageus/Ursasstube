# URSASS TUBE

Arcade endless-runner game optimized for browser and Telegram Mini App.

## Local run

Because the app uses relative paths for assets and scripts, run it via a local static server (not `file://`).

### Option 1: Python

```bash
python3 -m http.server 8080
```

Open: `http://localhost:8080`

### Option 2: Node (if installed)

```bash
npx serve .
```

## Configuration

Main runtime config is in `js/config.js`.

By default, the app uses built-in values, but you can override them at runtime by setting `window.__APP_CONFIG` **before** loading game scripts:

```html
<script>
  window.__APP_CONFIG = {
    backendUrl: 'https://your-api.example.com',
    walletConnectProjectId: 'your_walletconnect_project_id',
    debug: false
  };
</script>
```

- `backendUrl` — backend API base URL override.
- `walletConnectProjectId` — WalletConnect v2 project id override.
- `debug` — toggles debug logs in browser console.

## Project structure

- `index.html` — entry point and all game screens/layout.
- `css/style.css` — global styles and screen styling.
- `js/config.js` — constants and gameplay config.
- `js/state.js` — global state and cached DOM refs.
- `js/assets.js` — sprite and asset loading.
- `js/audio.js` — music/SFX logic.
- `js/input.js` — keyboard/touch controls.
- `js/renderer.js` — canvas drawing.
- `js/physics.js` — movement/collisions/game mechanics.
- `js/game.js` — game loop and lifecycle.
- `js/api.js` — leaderboard/wallet-related API calls.
- `js/auth.js` — wallet/Telegram auth and account linking.
- `js/store.js` — shop and upgrades.
- `js/walletconnect.js` — WalletConnect integration fallback.
- `assets/`, `img/` — textures, icons, sound assets.

## Notes

- The app supports both browser wallet auth and Telegram Mini App auth.
- Script load order in `index.html` is currently important.

main
https://github.com/bageus/bageus.github.io/blob/main/index.html
js
https://github.com/bageus/bageus.github.io/blob/main/js/api.js
https://github.com/bageus/bageus.github.io/blob/main/js/assets.js
https://github.com/bageus/bageus.github.io/blob/main/js/audio.js
https://github.com/bageus/bageus.github.io/blob/main/js/auth.js
https://github.com/bageus/bageus.github.io/blob/main/js/config.js
https://github.com/bageus/bageus.github.io/blob/main/js/game.js
https://github.com/bageus/bageus.github.io/blob/main/js/input.js
https://github.com/bageus/bageus.github.io/blob/main/js/particles.js
https://github.com/bageus/bageus.github.io/blob/main/js/perf.js
https://github.com/bageus/bageus.github.io/blob/main/js/physics.js
https://github.com/bageus/bageus.github.io/blob/main/js/renderer.js
https://github.com/bageus/bageus.github.io/blob/main/js/ui.js
https://github.com/bageus/bageus.github.io/blob/main/js/state.js
https://github.com/bageus/bageus.github.io/blob/main/js/store.js
https://github.com/bageus/bageus.github.io/blob/main/js/walletconnect.js

css
https://github.com/bageus/bageus.github.io/blob/main/css/style.css
