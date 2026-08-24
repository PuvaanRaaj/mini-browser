# Minimal Browser full-rewrite goal

Work autonomously until the complete rewrite is genuinely finished and verified. Do not stop after planning, scaffolding, or a proof of concept.

## Objective

At repository head `b04b346` or newer, completely replace Minimal's Electron, React, Node-side browser orchestration, persistence, packaging, and release implementation with a fast cross-platform architecture:

- A shared pure-Rust core.
- A thin Swift/AppKit shell using WKWebView on macOS.
- A thin Rust/Win32 shell using the `windows` crate and WebView2 on Windows.
- Native shell controls on both platforms so the omnibox and new-tab UI appear before the page engine starts. Do not use a webview, React, or JavaScript runtime for browser chrome.
- Pure Rust crates for browser state, URL/search resolution, settings, bookmarks, sessions, TOTP/import logic, content-rule compilation, agent contracts, and benchmark result schemas.
- Platform adapters for WKWebView/WebView2 lifecycle, content blocking, secret storage, permissions, downloads, menus, shortcuts, updater, signing, and packaging.
- A static, lightweight landing site that publishes accurate platform availability, verified benchmarks, release metadata, checksums, and download links.

Windows support is already merged in PR #1. Treat Windows as a first-class platform from the first milestone, not a later port.

## Mandatory first actions

1. Confirm the exact current branch, head, worktree status, remote head, merged discussions/PR context available locally, and CI state. Pull with `--ff-only` if safe; preserve unrelated and untracked user work.
2. Read all applicable `AGENTS.md` files and current documentation.
3. Create an isolated `codex-rust-rewrite` branch/worktree. Do not destabilize the releasable Electron baseline.
4. Record the current macOS and Windows behavior contract, data formats, artifacts, security boundaries, and benchmarks before changing implementation.
5. Write a brief execution plan with a verification gate for every phase, then keep it current.

## Architecture and repository target

Use this structure unless current evidence requires a small, documented adjustment:

```text
apps/macos/          Swift/AppKit shell and WKWebView adapter
apps/windows/        Rust/Win32 shell and WebView2 adapter
apps/website/        static release and benchmark site
crates/minimal-core/
crates/minimal-storage/
crates/minimal-blocker/
crates/minimal-platform/
crates/minimal-agent/
benchmarks/fixtures/
benchmarks/harness/
benchmarks/baselines/
legacy-electron/     temporary only; remove at verified cutover
```

Keep browser chrome native and every remote page in an isolated page webview. Remote pages must never receive host objects, native IPC, filesystem access, secrets, privileged initialization scripts, or unrestricted evaluation. Only native shell code may invoke the allowlisted Rust core API.

## Current behavior that must survive

- Fast new-tab/start page and one omnibox.
- Multiple tabs, top and side layouts, close/switch/new-tab behavior.
- Back, forward, reload, stop, title/loading/error states, popups, and external schemes.
- Focus mode and all current macOS/Windows shortcuts.
- Favorites bar, favorites panel, bookmark toggle, settings, and optional session restore.
- Fresh browsing session by default.
- Built-in EasyList/EasyPrivacy blocking with a built-in fallback list.
- Authenticator accounts, full Firefox Authenticator extension migration, backup import/export, code generation/copy, and safe secret handling.
- Opt-in, loopback-only agent mode and bounded snapshots/screenshots.
- Current site, release, download, and update intent.
- Stable application identity `app.minimal.browser` / `Minimal`, unless a separately approved migration changes it.
- Existing persisted schemas: `mini.authenticator.accounts.v1`, `mini.bookmarks.v1`, `mini.settings.v1`, and `mini.session.v1`.

Do not silently omit or redesign a feature. Record intentional product changes in an ADR and prove the replacement behavior.

## Platform contracts

### macOS

- Use a nonpersistent `WKWebsiteDataStore` for fresh-session browsing.
- Use compiled `WKContentRuleList` rules for blocking.
- Produce arm64 and x64 builds.
- Preserve native shortcuts, focus, window chrome, menus, downloads, and permission behavior.
- Add Developer ID signing/notarization hooks; report missing credentials as a blocker rather than weakening validation.

