# Minimal current behavior and compatibility contract

- Baseline date: 2026-08-23
- Baseline branch: `codex-rust-rewrite`
- Baseline commit: `b04b346f04f14a28e4d8ef1e82a1af830dfd319e`
- Canonical remote baseline: `github/main` at the same commit

This document records what the Electron implementation actually does at the rewrite baseline. It is a parity and migration contract, not a description of the intended Rust/native implementation. A behavior marked **gap** is current behavior that must not be mistaken for a completed rewrite requirement.

## 1. Baseline provenance

- GitHub PR #1, “Windows build, three crash fixes, and side tabs / favorites / settings,” is merged at this exact commit. The merge added Windows packaging configuration, but not a native Windows shell, native Windows CI, signing, updater, or release workflow.
- The public application identity is `app.minimal.browser`; the product and process-visible name is `Minimal` (`package.json:57-60`, `src/main/index.ts:21-26`, `src/main/index.ts:87-89`). Version is `0.1.0` (`package.json:2-4`).
- The shipped implementation is Electron 43 with a React 19 renderer, Electron main/preload processes, and bundled Chromium (`package.json:15-28`, `package.json:30-55`, `electron.vite.config.ts:7-27`). There is no Rust, Swift/AppKit, WKWebView, Win32, or WebView2 implementation at this baseline.

## 2. User-visible browser behavior

### Window and browser chrome

- One 1280x860 window is created with 720x480 minimum size, initially hidden until Electron emits `ready-to-show` (`src/main/index.ts:28-43`, `src/main/index.ts:66-67`).
- macOS uses `hiddenInset` title-bar chrome and traffic lights at `(16,14)`. Other platforms use a hidden title bar with a 44-pixel white title-bar overlay (`src/main/index.ts:37-43`).
- All browser chrome, including the start page, omnibox, tabs, favorites, settings, and authenticator, is React rendered in the main Electron `BrowserWindow`; navigated pages are separate `WebContentsView` instances (`src/main/index.ts:44-49`, `src/components/mini-app.tsx:22-57`, `src/main/tabs.ts:208-225`). Therefore chrome is not native and depends on the renderer JavaScript runtime.
- The omnibox auto-focuses/selects itself and disables spelling, capitalization, completion, and correction (`src/components/omnibox.tsx:14-21`, `src/components/omnibox.tsx:29-44`). Hostname-like input gets `https://`, localhost/IP gets `http://`, `http`, `https`, `file`, and `about` schemes pass through, and other text becomes a DuckDuckGo query (`src/lib/url.ts:1-17`).

### Tabs and navigation

- Startup creates exactly one selected start-page tab with no page webview. A page engine/view is created lazily on first navigation (`src/main/tabs.ts:38-43`, `src/main/tabs.ts:167-180`, `src/main/tabs.ts:183-225`).
- Commands supported by the shell/core boundary are navigate, back, forward, reload, stop, new tab, close tab, switch tab, and reset session (`src/lib/types.ts:39-48`, `src/main/tabs.ts:68-101`).
- Tabs carry ID, URL, title, loading state, history availability, start-page state, and a main-frame navigation error (`src/lib/types.ts:1-10`, `src/main/tabs.ts:239-268`, `src/main/tabs.ts:357-368`). Closing the last tab creates a new start tab; switching focuses a visible page view (`src/main/tabs.ts:274-293`).
- Page-created HTTP(S) popups become a new selected Minimal tab. Any other popup URL is sent to the operating system with `shell.openExternal`; the original popup is denied (`src/main/tabs.ts:228-238`). **Gap:** there is no allowlist or user-approval gate for external schemes.
- Top and side tab layouts are supported. Start tabs are hidden from the strip unless more than one tab exists (`src/lib/types.ts:12-20`, `src/components/tab-strip.tsx:7-23`, `src/components/tab-strip.tsx:26-73`).
- Main-frame load failures produce a user-facing error state; title, URL, loading, and in-page navigation changes are broadcast to the chrome (`src/main/tabs.ts:239-268`).

### Shortcuts, menus, focus mode, favorites, and settings

