# ES Modules + Vite migration audit (2026-03-19)

## Verdict

Migration is **functionally complete**:

- project is configured as ESM (`"type": "module"`);
- dev/build/preview scripts run through Vite;
- HTML bootstraps app via `<script type="module" src="./js/main.js">`;
- JS files in `js/` use module exports/imports (no CommonJS usage detected);
- repository checks pass (`npm run check`);
- production build succeeds (`npm run build`).

## Remaining attention point

`vite build` reports one unresolved CSS reference at build time:

- `css/style.css` uses `url('../img/icon_atlas.webp?v=2')`.
- Vite leaves it unchanged for runtime resolution.

This is not a hard build failure, but after deployment you should open DevTools → Network and confirm `icon_atlas.webp?v=2` loads with HTTP 200 from the exact production URL/path where the app is hosted (no 404 and no broken icons).

## Production validation checklist (2-minute smoke test)

1. Open the deployed app URL in Chrome/Edge.
2. Open DevTools (`F12`) → **Network**.
3. Enable **Disable cache** and refresh (`Ctrl/Cmd+Shift+R`).
4. In Network filter, type `icon_atlas.webp`.
5. Confirm request URL points to your real deployed host/path (not localhost).
6. Confirm status is **200 OK**.
7. Open the request and verify `Content-Type` is image/webp (or valid image mime).
8. Visually confirm icons that use `.icon-atlas` render correctly in UI.
9. Repeat once on mobile viewport (or a real mobile device) to rule out path/base edge cases.

If any request is 404/403 or icons are broken, fix the CSS URL path strategy (or base/public path config) before release.

## Commands used

- `npm install`
- `npm run check`
- `npm run build`
- `rg -n "require\(|module\.exports|exports\." js scripts`
- `python` one-off scan for import/export presence in `js/*.js`