### Windows

- Use one shared per-session WebView2 environment and temporary user-data folder. Clear data while controls are alive, close all webviews, then remove only the validated session directory.
- Use WebResourceRequested filters with the indexed blocker; never perform a full rule scan per request.
- Build and smoke-test x64 NSIS and portable artifacts on native Windows CI from the beginning.
- Preserve the current interactive per-user installer behavior, desktop/Start shortcuts, selectable install directory, and stable `Minimal Setup <version>.exe` / `Minimal.exe` names unless an explicit versioned release migration changes them.
- Preserve Control shortcuts, custom title bar, DPI/multi-monitor behavior, file dialogs, downloads, installer directory selection, desktop/Start shortcuts, and uninstall cleanup.
- Ensure or bootstrap WebView2 Evergreen. Treat Windows code signing as a production release requirement.
- Do not expose the Windows download on the site until a clean-machine install/run smoke test passes.

## Security requirements

- Default-deny page permissions and native commands.
- No Node runtime, Electron switches, or fail-open security paths.
- Store TOTP secrets through macOS Keychain and Windows Credential Manager; never in shell localStorage or plain files.
- Make legacy data migration versioned and rollback-safe. Verify Keychain/Credential Manager writes before deleting legacy TOTP values; browsing cookies remain intentionally unmigrated.
- Never include secrets, credentials, browsing content, internal paths, or page data in logs, telemetry, benchmark artifacts, crash output, or agent responses.
- Keep arbitrary agent evaluation disabled by default. Prefer typed click/fill/select/navigation commands with origin/frame checks and approval gates for downloads, password fields, authenticator use, permissions, and external navigation.
- Add threat-model tests proving remote pages cannot reach the native bridge.

## Firefox Authenticator migration — mandatory

The rewrite must let me dump my complete Authenticator extension vault from Firefox into Minimal without silent data loss.

1. Add a dedicated **Import from Firefox Authenticator** wizard. Document the source steps as Firefox Authenticator → Settings → Backup → Download Backup File.
2. Accept the Authenticator extension's standardized unencrypted `authenticator.txt`, unencrypted JSON/`OTPStorage`, one-URI-per-line `otpauth://`, and password-protected `authenticator.json` formats. Detect format and version; do not guess from filename alone.
3. Decrypt password-protected backups locally after collecting the password through a native secure field. Support separately tested current version 8+ and legacy version ≤7 formats. For legacy encrypted backups, show the upstream weak-KDF security warning; never send the file or password anywhere.
4. Preserve issuer, account/label, secret, algorithm, digit count, period, counter, ordering, and supported icon metadata.
5. Support every account type present in the exported vault, including TOTP, HOTP, Steam, and Blizzard/Battle.net. If any source entry truly cannot be implemented, do not finalize the migration until an explicit account-by-account unsupported report is shown and I approve it. Never silently skip entries.
6. Preview importable, duplicate, invalid, encrypted, and unsupported counts before writing. Never show secret values in the preview, logs, telemetry, crash output, agent responses, accessibility labels, or screenshots.
7. Deduplicate using normalized credential identity while retaining legitimate accounts that share an issuer or label. Make conflicts explicit.
8. Write the full import atomically into macOS Keychain or Windows Credential Manager. Roll back all newly written credentials if any write or verification fails. Never modify Firefox's profile or source vault.
9. After import, generate codes and require a manual verification checkpoint before declaring the migration complete. Keep the source backup untouched and advise secure deletion only after verification.
10. Add a password-protected Minimal recovery export plus a standards-based interoperable export. Never generate plaintext exports without an explicit warning and confirmation.
11. Use sanitized fixtures representing current and legacy Firefox Authenticator encrypted/unencrypted exports, malformed files, wrong passwords, duplicates, large vaults, TOTP/HOTP/Steam/Battle.net entries, alternate algorithms, 6/8 digits, non-default periods, and counters.

