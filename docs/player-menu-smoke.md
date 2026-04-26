# Player Menu & Referral UX — Smoke Test Scenarios

## Prerequisites
- Backend endpoints deployed (PR-1 / PR-2 from `bageus/URSASS_Backend`):
  - `GET /api/account/me/profile`
  - `POST /api/referral/track`
  - `POST /api/share/start`
  - `POST /api/share/confirm`
  - `GET /api/x/oauth/start?mode=json`
  - `GET /api/x/oauth/callback`
  - `POST /api/x/disconnect`
  - `GET /api/x/status`

---

## Scenario 1 — Non-authenticated user
**Steps:**
1. Open the game without connecting a wallet or Telegram.

**Expected:**
- `#playerAvatarBtn` is not visible (hidden attribute present). The avatar circle only appears when a wallet is connected — either via wallet-auth session or when a Telegram-auth user has a linked wallet (`linkedWallet` set).
- On Game Over screen, `#shareResultBtn` is hidden.
- No referral tracking occurs even if `?ref=XXXXXXXX` is in URL (code is saved to localStorage but not sent since auth is absent).

---

## Scenario 2 — Telegram auth: player avatar + overlay + profile data
**Steps:**
1. Open via Telegram Mini App (or simulate telegram auth session).
2. After authentication completes:
   - Verify `#playerAvatarBtn` appears in `#walletCorner` — **only if** the Telegram user already has a linked wallet (`linkedWallet` set). Without a linked wallet, the avatar circle remains hidden.
3. Click the avatar button.
4. Player Menu Overlay opens (`#playerMenuOverlay` becomes visible).

**Expected:**
- `#pmRankNumber` shows `#N` (rank from server) or `#—` if no score.
- `#pmBestScore` shows the player's best score.
- `#pmReferralLink` input has the player's referral URL.
- Streak block `#pmStreak` is hidden if `shareStreak === 0`, or shows N 🔥 icons if streak > 0.
- `#pmConnectTelegramBtn` is disabled and shows `@username` if Telegram is connected.
- `#pmConnectXBtn` is visible if X not connected.
- `#pmShareBtn` shows "CONNECT X" class `is-connect-x` if X not connected.
- Back button `#pmBackBtn` closes overlay and returns to main menu.
- The avatar button displays an inline SVG bear-head silhouette (cosmic style) — **not** the legacy `👤` emoji.

---

## Scenario 3 — Copy referral link
**Steps:**
1. Open Player Menu (must be authenticated).
2. Verify `#pmReferralLink` has a URL in format `https://.../?ref=XXXXXXXX`.
3. Click `#pmCopyRefBtn`.

**Expected:**
- Toast notification "✅ Referral link copied!" appears.
- Clipboard contains the referral URL.

---

## Scenario 4 — Share flow with mock 425 (too early retry)
**Steps:**
1. Be authenticated with X connected.
2. Open Player Menu.
3. Click `#pmShareBtn` (shows "SHARE RESULT" or "+N 🪙").
4. Twitter/X intent opens in new tab.
5. Simulate backend returning 425 on first `/api/share/confirm` call (too early).

**Expected:**
- Frontend waits 33+ seconds before first confirm attempt.
- On 425 response, frontend reads `secondsLeft` and retries after `secondsLeft + 1` seconds.
- When confirm succeeds with `awarded: true`, toast "+N 🪙 gold earned for sharing!" appears.
- Profile is refreshed in the overlay.

---

## Scenario 5 — X Connect flow
**Steps:**
1. Open Player Menu (auth, but no X connected).
2. Click `#pmConnectXBtn` or `#pmShareBtn` (which shows "CONNECT X").
3. Authorize URL opens (X OAuth).
4. Return to app tab.

**Expected:**
- If URL has `?x=connected&username=alice`:
  - Toast "✅ X connected as @alice!" appears.
  - `?x=connected` removed from URL.
  - `#pmConnectXBtn` hidden, `#pmXConnected` visible with `@alice`.
  - `#pmShareBtn` updates to show share state.
- If URL has `?x=error&reason=access_denied`:
  - Toast "❌ X connect failed: access_denied" appears.

---

## Scenario 6 — X Disconnect (hover / long-press)
**Steps:**
1. X is connected, `#pmXConnected` shows `@username`.
2. **Desktop**: hover over `#pmXConnected`.
3. **Mobile**: press and hold on `#pmXConnected` for 600ms.

**Expected:**
- `#pmXDisconnectBtn` appears.
- Click `#pmXDisconnectBtn` → `POST /api/x/disconnect` called.
- Toast "✅ X disconnected."
- `#pmXConnected` hidden, `#pmConnectXBtn` shown.

---

## Scenario 7 — Referral capture: `?ref=ABC123XY`
**Steps:**
1. Open game URL with `?ref=ABC123XY` (8 uppercase alphanumeric chars).
2. Observe URL immediately.
3. Authenticate (wallet or Telegram).

**Expected:**
1. On page load (before auth): `localStorage.getItem('ursas_ref')` equals `'ABC123XY'`.
2. `?ref=ABC123XY` is removed from URL (replaceState, no reload).
3. After auth: `POST /api/referral/track {ref: 'ABC123XY'}` is called.
4. On success (or `{already: true}`): `localStorage.getItem('ursas_ref')` is `null`.

**Invalid ref (wrong format):**
- `?ref=short` (< 8 chars) → not saved to localStorage, no tracking.
- `?ref=abc123xy` (lowercase) → normalized to `ABC123XY` before validation.

---

## Scenario 8 — Game Over share button
**Steps:**
1. Play a game and reach Game Over screen.
2. Check `#shareResultBtn`.

**Expected:**
- **Not auth**: button is hidden.
- **Auth, no X**: button shows "CONNECT X", class `is-connect-x`.
- **Auth, X connected, `canShareToday: true`**: button shows "SHARE +N 🪙", class `is-share-rewarded`.
- **Auth, X connected, `canShareToday: false`**: button shows "SHARE RESULT", class `is-share`.

---

## Scenario 9 — Wallet auth without Telegram linked
**Steps:**
1. Connect wallet (wallet auth mode, no Telegram linked).
2. Open `#walletInfo` dropdown.

**Expected:**
- `#walletInfo` shows only stats (rank/best/gold/silver). **No "Telegram not linked" text** is shown on the main page — that information lives exclusively in Player Menu.
- Open Player Menu → `#pmConnectTelegramBtn` is visible and clickable.
- Clicking it opens the Telegram Link Overlay (same as before).

---

## Scenario 10 — Connect Wallet from Player Menu (Telegram auth)
**Steps:**
1. Authenticate via Telegram (no wallet linked).
2. Open Player Menu.

**Expected:**
- `#pmConnectWalletBtn` is visible (because `telegram.connected && !wallet.connected`).
- Clicking it triggers the existing wallet link flow.
- After linking: `#pmConnectWalletBtn` becomes hidden.
