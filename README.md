# Minimal

**A focused personal browser with private sessions, built-in 2FA, and a compact interface.**

[![CI](https://github.com/PuvaanRaaj/mini-browser/actions/workflows/ci.yml/badge.svg)](https://github.com/PuvaanRaaj/mini-browser/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

[Website](https://mini-browser-v2.vercel.app) · [Downloads](https://github.com/PuvaanRaaj/mini-browser/releases) · [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md)

Minimal keeps browser chrome out of the way. It opens with a temporary profile by default, blocks common ads and trackers, and keeps passwords and authenticator secrets in an OS-encrypted vault.

## Highlights

- **Minimal interface** — compact tabs, focus mode, favorites, per-site zoom, and keyboard-first navigation.
- **Private by default** — cookies and site data are temporary unless **Stay signed in** is explicitly enabled.
- **Built-in authenticator** — add TOTP accounts manually, import compatible backups, or capture the active page and select a QR code. Captures are decoded locally and discarded after use.
- **Secure password vault** — secrets are encrypted through the operating system and never exposed to website renderers.
- **Passkeys** — supports Windows Hello, roaming security keys, and signed macOS Touch ID/Secure Enclave builds.
- **Tracking protection** — EasyList/EasyPrivacy-backed blocking with safeguards that prevent bad rules from breaking top-level navigation.
- **Measurable performance** — repeatable startup, navigation, memory, idle CPU, and market-comparison benchmarks.

## Project status

| Version | Status | Core |
| --- | --- | --- |
| `1.x` | Current application | Electron with Chromium web views |
| `2.0.0` | In development | Standalone, pinned Chromium distribution |

The standalone Chromium work is developed alongside the working `1.x` app. Performance claims are published only after identical clean-profile measurements against other browsers. See [the roadmap](docs/ROADMAP.md).

## Quick start

Requirements: Node.js 22+ and npm.

```bash
git clone https://github.com/PuvaanRaaj/mini-browser.git
cd mini-browser
npm install
npm run dev
```

Useful checks:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Build the desktop app

macOS (Apple Silicon):

```bash
npm run dist:mac
npm run open:mac
```

Windows (x64):

```powershell
npm run dist:win
```

Release artifacts are written to `release/`. Signed Touch ID builds require a valid Apple Developer Team ID through `MINIMAL_APPLE_TEAM_ID`.

## Authenticator and passwords

Open Authenticator with `⌘⇧A` on macOS or `Ctrl+Shift+A` on Windows.

- Paste an `otpauth://` URI or a base32 TOTP secret.
- Import an unencrypted JSON or text backup, then securely delete the source file.
- Choose **Scan QR**, capture the active page, and drag a rectangle around the QR code. Minimal decodes it on-device and asks for confirmation before import.
- Save passwords for an exact HTTPS origin; Minimal refuses to fill them on a different site.

TOTP seeds, passwords, and app-owned OAuth tokens live in an asynchronous main-process vault backed by Electron `safeStorage`. The vault fails closed when secure OS encryption is unavailable.

## Sign-in and passkeys

- Website sessions are ephemeral unless persistence is enabled in Settings.
- Google website login is supported by the standalone Chromium architecture; the Electron build does not bypass Google's embedded-browser policy.
- Minimal-owned Google integrations use system-browser OAuth with PKCE. Configure a Desktop OAuth client through `MINIMAL_GOOGLE_OAUTH_CLIENT_ID`.
- macOS Touch ID requires a properly signed build and matching keychain-access-group entitlement.

## Benchmarks

```bash
npm run benchmark
npm run benchmark:market
```

The market benchmark uses isolated profiles and the same workload for Minimal, Chrome, and Firefox. Results are stored under `.benchmarks/` and are not committed because hardware and background activity affect them.

Standalone Chromium maintainers should read [chromium/README.md](chromium/README.md) before downloading the large source tree.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `⌘/Ctrl + L` | Focus the address field |
| `⌘/Ctrl + T` | New tab |
| `⌘/Ctrl + W` | Close tab |
| `⌘/Ctrl + R` | Reload |
| `⌘/Ctrl + Shift + F` | Toggle focus mode |
| `⌘/Ctrl + Shift + A` | Open Authenticator |
| `⌘/Ctrl + Shift + B` | Open favorites |
| `⌘/Ctrl + [` / `]` | Back / forward |

## Repository layout

```text
src/main/       Desktop main process, sessions, security, vault, and IPC
src/preload/    Narrow context-isolated renderer bridge
src/renderer/   React entry point
src/components/ Browser chrome, settings, password, and authenticator UI
extension/      Bundled Manifest V3 authenticator extension
chromium/       Pinned standalone Chromium build configuration
website/        Public download website
docs/           Architecture, roadmap, and agent-mode documentation
```

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), open an issue before a large architectural change, and never include real passwords, TOTP seeds, tokens, or private browsing data in tests or screenshots.

## License

[Apache License 2.0](LICENSE)
