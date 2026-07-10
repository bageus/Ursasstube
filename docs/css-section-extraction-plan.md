# CSS section extraction plan

Issue: #1788
Roadmap: #1791

## Goal

Split `css/style.css` into smaller feature stylesheets without changing UI behavior. Keep each extraction PR small and keep `npm run check` green.

## Current map

`css/style.css` is organized by comment sections:

- `TOKENS / BASE`: design tokens, reset, base body styles.
- `WALLET CORNER`: wallet corner and compact wallet info.
- `BACKGROUND`: star backgrounds and related visuals.
- `HERO / BEAR`: start-screen bear layers and light effects.
- `TITLE / BUTTONS`: start title, menu buttons, start button, store icon visuals.
- `LEADERBOARD`: leaderboard panel, rows, ranks, skeleton state.
- `GAME START`: start screen layout and launch transition.
- `GAME CONTAINER`: canvas/runtime container.
- `GAME HUD`: runtime HUD zones.
- `GAME OVER`: game-over overlay, score, hook, buttons, leaderboard wrap.
- `STORE`: store screen, nav, cards, coins.
- `DARK SCREEN`: transition screen and crash flyer.
- `FOOTER`: footer links and social/legal links.
- `RULES OVERLAY`: rules screen and controls.
- `GAME OVER AUDIO NAV`: game-over audio nav.
- `ANIMATIONS`: shared keyframes.
- `RESPONSIVE`: mobile overrides.

## Recommended order

1. Extract `LEADERBOARD` first.
   - Mostly `.lb-*`, `#startLeaderboardWrap`, and `#gameOverLeaderboardList` selectors.
   - Used in start and game-over flows but isolated enough for a small first move.
2. Extract `GAME OVER` plus `GAME OVER AUDIO NAV`.
3. Extract `RULES OVERLAY` plus the footer rules link.
4. Extract `STORE`.
5. Extract `BACKGROUND` only after screen overlays are stable.
6. Extract `HERO / BEAR`, `TITLE / BUTTONS`, and `GAME START` last.
7. Keep `TOKENS / BASE`, `ANIMATIONS`, and `RESPONSIVE` in `style.css` until dependent sections are already split.

## Guardrails

Each extraction PR should:

- move one section only;
- keep CSS load order explicit;
- avoid duplicate selectors across old and new files;
- keep `npm run check` green;
- verify web menu, runtime screen, and mobile layout for the moved section.

## Next implementation PR

Extract `LEADERBOARD` styles into a dedicated stylesheet first.