The existing TypeScript importer only reads unencrypted JSON and `otpauth://` lines and silently skips encrypted, HOTP, Steam, and Blizzard/Battle.net records. Do not carry those limitations into the rewrite.

## Required implementation phases

1. Baseline and parity contract.
2. Rust core plus native AppKit and Win32 skeletons with macOS and Windows CI.
3. Pure Rust state, storage, migration, blocker, and test crates.
4. One-tab end-to-end vertical slice on both platforms.
5. Complete feature parity, including verified Firefox Authenticator migration and recovery export.
6. Ephemeral browsing, platform blocking, permissions, downloads, secrets, and agent hardening.
7. Instrumentation and same-machine performance program.
8. Signed-release plumbing, updater, Windows release workflow, website, checksums, and migration guide.
9. Verified cutover, legacy removal, dependency/license cleanup, and rollback tag.

Do not remove the legacy implementation before feature parity, security, cross-platform smoke, and performance gates pass. A full rewrite means the final shipped implementation contains no Electron, React, or Node runtime; it does not mean deleting the working baseline before the replacement is proven.

## Performance and benchmark gates

Create deterministic fixtures and run at least ten randomized, independently restarted samples. Retain raw JSON plus hardware, OS, browser/engine version, settings, commit, median, p25-p75, and confidence intervals.

The rewrite may cut over only when it achieves:

- At least 25% faster median cold launch to a focused, usable omnibox on both macOS and Windows.
- At least 20% faster warm launch.
- At least 30% lower one-tab private memory and 25% lower ten-tab private memory.
- No idle CPU/energy regression; target at least 20% improvement.
- Speedometer, JetStream, and MotionMark within 5% of the matching system engine browser under engine-isolated settings: Safari on macOS and Edge on Windows.
- No statistically supported default-navigation regression; target at least 15% lower page latency or transferred bytes on the controlled real-page corpus.
- Indexed 100k-rule blocker fallback lookup below 10 microseconds median.
- No browser-shell JavaScript runtime; the omnibox/new-tab shell appears before web-engine initialization.
- Equivalent installers at least 70% smaller than Electron artifacts, excluding the separately installed system webview runtime.

Never compare different machines or benchmark versions. Never publish a universal "fastest" claim. Publish only precisely named, dated, reproducible wins with raw results.

## Quality and delivery rules

- Use tests first for bugs, state transitions, data migrations, request blocking, permission boundaries, and platform lifecycle behavior.
- CI must run Rust format, Clippy with warnings denied, Rust tests, TypeScript checking/linting, shell bundle budgets, site checks, and native macOS/Windows build smoke tests.
- Fix the repository Actions permission or token configuration currently preventing Release Please from creating release PRs; do not claim release automation is healthy until a live run passes.
- Keep commits phase-scoped and conventional. Preserve unrelated work and never commit generated packages, caches, tokens, certificates, or machine-specific credentials.
- After every phase, update the parity matrix, benchmark delta, security evidence, risks, and next action.
- If either native engine adapter cannot satisfy remote-page isolation, lifecycle, accessibility, or benchmark requirements, stop before changing stacks and provide a concrete evidence-backed architecture decision.
- Continue fixing safe in-scope failures until the terminal conditions are met. Report only genuine external blockers such as unavailable signing credentials or absent native runners.

## Terminal conditions

The goal is complete only when:

1. Electron, React, Node runtime dependencies, and temporary legacy code are gone from the shipped implementation.
2. macOS arm64/x64 and Windows x64 builds pass clean-machine install, launch, browsing, update, and uninstall smoke tests.
3. All current features pass the cross-platform parity matrix.
4. A sanitized full Firefox Authenticator vault migrates with zero silent omissions, atomic rollback, OS-backed storage, verified codes, and an interoperable recovery export.
5. Remote-page isolation, permissions, ephemeral-session cleanup, secret storage, and agent security tests pass.
6. Every performance cutover gate is met or an explicitly approved exception is documented with evidence.
7. The site publishes only verified artifacts and reproducible benchmark claims.
8. The final diff, tests, benchmark artifacts, authenticator migration evidence, release risks, signing blockers, and rollback procedure are reported accurately.