- `Cmd` is the modifier on macOS and `Ctrl` elsewhere. Implemented shortcuts are: `L` focus omnibox, `T` new tab, `W` close tab, `R` reload, `Shift+F` focus mode, `,` settings, `D` bookmark toggle, `Shift+B` favorites UI/mode, `Shift+S` side/top tabs, `Shift+A` authenticator, `[`/`]` back/forward; Alt+Left/Right also navigate history (`src/main/tabs.ts:372-439`).
- Native Electron menus expose new/close tab, reset session, reload, focus mode, side tabs, settings, authenticator, favorite toggle/bar, back/forward, open location, fullscreen, and development-only DevTools (`src/main/menu.ts:12-156`).
- Focus mode hides normal chrome. `Cmd/Ctrl+L` opens or focuses the omnibox; Escape closes sheets/omnibox but does not exit focus mode (`src/components/mini-app.tsx:45-57`, `src/components/mini-app.tsx:122-179`, `src/components/mini-app.tsx:181-238`).
- Bookmarks are unique by exact URL and contain ID, URL, title, and creation timestamp. They can be added, removed, toggled, shown in a panel, and displayed always/on hover/never (`src/lib/types.ts:14-27`, `src/lib/bookmarks.ts:37-97`, `src/components/settings-panel.tsx:7-16`, `src/components/settings-panel.tsx:91-106`).
- Session restoration is off by default. When enabled, only non-start-tab URLs are persisted; an untouched single-start-tab window rebuilds them sequentially on launch. Pages reload into a fresh browsing session, so cookies/logins are not restored (`src/lib/settings.ts:7-11`, `src/lib/settings.ts:72-90`, `src/components/mini-app.tsx:92-116`, `src/components/settings-panel.tsx:108-120`).

## 3. Browsing-session and content-blocking contract

- Page webviews share one Electron session created from a randomly named, non-`persist:` partition (`mini-<UUID>`), so Chromium treats it as in-memory. Reset destroys all page views, drops the session reference, rotates the session ID, and recreates a start tab (`src/main/tabs.ts:28-36`, `src/main/tabs.ts:151-165`, `src/main/tabs.ts:295-304`).
- The guest session denies every Electron permission request and strips Electron's token from its user agent (`src/main/tabs.ts:151-156`).
- Page webviews use context isolation and no Node integration. They have no preload script. The sandbox is enabled except on Linux, where both the application-level `no-sandbox` switch and page-view sandbox disablement are used (`src/main/index.ts:10-15`, `src/main/tabs.ts:208-219`).
- A built-in list of host suffixes is active before remote list enrichment. EasyList and EasyPrivacy host-only `||host^` entries are fetched asynchronously, cached as `easylist-hosts.json` in Electron `userData`, and failures retain the built-in list (`src/main/blocklist.ts:1-106`, `src/main/adblock.ts:13-29`, `src/main/adblock.ts:31-75`).
- Every network request calls `hostIsBlocked`, which iterates the complete set until it finds an exact/suffix match (`src/main/adblock.ts:18-25`, `src/main/blocklist.ts:98-105`). **Gap:** this is a full rule scan, not the required indexed blocker.
- Reset does not explicitly call `clearStorageData`; cleanup relies on closing webviews and abandoning an in-memory Electron partition (`src/main/tabs.ts:295-316`).

## 4. Persisted data contracts

All four named product schemas live in the chrome renderer's `localStorage`, which belongs to the default/persistent Electron renderer rather than the ephemeral guest partition. Parse failures generally degrade to an empty/default value instead of surfacing an error.

