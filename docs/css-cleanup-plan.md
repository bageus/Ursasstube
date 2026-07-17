# CSS cleanup extraction plan

Parent issues: #1788, #1791

## Current state

`css/style.css` is still the main UI stylesheet. The Phase 2 inventory report (`npm run report:css-sections`) now provides a repeatable way to identify large sections before each extraction.

The existing stylesheet already has coarse section markers, including:

- `TOKENS / BASE`
- `UI BUTTON SYSTEM`
- `WALLET CORNER`
- `BACKGROUND`
- `HERO / BEAR`
- `TITLE / BUTTONS`
- `LEADERBOARD`
- `GAME START`
- `GAME CONTAINER`
- `GAME HUD`
- `IN-GAME AUDIO`
- `GAME OVER`
- `STORE`
- `DARK SCREEN`
- `FOOTER RULES LINK`
- `RULES OVERLAY`
- `GAME OVER AUDIO NAV`
- `ANIMATIONS`
- `RESPONSIVE`

## Target structure

Keep `css/style.css` as the import/compatibility entrypoint while extracting sections into feature files.

Proposed order:

1. `css/base.css`
   - tokens, reset, body/root rules, shared utilities, button system.
   - Lowest runtime risk because these are common primitives and must stay loaded first.

2. `css/start-screen.css`
   - background, hero/bear, title/buttons, start leaderboard, start transition rules.
   - Highest visual sensitivity; extract only after base imports are stable.

3. `css/gameplay.css`
   - game container, wrapper, canvas, HUD, in-game audio.
   - Must preserve Telegram/mobile canvas sizing and safe-area behavior.

4. `css/game-over.css`
   - game over screen, restart/share/menu buttons, game-over leaderboard, game-over audio nav.

5. `css/store.css`
   - store overlay, tiers, donation cards, fixed nav.

6. `css/rules.css`
   - footer rules link and rules overlay.

7. `css/responsive.css`
   - keep responsive overrides last until each feature file owns its media queries.
   - Later passes can move feature-specific media queries next to their feature styles.

## Extraction rules

- One PR should extract one section or one tightly related group only.
- Do not change selectors, declarations, order, or specificity during a pure extraction PR.
- Preserve cascade order by importing extracted files from `css/style.css` in the same order as the original sections.
- Avoid moving Telegram/mobile media rules until the matching base feature block has already been extracted.
- Do not touch `js/telegram-analytics.js`, runtime SDK loading, or Telegram analytics diagnostics during Phase 2 CSS work.
- After every extraction, run:
  - `npm run report:css-sections`
  - `npm run check`

## QA checklist

For every extraction PR, verify:

- Web main menu: bear, title, start button, store button, leaderboard and wallet corner remain aligned.
- Telegram Mini App menu: no wallet connect button, safe-area top/bottom still correct, title/buttons are not shifted.
- Gameplay: canvas fills the viewport, HUD counters stay in corners, in-game audio buttons remain reachable.
- Game over: score, coins, restart/share/menu buttons, leaderboard and audio nav still match the current layout.
- Store: tiers, donation cards and fixed nav remain scrollable and usable on mobile.
- Rules overlay: back/audio nav, content width and scroll behavior remain stable.

## First recommended extraction

Start with `css/base.css` because it can be validated mechanically:

- move `TOKENS / BASE`, naming convention, `UI BUTTON SYSTEM`, reset, `[hidden]`, `html`, `body`, and shared Telegram wallet hide rules;
- keep the import at the top of `css/style.css`;
- do not change declaration content.

After that, split `start-screen.css` in smaller chunks:

1. `BACKGROUND` + shared animations used only by the menu background.
2. `HERO / BEAR`.
3. `TITLE / BUTTONS`.
4. `LEADERBOARD` if still menu-specific enough, otherwise defer until leaderboard ownership is clearer.
