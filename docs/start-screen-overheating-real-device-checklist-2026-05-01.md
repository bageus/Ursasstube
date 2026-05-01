# Start-screen overheating — Real-device Telegram checklist (2026-05-01)

## Goal
Confirm that menu/game-over screens stay lightweight on real mobile devices inside Telegram Mini App after deferred Phaser lifecycle changes.

## Devices (minimum matrix)

- iOS: iPhone 12/13+ (latest Telegram + latest iOS)
- Android: mid-tier Snapdragon (Android 12+) and one low-tier device (Android Go / 4GB RAM)

## Build and runtime

- Production build (`npm run build`) served over HTTPS
- Telegram Mini App context only (not standalone browser)

## Test script

1. Cold open Mini App -> stay on Start Menu for 60s
2. Press `Start Game` -> wait for transition/preload -> play 15–30s
3. Trigger Game Over -> stay on Game Over for 60s
4. Return to Menu -> stay 60s
5. Repeat steps 2–4 three times

## Measurements to capture

- Device temperature trend (qualitative: cool / warm / hot)
- FPS overlay/telemetry if available
- Jank / stutter events on menu and game-over
- Battery drain estimate (5-min session)
- Any watchdog/background throttling signs

## Pass criteria

- No sustained heating on Start Menu / Game Over / Menu idle windows
- Gameplay enters at normal responsiveness after Start
- No progressive degradation across 3 loops
- No crashes / WebView restarts

## Report template

- Device:
- OS / Telegram version:
- Build hash:
- Menu 60s result:
- Game Over 60s result:
- Menu-after-GO 60s result:
- Loop stability (x3):
- Notes / screenshots / logs:
