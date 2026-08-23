# Minimal

A personal Chromium browser for macOS. White window, almost no chrome: one search field on a new tab, then a slim title pill and URL bar over the page. Fresh session, Orion-style focus mode, built-in TOTP authenticator.

Inspired by [Guillermo Rauch’s Mini](https://x.com/rauchg/status/2091229263701905662) (built with [fx](https://fx.sh)). This one is a real Mac app — Chromium in a native window.

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

Build `Minimal.app` (Apple Silicon lands in `mac-arm64/`):

```bash
npm run dist:mac
npm run open:mac
```

From the repo root: `open release/mac-arm64/Minimal.app`  
If you already `cd`'d into `release/`: `open mac-arm64/Minimal.app`

You can also mount the disk image: `open release/Minimal-0.1.0-mac-arm64.dmg`.

The `.dmg` lands in `release/`. Gatekeeper signing is left off so a local build is easy; macOS may ask you to open it via System Settings → Privacy & Security the first time.

## Why this exists

A full browser is cookies, extensions, and logged-in tabs. Minimal is the opposite:

- **New tab** — `⌘T`, **File → New Tab**, or the **+** next to the tab pill
- **Fresh Chromium** — in-memory profile, nothing from Safari or Chrome
- **Ads and trackers blocked** on every session (EasyList + EasyPrivacy, plus a built-in host list)
- **Authenticator** — key icon to the right of the URL bar (like a Chrome toolbar extension), or `⌘⇧A`. Codes stay in Minimal, not in the throwaway profile.

`⌘L` focuses the URL field. In focus mode it brings back the centered search field. Escape dismisses it.

## Keyboard

| Shortcut | Action |
| --- | --- |
| `⌘L` | Focus the URL field |
| `⌘T` | New tab |
| `⌘W` | Close tab |
| `⌘R` | Reload |
| `⌘⇧F` | Focus mode (hide the title/URL bar) |
| `⌘⇧A` | Authenticator |
| `⌘[ / ⌘]` | Back / forward |
| `Esc` | Close search or authenticator |

Search queries go to DuckDuckGo. Hostnames open as `https://`.

## Authenticator

There is no Chrome Web Store here. 2FA is built in:

- **Key icon** to the right of the URL bar (same place Chrome puts extension icons)
- On a new tab, the same key sits in the bottom-right corner
- **⌘⇧A**, or **View → Authenticator**

Paste an `otpauth://` URI or a base32 secret, click a code to copy it. Secrets live in Minimal's renderer storage and survive **Reset Session**.

The same authenticator also ships as a Manifest V3 extension in `extension/`, loaded into the guest Chromium session. Electron does not draw Chrome's puzzle-piece toolbar, so the key icon is the control.

## Ad blocking

Ads and trackers are blocked by default in the throwaway session. A built-in host list applies immediately; EasyList and EasyPrivacy are fetched in the background and cached. The shield next to the URL bar means blocking is on. There is no off switch yet.

## Stack

Electron (Chromium), Vite, React, Tailwind, shadcn/ui, [`otpauth`](https://github.com/hectorm/otpauth).