| Key | Exact value shape at baseline | Read/write behavior | Rewrite compatibility requirement |
| --- | --- | --- | --- |
| `mini.authenticator.accounts.v1` | JSON array of `{ id: string, issuer: string, label: string, secret: string, algorithm: "SHA1"|"SHA256"|"SHA512", digits: 6|8, period: number, createdAt: number }` | Reader only verifies array plus string `secret`; writer serializes the complete array (`src/lib/accounts.ts:5-23`, `src/lib/accounts.ts:36-48`, `src/lib/totp.ts:3-14`). | Treat as a legacy plaintext-secret schema. Migrate versionedly and atomically into Keychain/Credential Manager; verify native writes before deleting it. |
| `mini.bookmarks.v1` | JSON array of `{ id: string, url: string, title: string, createdAt: number }` | Reader keeps entries with string `url`; writes can fail silently (`src/lib/bookmarks.ts:6-25`, `src/lib/bookmarks.ts:37-69`). | Preserve valid entries/order and report invalid records during migration. |
| `mini.settings.v1` | JSON object `{ tabPosition: "top"|"side", favoritesMode: "always"|"hover"|"never", restoreSession: boolean }` | Missing/invalid fields default independently to `top`, `always`, and `false`; writes can fail silently (`src/lib/settings.ts:5-37`, `src/lib/settings.ts:49-69`). | Preserve semantics and defaults. |
| `mini.session.v1` | JSON array of URL strings | Only used when `restoreSession` is true; invalid/non-string values are discarded (`src/lib/settings.ts:72-90`, `src/components/mini-app.tsx:92-116`). | URLs may migrate; cookies, cache, credentials, and browsing storage intentionally do not. |

There is also a second, separate authenticator store inside the loaded Manifest V3 extension: `chrome.storage.local["accounts"]`, with substantially the same plaintext account objects (`extension/manifest.json:1-16`, `extension/popup.js:1-21`, `extension/popup.js:67-107`). The React authenticator and extension do not synchronize. Migration must discover both stores, avoid double importing, and never delete either until verified native-secret writes and manual code checks succeed.

The ad-block cache `easylist-hosts.json` is an optional JSON string array in Electron `userData`; it is not product state and may be rebuilt (`src/main/adblock.ts:13-14`, `src/main/adblock.ts:54-75`). Agent mode writes `agent.json` containing host, port, and bearer token to `userData` with mode `0600` (`src/main/agent-server.ts:167-176`).

## 5. Authenticator and Firefox-import contract

### Implemented baseline

- The built-in panel adds, searches, lists, deletes, generates, and copies TOTP codes. It supports SHA-1/SHA-256/SHA-512, 6/8 digits, and custom periods (`src/lib/totp.ts:3-14`, `src/lib/totp.ts:27-47`, `src/components/authenticator-panel.tsx:58-64`, `src/components/authenticator-panel.tsx:117-187`).
- Manual input accepts a base32 secret or `otpauth://totp` URI only; HOTP is rejected (`src/lib/totp.ts:50-77`, `src/lib/totp.ts:80-114`).
- Import accepts text selected through a renderer file input. It parses unencrypted JSON recursively or one `otpauth://` URI per line, deduplicates by normalized issuer, label, and plaintext secret, then appends all accepted accounts in one `localStorage` write (`src/components/authenticator-panel.tsx:26-56`, `src/components/authenticator-panel.tsx:86-106`, `src/components/authenticator-panel.tsx:191-204`, `src/lib/import-backup.ts:10-85`, `src/lib/import-backup.ts:164-175`).
- Import explicitly skips encrypted records and non-TOTP/HOTP/Steam/Battle.net records and reports only an aggregate skipped count (`src/lib/import-backup.ts:26-45`, `src/lib/import-backup.ts:88-137`). It has no preview, per-account unsupported report, password prompt/decryption, atomic OS-secret write/rollback, manual verification checkpoint, or export/recovery facility.

### Rewrite parity boundary

The plaintext localStorage behavior is evidence of legacy compatibility, not acceptable final storage. The rewrite must preserve every valid legacy field while replacing this flow with the complete Firefox Authenticator migration specified by the rewrite goal: format/version detection by content; unencrypted `authenticator.txt`, JSON/`OTPStorage`, URI lines, v8+ encrypted backups, and legacy <=7 encrypted backups; TOTP/HOTP/Steam/Battle.net; counters/order/icon metadata; secret-free preview and diagnostics; identity-based conflict handling; all-or-nothing Keychain/Credential Manager writes; manual code verification; password-protected Minimal recovery plus interoperable export; untouched source vault/backup. No current implementation evidence satisfies those requirements.

## 6. Agent-mode and native-boundary security

