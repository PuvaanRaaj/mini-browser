# Mini

A personal Chromium browser for macOS: fresh session, thin chrome, Orion-style focus mode, and a built-in TOTP authenticator.

Inspired by Guillermo Rauch's Mini (built with [fx](https://fx.sh)). This one is a real Mac app — Chromium in a native window.

**Public (anyone):** [github.com/PuvaanRaaj/mini-browser](https://github.com/PuvaanRaaj/mini-browser)  
**Cursor / Origin:** [puvaanraaj/mini-browser](https://origin.cursor.com/puvaanraaj/mini-browser)

License: [Apache-2.0](LICENSE). Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Clone

Non-Cursor users (no login):

```bash
git clone https://github.com/PuvaanRaaj/mini-browser.git
cd mini-browser
```

Cursor / Origin:

```bash
origin repo clone puvaanraaj/mini-browser mini-browser
cd mini-browser
```

## GitHub ↔ Origin mirror

GitHub is the public source of truth. Origin should be a **Sync from GitHub** mirror so Cursor agents and PRs stay in sync.

This cloud agent cannot enable that (Origin token is scoped to the session repo). On your machine:

1. Push the latest `main` to GitHub:
   ```bash
   git remote add github https://github.com/PuvaanRaaj/mini-browser.git
   git push -u github main
   ```
2. Connect the [Cursor GitHub app](https://cursor.com/dashboard/integrations) if it is not already.
3. Open [cursor.com/codebase](https://cursor.com/codebase) → **Sync from GitHub** → `PuvaanRaaj/mini-browser`.
4. If Origin already has a standalone `mini-browser` (empty, created before GitHub), delete that Origin repo first, then sync. Mirroring needs GitHub as the source; it cannot attach to an existing Origin-native repo with the same name.
5. Confirm under Origin **Settings → General**: Origin = mirror, GitHub = source. Pushes to the Origin remote then pass through to GitHub.

After that, public clones and PRs go to GitHub. Cursor agents use the Origin copy.

## Run on a Mac

```bash
npm install
npm run dev
```

Build `Mini.app` (Apple Silicon lands in `mac-arm64/`):

```bash
npm run dist:mac
npm run open:mac
```

From the repo root: `open release/mac-arm64/Mini.app`  
If you already `cd`'d into `release/`: `open mac-arm64/Mini.app`

You can also mount the disk image: `open release/Mini-0.1.0-mac-arm64.dmg`.

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
