# Mini

A personal Chromium browser for macOS: fresh session, thin chrome, Orion-style focus mode, and a built-in TOTP authenticator.

Inspired by Guillermo Rauch's Mini (built with [fx](https://fx.sh)). This one is a real Mac app — Chromium in a native window.

**Repository:** [puvaanraaj/mini-browser](https://origin.cursor.com/puvaanraaj/mini-browser) on [Origin](https://origin.cursor.com)

License: [Apache-2.0](LICENSE). Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Clone

```bash
origin repo clone puvaanraaj/mini-browser mini-browser
cd mini-browser
```

Or HTTPS:

```bash
git clone https://origin.cursor.com/puvaanraaj/mini-browser.git mini-browser
cd mini-browser
```

## Run on a Mac

```bash
npm install
npm run dev
```

Build `Mini.app`:

```bash
npm run dist:mac
open release/mac/Mini.app
```

The `.dmg` lands in `release/`. Gatekeeper signing is left off so a local build is easy; macOS may ask you to open it via System Settings → Privacy & Security the first time.

## Why this exists

A full browser is cookies, extensions, and logged-in tabs. Mini is the opposite:

- **Native macOS window** with traffic lights and a hidden title bar
- **Fresh Chromium** — in-memory profile, nothing from Safari or Chrome
- **Focus mode** (`⌘⇧F`) hides tabs and the toolbar for screen shares
- **Authenticator** (`⌘⇧A`) so you can still 2FA without your daily browser

## Keyboard

| Shortcut | Action |
| --- | --- |
| `⌘L` | Focus the address bar |
| `⌘T` | New tab |
| `⌘W` | Close tab |
| `⌘R` | Reload |
| `⌘⇧F` | Focus mode |
| `⌘⇧A` | Authenticator |
| `⌘[ / ⌘]` | Back / forward |

Search queries go to DuckDuckGo. Hostnames open as `https://`.

## Authenticator

The side panel is the daily driver: paste an `otpauth://` URI or a base32 secret, click a code to copy it.

Secrets live in Mini's own renderer storage. They survive **Reset Session**, which only throws away the throwaway Chromium profile.

The same authenticator ships as a Manifest V3 extension in `extension/`. Mini loads it into the guest session; you can also Load unpacked in Chrome.

## Stack

Electron (Chromium), Vite, React, Tailwind, shadcn/ui, [`otpauth`](https://github.com/hectorm/otpauth).