- The chrome preload exposes only platform, ready, typed browser command, layout, state, focus, and UI-toggle channels through `window.mini` (`src/preload/index.ts:1-31`). The main renderer uses context isolation and no Node integration, but its Electron sandbox is explicitly disabled (`src/main/index.ts:44-49`).
- Remote page webviews do not receive this preload or a host object. At baseline, that is the main isolation boundary (`src/main/tabs.ts:208-219`). There is no automated threat-model test proving the boundary.
- Agent mode is off unless `--agent`, `--agent-port`, `MINIMAL_AGENT`, or a configured port is supplied. It binds only to `127.0.0.1`, uses a random 32-byte token unless configured, compares bearer credentials with `timingSafeEqual`, caps JSON bodies at 256 KiB, and returns `Cache-Control: no-store` (`src/main/index.ts:57-63`, `src/main/index.ts:114-127`, `src/main/agent-server.ts:11-19`, `src/main/agent-server.ts:22-38`, `src/main/agent-server.ts:126-159`).
- Agent endpoints expose health, browser state, bounded page snapshot, PNG screenshot, allowlisted browser commands, and arbitrary JavaScript evaluation (`src/main/agent-server.ts:58-100`, `src/main/agent-server.ts:103-123`). Snapshot text is limited to 30,000 characters and 200 interactive elements; password input values are excluded (`src/main/tabs.ts:103-128`). Evaluation is limited only by non-empty input and a 100,000-character ceiling (`src/main/tabs.ts:131-136`).
- **Gaps:** evaluation is arbitrary and enabled whenever agent mode is enabled; commands have no origin/frame checks or approval gates; screenshots/snapshots can contain browsing content; external navigation and downloads lack the required approval model. These are documented roadmap items, not implemented controls (`docs/AGENT_MODE.md:37-51`).

## 7. Platform-specific baseline contracts

### macOS

- The current product is an Electron/Chromium app, not AppKit/WKWebView. It uses macOS hidden-inset chrome and Command shortcuts as described above.
- electron-builder declares DMG and ZIP targets, but the tagged release workflow builds only arm64 and verifies `Minimal-<version>-mac-arm64.dmg`, `.zip`, and `latest-mac.yml` (`package.json:73-87`, `.github/workflows/release-macos.yml:23-55`). There is no x64 CI release build.
- Hardened runtime and Gatekeeper assessment are false and signing identity is null (`package.json:80-83`). There are no Developer ID/notarization hooks in the workflow. Any local artifact is unsigned and is not proof of a production update path.
- There is no download/permission-specific platform adapter, native updater implementation, signed-update smoke, or rollback test. The roadmap explicitly labels signing/notarization and N-to-N+1 update smoke as future prerequisites (`docs/ROADMAP.md:64-77`).

### Windows

- The current runtime remains the same Electron implementation, with hidden custom title-bar overlay and Control shortcuts (`src/main/index.ts:37-43`, `src/main/tabs.ts:377-439`). There is no Win32 shell, `windows` crate, or WebView2 lifecycle implementation.
- electron-builder declares x64 NSIS and portable targets. NSIS is interactive, per-user, lets users choose the directory, creates Desktop and Start Menu shortcuts, and uses shortcut name `Minimal`. Artifact names are `Minimal Setup <version>.exe` and portable `Minimal.exe` (`package.json:94-122`). These names and installer behaviors are the Windows compatibility contract.
- CI runs validation only on Ubuntu. The only native release workflow is macOS arm64 (`.github/workflows/ci.yml:15-53`, `.github/workflows/release-macos.yml:23-55`). There is no native Windows build, install/launch smoke, WebView2 bootstrap test, signing, updater, release upload, or uninstall-cleanup evidence.
- The site intentionally presents Windows as “coming soon,” links the main CTA to source, and offers clone/dev commands rather than an installer (`website/index.html:891-905`, `website/index.html:928-943`). This must remain true until a clean-machine Windows artifact passes the release gate.

## 8. Website, artifacts, releases, and update state

