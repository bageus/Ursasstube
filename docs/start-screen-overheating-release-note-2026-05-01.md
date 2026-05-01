# Release note — Start-screen overheating mitigation (2026-05-01)

## What changed

- Phaser runtime init is deferred until gameplay start (`Start Game`).
- Main loop startup is deferred from bootstrap to first gameplay run.
- Rendering is gated by active screen (`gameplay` only).
- Renderer teardown is executed on game-over/menu flows.

## Expected user impact

- Lower idle CPU/GPU load on Start Menu.
- Reduced risk of mobile overheating before gameplay starts.
- Preserved gameplay feel (60 FPS target remains unchanged).

## Validation status

- Synthetic checks: PASS (`npm test`, `npm run lint`, `npm run build`, `npm run test:e2e-smoke`).
- Real-device Telegram validation: pending execution per checklist.

## Linked artifacts

- Patch plan: `docs/start-screen-overheating-patch-plan-2026-04-30-ru.md`
- Validation log: `docs/start-screen-overheating-validation-2026-05-01.md`
- Real-device checklist: `docs/start-screen-overheating-real-device-checklist-2026-05-01.md`
