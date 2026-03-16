# Security review (client-side) for bageus.github.io

## Scope
- Static front-end code in this repository (`index.html`, `js/*`).
- Black-box backend/API behavior is out of scope; findings below include trust-boundary risks observed from frontend usage.

## High-risk findings

### 1) DOM XSS via leaderboard `displayName` (fixed)
**Where:** `js/ui.js` (`displayLeaderboard`) used backend-provided `entry.displayName` in `innerHTML` without escaping.

**Impact:**
- An attacker controlling `displayName` (e.g., via backend poisoning, weak validation, or account profile data) could execute arbitrary JavaScript in other players’ browsers.
- Could steal session context, manipulate game UI, auto-trigger wallet prompts, or phish signatures.

**Fix applied:**
- Added centralized `escapeHtml` helper (`js/security.js`).
- Escaped all leaderboard name render paths before interpolation into HTML.

---

### 2) DOM XSS / injection in auth-linked profile blocks (fixed)
**Where:** `js/auth.js` (`updateAuthUI`) rendered linked Telegram/wallet identity strings inside `innerHTML`.

**Impact:**
- Malicious `telegramUsername`/`wallet` values from backend could inject HTML/JS into wallet info panel.

**Fix applied:**
- Escaped `walletShort` and `tgDisplay` with `escapeHtml` prior to rendering.

---

### 3) Injection risk in Telegram-link modal fields (fixed)
**Where:** `js/auth.js` (`linkTelegram`) interpolated `data.code` and `data.botUsername` directly in modal HTML and links.

**Impact:**
- If backend response is tampered or weakly validated, attacker could inject script/HTML or malformed `t.me` links.

**Fix applied:**
- Escape verification code text with `escapeHtml`.
- Validate/sanitize bot username with strict Telegram handle regex (`sanitizeTelegramHandle`).
- Build bot URL with `encodeURIComponent`.

## Medium-risk hardening gaps (not yet fixed in this patch)

### 4) Third-party script supply-chain risk
**Where:** `index.html` loads scripts from CDNs (`telegram.org`, `cdnjs`, `unpkg`) without Subresource Integrity hashes.

**Risk:**
- If CDN content is compromised, malicious code executes in all clients.

**Recommendation:**
- Pin exact versions and add `integrity` + `crossorigin="anonymous"` where possible.
- Prefer self-hosting critical dependencies for deterministic builds.

### 5) Missing restrictive CSP
**Where:** `index.html` currently relies on inline scripts and inline handlers.

**Risk:**
- Any XSS bug has maximal impact.

**Recommendation:**
- Migrate away from inline scripts/`onclick` handlers.
- Add CSP (`script-src 'self' ...`) with nonces/hashes; block `unsafe-inline` after migration.

## Backend-side validations to ensure
Even with frontend hardening, backend must enforce:
- Strict schema/length constraints for all display fields (username/displayName/wallet).
- Signature verification with anti-replay protections (timestamp window + nonce).
- Never trusting client-provided score/coins without server-side validation/anti-cheat controls.
