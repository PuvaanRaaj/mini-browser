# Changelog

All notable Minimal changes are recorded here. Website and application release
versions come from `package.json`; work that has not shipped is explicitly
marked as unreleased.

## 2.0.0 — Unreleased

### Chromium rewrite

- Started the standalone Chromium distribution while retaining Electron 1.x as
  the working fallback.
- Pinned Chromium 152.0.7977.54 to an exact upstream commit.
- Added deterministic out-of-tree checkout, sync, GN generation, and build
  commands for the macOS and Windows workstreams.
- Added repeated clean-profile release gates for startup, navigation, memory,
  idle CPU, energy, security, and compatibility.
- Extended the market benchmark so the future Minimal Chromium executable is
  measured with the same workload as Chrome and Firefox.
- Shelved the experimental Rust/native-shell rewrite.

### Security, identity, and secrets

- Hardened Electron IPC sender validation, renderer sandboxing, navigation,
  session permissions, and external URL handling.
- Added system-browser OAuth with PKCE for Minimal-owned Google integrations;
  Google website login remains outside the Electron embedded-user-agent path.
- Added WebAuthn account selection and macOS platform-authenticator setup for
  passkeys, with Windows Hello and roaming-key support in the migration plan.
- Moved passwords and TOTP secrets from renderer storage into an asynchronous,
  OS-encrypted main-process vault that fails closed when encryption is absent.
- Added migration of legacy authenticator entries into the secure vault.

### Reliability and delivery

- Prevented malformed ad-block rules from cancelling main-frame navigation.
- Added repeatable cold/warm startup, first-navigation, ten-tab memory, and idle
  CPU benchmarks.
- Corrected the Vercel build runtime and renderer type-check configuration.

## 1.0.0 — Current Electron source version

No signed GitHub release has been published yet.

### Browser experience

- Introduced the Minimal name, ring icon, chromeless window, compact address
  bar, focus mode, keyboard navigation, and a richer animated start page.
- Added side tabs with a hover-expandable icon rail, drag reordering, favicons,
  favorites, favorite editing, per-site zoom, and session settings.
- Added back, forward, reload, new-tab, focus, shield, password, authenticator,
  and settings controls.
- Added dark styling across the application, moving start-page artwork, and the
  optional animated toolbar cats contributed through the Windows UI work.

### Privacy and authentication

- Added EasyList/EasyPrivacy-based blocking and a built-in host blocklist.
- Added a built-in TOTP authenticator with portable JSON and `otpauth://`
  backup import.
- Made website sessions ephemeral by default and added an explicit, off-by-
  default “Stay signed in” option.

### Stability and performance

- Fixed WebContentsView shutdown crashes, dead-tab rendering, blocklist download
  failures, favicon sizing, navigation errors, and WSL2 sandbox compatibility.
- Added bundle budgets, lazy-loaded authenticator UI, cached blocklists, and
  agent-friendly diagnostics.

### Packaging and website

- Added macOS DMG/ZIP packaging, Windows installer and portable targets, release
  automation, Vercel deployment, platform-aware downloads, SEO metadata, and
  the public Apache-2.0 project documentation.
