# Start-screen overheating — validation run (2026-05-01)

## Scope
Validation of deferred Phaser init / deferred loop / render gating changes for menu-load reduction.

## Commands executed

1. `npm test`
2. `npm run lint`
3. `npm run build`
4. `npm run test:e2e-smoke`

## Results

- `npm test`: **PASS** (82/82 tests passed).
- `npm run lint`: **PASS** (`check:syntax` + `check:static-analysis`).
- `npm run build`: **PASS** (Vite build successful; non-blocking chunk-size warning present).
- `npm run test:e2e-smoke`: **PASS**.

### MIG-08 synthetic smoke snapshot

- capturedAt: `2026-05-01T10:54:20.267Z`
- sampleCount: `120`
- fpsP50 / fpsP95: `60 / 62`
- frameMsP50 / frameMsP95: `16.67 / 17.24`
- pingMsP50 / pingMsP95: `73 / 76`
- smoke checklist: `6 / 6` complete

## Notes

- This smoke run is synthetic (scripted lifecycle/perf flow), useful as a regression gate.
- Real-device Telegram Mini App thermal/perf verification is still recommended before release.
