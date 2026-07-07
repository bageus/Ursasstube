# URSASS Tube roadmap and task tracker

Updated: 2026-07-07

This document tracks the active Telegram/startup/gameplay roadmap after the recent freeze fixes and startup-performance work.

## Current status

### Gameplay stability

- Done: Telegram gameplay canvas freeze was traced to adaptive quality disabling live render when FPS dropped to `low`.
- Done: `#1723` keeps live gameplay rendering enabled in Telegram while still allowing adaptive quality to degrade visual load.
- Done: renderer visibility, resize, and Canvas-mode experiments were merged before the root cause was confirmed. Keep them under observation; consider reverting Canvas-only mode only if it causes measurable FPS or visual regressions.
- No open PRs remain for the freeze path.

### Startup and performance work merged to `main`

- Done: `#1726` moves Phaser prewarm off the startup critical path.
- Done: `#1729` lazy-loads the WalletConnect provider.
- Done: `#1732` defers `icon_atlas` out of the blocking critical asset manifest.
- Done: `#1733` lazy-loads the PostHog integration module.
- Done: `#1735` defers Telegram analytics initialization until idle.

### Branch propagation

- Done: WalletConnect lazy-load was mirrored through `dev2` and then propagated to `prod` earlier in the sequence.
- Done: the later startup/perf changes were mirrored to `dev2` via follow-up PRs.
- Pending: run a smoke check and decide whether to promote the latest `dev2` state to `prod` after QA.

## Active QA checklist

### Telegram gameplay

- Verify a full run on the device that reproduced the freeze after FPS goes red/low.
- Confirm tunnel visuals continue updating after 3, 10, and 30 seconds.
- Confirm score, obstacles, bonuses, coins, and collision feedback stay in sync with the visible tunnel.
- Watch for any performance or visual regression from forcing Phaser Canvas renderer in Telegram.

### Telegram startup

- Compare startup telemetry before and after the merged startup work.
- Use `window.__URSASS_STARTUP_PERF__?.getSnapshot()` during QA to inspect milestones.
- Check `app_shell_ready_ms`, `assets_ready_ms`, `renderer_ready_ms`, `renderer_prewarmed_ms`, and tap-to-first-frame values.
- Verify Start Game still works if tapped immediately after menu appears, before renderer prewarm completes.

### Auth and analytics

- Verify injected wallet auth still works in browser.
- Verify WalletConnect still opens and signs only when user explicitly starts WalletConnect flow.
- Verify PostHog events still arrive after lazy module load.
- Verify Telegram analytics still initializes after idle and receives allowed bridged events.

### UI fixes from the Telegram pass

- Verify rides recharge timer no longer overlaps the Start Game button.
- Verify leaderboard overlay audio toggles stay in sync.
- Verify Telegram lockscreen/music widget is not shown for menu soundtrack playback.
- Verify app icon/favicon/manifest artwork displays the app icon rather than atlas artwork.

## Backlog / next tasks

### P0 - release safety

1. Run Telegram smoke QA on the latest `main` and `dev2`.
2. Promote the latest verified `dev2` to `prod` only after the freeze and startup checks pass.
3. If Canvas renderer in Telegram reduces FPS or visual quality, test reverting the Canvas-only renderer now that the root cause is fixed by `#1723`.

### P1 - startup path cleanup

1. Move leaderboard preload to idle/background so it does not compete with first menu interactivity.
2. Add explicit startup telemetry milestones for leaderboard states: queued, loading, rendered, failed.
3. Skip Telegram menu music preload entirely when Telegram media policy suppresses music playback.
4. Consider lazy-loading the Telegram analytics module itself, not only deferring its init call.
5. Review SFX preload volume: keep critical tap/gameplay SFX early, defer less-used SFX until idle or first use.

### P1 - observability

1. Add a lightweight render watchdog metric: last gameplay render timestamp, last simulation timestamp, and whether `heavyRenderEnabled` is true.
2. Report adaptive quality transitions with runtime, FPS, render quality, and live-render state.
3. Add a single debug panel command or console helper for QA snapshots.

### P2 - cleanup

1. Remove or document experimental freeze mitigations that are no longer needed.
2. Consolidate duplicate Telegram runtime detection helpers.
3. Clean up old agent branches after merged PRs are verified in `prod`.
4. Avoid reusing damaged/obsolete agent branches; create fresh branches from current `main` for new work.

## Known deferred item

A small task to skip Telegram menu music preload was investigated. The intended change is to remove `originalPreloadMenuMusic()` from the Telegram media policy override in `js/app-metadata.js`, because music playback is suppressed there anyway. The attempted branch write was blocked before a PR was opened, so this task remains open and should be redone cleanly from current `main`.
