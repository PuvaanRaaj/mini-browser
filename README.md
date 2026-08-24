# Minimal

**A personal Chromium browser with focus mode and a built-in 2FA authenticator.**

One search field, almost no chrome, a fresh session on every launch. Ads and trackers are blocked out of the box, your TOTP codes live a keystroke away, and an opt-in local API lets browser agents drive it safely.

| | |
| --- | --- |
| **Current release** | `1.0.0` (Electron) · the Rust rewrite is shelved while Chromium is optimized |
| **Platforms** | macOS (Apple Silicon) · Windows build in CI |
| **CI** | [![CI](https://github.com/PuvaanRaaj/mini-browser/actions/workflows/ci.yml/badge.svg)](https://github.com/PuvaanRaaj/mini-browser/actions/workflows/ci.yml) |
| **License** | Apache-2.0 |
| **Download** | [GitHub Releases](https://github.com/PuvaanRaaj/mini-browser/releases) · [Website](https://mini-browser-v2.vercel.app) |

## Why Minimal exists

A full browser carries cookies, extensions, and a thousand logged-in tabs. Minimal is the opposite:

- **Fresh Chromium every launch** — an in-memory profile; nothing is shared with Safari or Chrome, and *Reset Session* (`⌘⇧R`-free, one click in settings) wipes everything.
- **Ads and trackers blocked by default** — a built-in high-impact host list applies instantly; EasyList + EasyPrivacy are refreshed in the background and cached. Main-frame navigation is never blocked, so a bad rule can never take down a whole page.
- **2FA built in** — paste an `otpauth://` URI or base32 secret, click a code to copy it. Secrets are encrypted by the OS-backed main-process vault, never kept in renderer `localStorage`, and survive a session reset. The same authenticator ships as a Manifest V3 extension inside the browser session (`extension/`).
- **Agent mode** — an opt-in loopback API (`MINIMAL_AGENT=1`) exposing authenticated state, page snapshots, screenshots, and safe commands for local browser agents. See [docs/AGENT_MODE.md](docs/AGENT_MODE.md).
- **Import your codes** — migrates unencrypted backups from the popular Authenticator extension, skipping duplicates and unsupported entries.

## Quick start

Requirements: Node 22+ (Bun 1.4+ optional for the local landing-page server).

```bash
git clone https://github.com/PuvaanRaaj/mini-browser.git
cd mini-browser
npm install
npm run dev
```

Build the macOS app (Apple Silicon output lands in `release/mac-arm64/`):

```bash
npm run dist:mac
npm run open:mac        # or: open release/mac-arm64/Minimal.app
```

The `.dmg` lands in `release/`. Signed Touch ID builds require `MINIMAL_APPLE_TEAM_ID=<10-character Team ID>`; `npm run dist:mac` generates matching hardened-runtime entitlements and WebAuthn configuration. Unsigned local development keeps Touch ID disabled unless explicitly opted in.

## Secure sign-in and vault

- Website cookies are in memory unless **Settings → Stay signed in** is explicitly enabled.
- App-owned Google sign-in uses the system browser, loopback OAuth callback, state validation, and PKCE. Set `MINIMAL_GOOGLE_OAUTH_CLIENT_ID` for a Google Desktop OAuth client to enable the button in Settings.
- Passwords, Google OAuth tokens, and TOTP seeds are encrypted through Electron `safeStorage` in the main process. The vault fails closed if OS-backed encryption is unavailable, including Linux `basic_text` fallback.
- Saved passwords fill only on the exact HTTPS origin they were created for.
- Passkey selection supports Chromium platform authenticators (Windows Hello), roaming FIDO2 keys, and signed macOS Touch ID/Secure Enclave builds.

## Performance benchmarks

```bash
npm run benchmark          # Minimal cold/warm, first navigation, 10-tab memory and idle CPU
npm run benchmark:market   # isolated-profile Chrome and Firefox comparison on macOS
```

Results are written to `.benchmarks/` and intentionally ignored by Git because hardware, OS state, and installed browser versions materially affect them.

## Keyboard

| Shortcut | Action |
| --- | --- |
| `⌘L` | Focus the URL field (in focus mode: bring back the centered search field) |
| `⌘T` / `⌘W` | New tab / close tab |
| `⌘R` | Reload |
| `⌘⇧F` | Focus mode — hide the title/URL bar |
| `⌘⇧A` | Authenticator |
| `⌘⇧B` | Favorites |
| `⌘[ / ⌘]` | Back / forward |
| `Esc` | Dismiss search or the authenticator |

Search queries go to DuckDuckGo; hostnames open as `https://`.

## Landing page

[`website/`](website/) is the download site, deployed on Vercel.

```bash
npm run site            # → http://localhost:3000  (PORT=4000 to change)
```

- Detects the visitor's OS server-side (refined client-side) and preselects macOS / Windows / Linux; `?os=windows` previews another platform's state.
- `/download/latest` streams the newest installer in `release/` and falls back to GitHub Releases.
- Deploy: import the repo on Vercel with root directory `./`, framework **Other** — `vercel.json` runs `scripts/vercel-build.mjs`.

## Releases & versioning

- CI runs on every PR and `main` push. [Release Please](https://github.com/googleapis/release-please) opens a release PR from conventional commits: `fix:` → patch, `feat:` → minor, `feat!:`/`BREAKING CHANGE:` → major.
- Merging the release PR tags `v<version>`; the macOS and Windows workflows then build and upload installers, blockmaps, and updater metadata.
- **Version contract:** the Electron app is `1.x` (current: `1.0.0`). The Rust/native-shell rewrite is shelved; reconsider it only if measured Chromium work cannot meet the release budgets. See [docs/ROADMAP.md](docs/ROADMAP.md).
- To rebuild an existing release: **Actions → Build macOS release → Run workflow** with its tag.

## Project layout

```
src/main/       Electron main process: tabs/session, adblock, agent API, menu
src/renderer/   React UI: tab rail, URL bar, start page, authenticator panel
src/preload/    Context-isolated IPC bridge
extension/      Manifest V3 TOTP authenticator loaded into the guest session
website/        Landing page (Bun server, deployed on Vercel)
docs/           Agent-mode and roadmap docs
artifacts/      Planning documents (the Rust rewrite plan is shelved reference material)
```

## Stack

Electron (Chromium) · Vite · React 19 · Tailwind · shadcn/ui · [`otpauth`](https://github.com/hectorm/otpauth)

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Please open an issue before large changes, and keep commits conventional so Release Please can version them.
