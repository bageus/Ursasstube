# Telegram Mini Apps Analytics integration

## Required frontend variables (Vercel / Vite build env)

Set these in the frontend project environment variables (for this repo on Vercel):

- `VITE_TG_ANALYTICS_ENABLED=true`
- `VITE_TG_ANALYTICS_TOKEN=<your Telegram analytics token>`
- `VITE_TG_ANALYTICS_APP_NAME=ursass_tube`

Example values are provided in `.env.example`. Real tokens must not be stored in git.

## Security & privacy

The analytics wrapper removes private keys from event payloads before sending:

- `telegramUserId`, `userId`, `username`, `firstName`, `lastName`
- `phone`, `email`
- `wallet`, `walletAddress`, `address`
- `initData`, `rawInitData`
- `commentText`, `messageText`

Do not send personal data in custom events.

## Initialization behavior

- SDK init is called in `js/main.js` during bootstrap, before feature bootstrap.
- If `VITE_TG_ANALYTICS_ENABLED !== 'true'`, analytics is fully disabled.
- If token/appName are missing, init is skipped gracefully.
- Any SDK error is caught and does not break app startup.

## Tracked events

Current integration sends:

- `app_opened`
- `game_start`
- `game_end`
- `run_started`
- `run_finished`
- `second_run_started`
- `leaderboard_opened`
- `wallet_connect_started`
- `wallet_connect_success`
- `wallet_connect_failed`
- `donation_started`
- `donation_success`
- `donation_failed`
- `share_clicked` (bridge alias for `share_result_clicked` and `share_intent_opened`)
- `upload_opened`

## Dev debugging

In `import.meta.env.DEV` only:

```js
window.__tgAnalyticsDebug = {
  enabled,
  initialized,
  appName,
  trackTelegramEvent
};
```

Use browser console to verify enabled/initialized and fire test events.

## How to validate in Telegram WebView

1. Open Mini App inside Telegram.
2. Ensure frontend env variables are set in Vercel and deployment is rebuilt.
3. Open DevTools (remote debugging for mobile if needed).
4. Check console logs prefixed with `[tg-analytics]` in DEV.
5. In Network tab, filter requests by analytics endpoint domain used by SDK.
6. Trigger flows (open app, start run, finish run, share result, donation, wallet connect).
7. Verify payloads contain only allowed fields (no PII keys listed above).
