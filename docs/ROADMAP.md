# Performance and release roadmap

This roadmap keeps the browser fast while making releases predictable. The GitHub `main` branch remains the source of truth; Origin and Vercel consume it.

## 1. Measure before changing behavior

Create a small baseline on a clean Mac and record it for every release:

- cold start to the new-tab field being usable;
- first navigation start and first paint;
- memory after one, five, and ten tabs;
- renderer bundle size and the size of the packaged app;
- time spent loading the guest session, ad blocker, and authenticator extension.

Use Electron's `app.getAppMetrics()`, renderer `performance.mark()` calls, and the Vite build report. Set budgets in CI so a regression is visible before release.

## 2. Speed work

### P0 — low-risk wins

1. Keep first navigation independent of authenticator-extension startup. Install the built-in blocker synchronously, start the extension load in the background, and publish its ready state later.
2. Cache EasyList/EasyPrivacy with a freshness window. Refresh stale lists in the background instead of doing network work on the first navigation.
3. Use suffix lookup in the blocker (`Set` plus hostname labels) rather than scanning every blocked domain for every request.
4. Lazy-load the authenticator panel and its TOTP code. The initial renderer should not pay for a feature that is not open.
5. Update TOTP countdowns once per second, aligned to the next boundary, rather than rendering four times per second.

### P1 — measured improvements

1. Split the renderer into the start/chrome chunk and optional authenticator chunk; fail CI if the initial chunk grows unexpectedly.
2. Reuse the guest session and web contents where safe, and avoid duplicate state broadcasts for unchanged tab metadata.
3. Add a lightweight navigation loading budget and cancel stale navigation work when a tab is closed or replaced.
4. Profile real pages with Chromium tracing before changing ad-blocking rules; blocking must not make normal pages slower.

### P2 — product-level improvements

1. Add an optional disk cache policy while keeping cookies and login state ephemeral.
2. Add tab suspension for background tabs only after measuring memory pressure.
3. Move expensive parsing and future filter transforms off the UI path.

## 3. Release and automatic updates

### Release flow

1. Every user-facing change lands on `main` through a pull request.
2. A release PR or manual release command bumps `package.json` to a new semver version. Do not publish a new installer for an unchanged version.
3. Merging the release PR creates tag `v<version>`.
4. A GitHub Actions release workflow builds the macOS arm64 installer (then x64 if needed), creates a GitHub Release, and uploads the `.dmg`, `.zip`, and `latest-mac.yml`.
5. The landing page's download endpoint reads the newest GitHub Release asset.

A release should be tag-driven, not built on every ordinary `main` push. This avoids users receiving updates for unfinished commits and gives the updater a stable version contract.

### App updater

1. Add `electron-updater` and configure electron-builder's GitHub provider for `PuvaanRaaj/mini-browser`.
2. On startup, check after the first window is usable and no more than once per day. Never block the first paint or first navigation on an update check.
3. Show a small non-modal update notice: **Update available**, **Download**, then **Restart to install**. Keep downloading opt-in and install on quit by default.
4. Send updater state through the existing preload bridge; do not expose Node or arbitrary IPC channels to the renderer.
5. Verify update metadata and artifacts through GitHub plus macOS code-signing checks. Keep the previous version available for rollback.

### Required before enabling production updates

- Apple Developer ID signing and notarization; the current local build intentionally uses `identity: null` and cannot provide a trustworthy production update path.
- A GitHub token stored only in Actions secrets with permission to create releases.
- A tagged-release workflow that uploads both the installer and updater metadata.
- A smoke test that installs version N, publishes N+1, checks the update metadata, downloads it, and restarts successfully.

## 4. Suggested implementation order

1. Land the P0 speed changes and measurement marks.
2. Add the tagged GitHub Actions release workflow with signing placeholders; validate artifacts without publishing updates.
3. Add the updater UI behind a feature flag and test unsigned local builds only as a development flow.
4. Configure signing/notarization secrets and enable production update checks.
5. Add bundle, startup, memory, and update smoke tests to the release gate.

## Definition of done

A release is complete when a clean Mac can install it, start without network access, navigate before optional services finish initializing, receive a signed update from the next GitHub Release, and return to the previous version if installation is interrupted.
