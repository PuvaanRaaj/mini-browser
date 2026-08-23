# Full rewrite execution plan

- Baseline: `b04b346f04f14a28e4d8ef1e82a1af830dfd319e`
- Branch: `codex-rust-rewrite`
- Fallback worktree: `/Users/puvaan.shankar/programming/mini-browser`

## Phase 0: contract and baseline

- Record current behavior, storage keys, security boundaries, release assets,
  CI state, and macOS/Windows gaps.
- Run Electron unit, type, build, bundle, launch, navigation, memory, package,
  blocker, and website baselines with raw metadata.
- Capture parity fixtures before moving implementation.

Gate: the Electron fallback remains untouched and releasable; every later
cutover requirement has an authoritative baseline or an explicit missing-data
marker.

## Phase 1: cross-platform skeleton

- Create the Rust workspace and native AppKit and Win32 hosts.
- Display a focusable native omnibox/new-tab shell before page-engine startup.
- Add Rust format, Clippy, test, macOS build, Windows build, and security-boundary
  checks to CI.

Gate: both native shells build on their native runners; remote page content has
no privileged bridge.

## Phase 2: pure Rust capabilities

- Implement core state, URL resolution, storage, migration, blocker, OTP,
  Firefox Authenticator migration, typed agent contracts, and benchmark schema.
- Run legacy TypeScript and Rust behavior against shared fixtures while the
  legacy implementation exists.

Gate: malformed data and state transitions are covered; no UI store is
authoritative; the blocker and migration parsers meet their correctness gates.

## Phase 3: browser vertical slices

- Implement one window and one page tab on each platform.
- Add navigation, history, reload/stop, title/loading/error, popup, external
  protocol, focus, bounds, and crash behavior.

Gate: deterministic end-to-end fixture passes on macOS and native Windows; the
remote-page threat test proves no native bridge access.

## Phase 4: full parity

- Add multiple tabs, top/side layouts, focus mode, favorites, settings,
  optional URL restore, shortcuts, start page, downloads, authenticator, and
  typed agent mode.

Gate: every item in the current-contract matrix passes on both platforms.

## Phase 5: privacy and platform services

- Add WKWebsiteDataStore/WebView2 UDF lifecycle, Keychain/Credential Manager,
  platform content blocking, permissions, download policy, updater hooks, and
  crash cleanup.

Gate: fresh-session restart tests, secret redaction tests, permission tests,
atomic migration rollback, and content-blocking coverage pass.

## Phase 6: performance

- Instrument cold/warm usable-shell latency, navigation, 1/5/10/20-tab private
  memory, CPU/energy, package size, blocker latency, and matching-engine
  BrowserBench suites.
- Optimize only from traces and retained raw samples.

Gate: every promotion threshold in the goal is proven with randomized,
same-machine samples and confidence intervals.

## Phase 7: release and site

- Produce macOS arm64/x64 and Windows x64 signed-release plumbing, updater
  feeds, checksums, clean-machine smoke tests, and rollback artifacts.
- Publish the static site with accurate artifact routing and reproducible
  benchmark evidence.

Gate: installs, launches, updates, rolls back, and uninstalls on clean native
machines. The site exposes only verified artifacts.

## Phase 8: cutover

- Tag the final Electron fallback and verify additive/reversible data migration.
- Remove Electron, React, Node runtime dependencies, and temporary legacy code.
- Complete license, documentation, artifact, and completion audits.

Gate: every terminal condition in the user-provided goal has direct evidence;
otherwise the goal remains active.
