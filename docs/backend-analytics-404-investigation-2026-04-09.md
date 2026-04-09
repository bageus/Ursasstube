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
