# CSS split plan

Refs: #1788, #1791.

This plan starts Phase 2 after `report:css-sections` landed. The goal is to split `css/style.css` into smaller feature files while preserving the current cascade and the Telegram/mobile layout.

## Current source of truth

- Primary shared stylesheet: `css/style.css`.
- Web menu/profile override source: `public/css/web-menu-layout.css`.
- App metadata still loads `/css/web-menu-layout.css` for the public override path.

Do not reintroduce a second root-level `css/web-menu-layout.css`.

## Split rules

1. Keep every extraction small and reviewable.
2. Preserve cascade order by replacing a removed section with an import at the same effective position, or by using a loader order that is explicitly covered by tests.
3. Do not mix unrelated sections in one PR.
4. Each extraction PR must include before/after QA notes for:
   - web main menu,
   - player profile/wallet corner,
   - Telegram Mini App menu,
   - mobile viewport.
5. Avoid touching Telegram analytics or runtime SDK files in CSS cleanup PRs.

## Proposed extraction order

1. **Foundation:** `TOKENS / BASE` and `UI BUTTON SYSTEM`.
   - Candidate target: `css/foundation.css`.
   - Reason: variables and shared button primitives are already at the top of `style.css`.
2. **Wallet/profile chrome:** `WALLET CORNER`.
   - Candidate target: `css/wallet-corner.css`.
   - Reason: fixed top-corner UI can be isolated and QAed independently.
3. **Start screen background:** `BACKGROUND` plus non-interactive star layers.
   - Candidate target: `css/start-background.css`.
   - Reason: mostly decorative and stable.
4. **Hero/start menu:** `HERO / BEAR` and `TITLE / BUTTONS`.
   - Candidate target: `css/start-menu.css`.
   - Reason: largest visual risk; do only after foundation/background are separated.
5. **Game-over and overlay screens.**
   - Candidate target: feature-specific files.
   - Reason: screen-scoped selectors should not block menu cleanup.

## PR acceptance checklist

For each extraction PR:

- `npm run check` passes.
- `npm run report:css-sections` still runs.
- No duplicate web layout stylesheet is added.
- No unrelated JavaScript, Telegram analytics, or runtime SDK behavior changes are included.
- Screenshots or manual QA notes cover web + Telegram/mobile layouts.