- The Vercel production path statically hydrates the single HTML template with platform `mac`, package version, and site URL; it copies local icons/SEO assets into `public` (`scripts/vercel-build.mjs:5-32`, `vercel.json:1-8`). The static download API queries the latest GitHub Release, redirects to its first `.dmg`, or falls back to the Releases page (`api/download/latest.js:1-25`).
- The alternate Bun development server can detect macOS/Windows/Linux, serve the newest local `.dmg`, `.exe`/`.msi`, or `.AppImage`, and otherwise redirect macOS to a constructed tag asset and other platforms to Releases (`website/server.ts:28-57`, `website/server.ts:75-102`). This server is not the Vercel production implementation.
- Website metadata and hero copy currently advertise macOS, Chromium, Apple Silicon, built-in blocking/2FA, and fresh sessions (`website/index.html:8-47`, `website/index.html:655-676`). There are no benchmark results, raw benchmark data, checksums, signature/notarization status, or release-manifest metadata on the site.
- Live GitHub inspection on the baseline date found no published releases. The latest `CI` run for `b04b346` succeeded (run `32648562047`), while `Prepare release` failed (run `32648562027`) because repository Actions policy forbade GitHub Actions from creating/approving pull requests. The action did create/update the release branch before the PR API denial. Therefore release automation is not healthy.
- The release workflow is tag/release-triggered and uploads only macOS arm64 assets. No updater dependency is present in `package.json`; `electron-updater` exists only as roadmap intent (`package.json:30-55`, `.github/workflows/release-macos.yml:1-73`, `docs/ROADMAP.md:64-77`).

## 9. Benchmark and verification baseline

There is no deterministic benchmark harness, fixtures directory, raw JSON, machine metadata, randomized sampling, competitor result, or confidence-interval calculation in the baseline repository. The only historical numbers are the roadmap's approximate 959 KB renderer entry, 53 KB CSS, and 131 MB arm64 DMG; they are not reproducible cutover evidence (`docs/ROADMAP.md:5-16`). No “fastest browser” claim is supportable from the current repository.

Current local verification on 2026-08-23 after `npm ci`:

| Check | Result | Scope / caveat |
| --- | --- | --- |
| `npm test` | Pass | TOTP, blocklist, backup import, navigation error, and URL unit scripts only (`package.json:26`). No native/platform/integration/security tests. |
| `npx tsc --noEmit` | Pass | TypeScript compile check. |
| `npm run build` | Pass | Electron/Vite build; measured renderer entry 737,628 bytes, authenticator chunk 251,870 bytes, and CSS 59,687 bytes. |
| `npm run check:bundle` | Pass | Entry below 1,100,000 bytes and CSS below 80,000 bytes (`scripts/check-bundle.mjs:4-25`). This is a bundle budget, not runtime performance evidence. |
| `npm run vercel-build` | Pass | Static site hydration/copy only. Generated output was discarded after validation. |
| `npm run lint` | Fail | ESLint reports every `src` file ignored because the flat config declares only global ignores and no matching source configuration (`eslint.config.mjs:1-7`). Current CI does not run lint (`.github/workflows/ci.yml:30-53`). |

The latest GitHub CI success proves the Linux validation job at this commit (tests, type-check, Electron build, bundle budget, and static-site checks). It does not prove a macOS app launch, Windows build, packaging, clean-machine behavior, signing, updating, uninstalling, remote-page isolation, authenticator migration, or any performance gate.

## 10. Cutover invariants derived from this baseline

The native rewrite must not remove `legacy-electron` until evidence covers every implemented behavior above on both supported platforms. In particular:

1. Keep identity `app.minimal.browser` / `Minimal`, the four named storage keys as recognized migration inputs, Windows artifact names, and interactive per-user installer semantics.
2. Preserve the fast lazy start tab, omnibox resolution rules, tab state/lifecycle, top/side layouts, menus/shortcuts, focus mode, favorites, optional URL-only session restoration, error/title/loading state, popup handling with a safer approval boundary, and fresh browsing by default.
3. Replace plaintext authenticator stores with verified OS-backed secret storage without losing either renderer or extension accounts. Complete Firefox import/export requirements are additive mandatory parity, not optional redesign.
4. Replace Electron's in-memory partition and permissive gaps with explicit WKWebView/WebView2 ephemeral lifecycle, default-deny permissions, typed/approved agent actions, and tested remote-page isolation.
5. Keep Windows unavailable for public download until native Windows clean-machine tests pass. Publish artifacts or performance claims only with signed/checksummed release metadata and retained reproducible evidence.
