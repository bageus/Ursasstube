# Analytics 404 investigation (2026-04-09)

## Symptom

Browser console shows:

- `POST https://bageus-github-io.vercel.app/api/analytics/events 404 (Not Found)`

## Verified backend state (`bageus/URSASS_Backend`)

From `main` branch on GitHub:

1. `app.js` mounts analytics routes:
   - `app.use('/api/analytics', analyticsRoutes);`
2. `routes/analytics.js` defines:
   - `POST /events`
   - `POST /event`
3. CORS allowlist includes frontend origin:
   - `https://bageus-github-io.vercel.app`
4. Backend README explicitly states:
   - frontend origin is allowed
   - requests must target backend host, not frontend host.

## Root cause

The 404 shown above is returned by the **frontend host** (`bageus-github-io.vercel.app`) because it does not serve `/api/analytics/events`.

So this specific error is not caused by missing route in backend codebase.

## Update for `ERR_BLOCKED_BY_CLIENT`

If browser now reports:

- `POST https://ursassbackend-production.up.railway.app/api/analytics/events net::ERR_BLOCKED_BY_CLIENT`

that is a client-side blocker (ad/privacy extension) pattern match, usually on path keywords like `analytics`.

### Backend change required to avoid blocker patterns

Expose a neutral alias endpoint without `analytics` in URL, for example:

- `POST /api/telemetry/events` (primary)
- keep `POST /api/analytics/events` only for backward compatibility.

Frontend is switched to `/api/telemetry/events` by default and can be overridden via:

- `window.__URSASS_ANALYTICS_ENDPOINT__ = 'https://.../api/telemetry/events'`

## When backend really needs a fix

If production backend is deployed from an older revision (without analytics routing), then update deployment to include:

- `routes/analytics.js`
- mounting in `app.js` for `/api/analytics` (and optional `/api/v1/analytics`)
- `models/AnalyticsEvent.js` used by the route.

## Backend verification checklist

Run these checks against the deployed backend host:

1. `GET /health` returns 200.
2. `POST /api/analytics/events` with valid payload returns 202.
3. Server logs include no `CORS blocked` for your frontend origin.
4. Database receives new `AnalyticsEvent` documents.

Example payload:

```json
{
  "sentAt": 1712664000000,
  "events": [
    {
      "name": "game_start",
      "timestamp": 1712664000000,
      "payload": {
        "mode": "default"
      }
    }
  ]
}
```
