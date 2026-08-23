# Mini

A personal Chromium browser for macOS: fresh session, thin chrome, Orion-style focus mode, and a built-in TOTP authenticator.

Inspired by Guillermo Rauch's Mini (built with [fx](https://fx.sh)). This one is a real Mac app — Chromium in a native window.

License: [Apache-2.0](LICENSE). Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Run on a Mac

```bash
git clone https://origin.cursor.com/puvaanraaj/tmp-fb57f3438b1f4856.git mini-browser
cd mini-browser
npm install
npm run dev
```

Build `Mini.app`:

```bash
npm run dist:mac
open release/mac/Mini.app
```

The `.dmg` lands in `release/`. Gatekeeper signing is left off so a local build is easy; macOS may ask you to open it via System Settings → Privacy & Security the first time.

### Publish your own public GitHub copy

This cloud workspace cannot create GitHub repositories. From the clone on your Mac:

```bash
gh repo create mini-browser --public \
  --description "Mini — a personal Chromium browser for macOS" \
  --source . \
  --remote github \
  --push
```

Then point clones at `https://github.com/<you>/mini-browser`.

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
