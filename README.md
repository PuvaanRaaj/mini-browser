# Minimal

Minimal is a focused Chromium browser for macOS: one search field, almost no chrome, a fresh session on every launch, built-in ad blocking, and a local TOTP authenticator.

It is a native desktop app designed to keep browsing fast, private, and distraction-free.

- **Repository:** [github.com/PuvaanRaaj/mini-browser](https://github.com/PuvaanRaaj/mini-browser)
- **Website:** [mini-browser-v2.vercel.app](https://mini-browser-v2.vercel.app)
- **Releases:** [GitHub Releases](https://github.com/PuvaanRaaj/mini-browser/releases)

Contributions are welcome. Please see [CONTRIBUTING.md](CONTRIBUTING.md).

## Clone

```bash
git clone https://github.com/PuvaanRaaj/mini-browser.git
cd mini-browser
```
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

## Landing page

`website/` holds the landing page. Run it locally with Bun 1.4.0 or newer:

```bash
npm run site        # → http://localhost:3000
```

- Detects the visitor's OS from the User-Agent (server-side, refined client-side) and preselects macOS / Windows / Linux.
- `/download/latest` streams the newest `.dmg` in `release/` (or `.exe` / `.AppImage` when those targets exist) and falls back to GitHub Releases when no artifact is present.
- Install card shows `brew install --cask puvaanraaj/tap/minimal` and a one-line `curl` download for macOS; Windows and Linux visitors get an honest "coming soon" plus build-from-source.
- `?os=windows` (or `linux`/`mac`) previews another platform's state — handy for testing.
- `PORT=4000 npm run site` changes the port.

For the Homebrew command to work publicly, publish a `homebrew-tap` repo with a Cask for Minimal; for the cURL fallback to work off localhost, publish the `.dmg` as a GitHub release.
If you already `cd`'d into `release/`: `open mac-arm64/Minimal.app`

You can also mount the disk image: `open release/Minimal-0.1.0-mac-arm64.dmg`.

The `.dmg` lands in `release/`. Gatekeeper signing is left off so a local build is easy; macOS may ask you to open it via System Settings → Privacy & Security the first time.

## Deploy the landing page to Vercel

Vercel hosts the landing page, not the Electron desktop app. Import the repository with the root directory set to `./`, choose **Other**, and click **Deploy**. `vercel.json` runs the lightweight static build in `scripts/vercel-build.mjs` and skips development dependencies. The download button redirects to the newest `.dmg` attached to a GitHub Release; publish a release before offering downloads.

## Releases

CI runs on every pull request and `main` push. Release Please opens a release PR and increments `package.json` and `package-lock.json` automatically. Use conventional commit prefixes so the version is predictable:

- `fix:` → patch release
- `feat:` → minor release
- `feat!:` or `BREAKING CHANGE:` → major release

Merge the generated release PR. It creates the version tag and GitHub Release; `release-macos.yml` then builds and uploads the arm64 `.dmg`, `.zip`, blockmaps, and updater metadata. To repair or rebuild an existing release, run **Actions → Build macOS release → Run workflow** and provide its tag.

## Agent mode

For local browser agents, run the opt-in loopback control API with `MINIMAL_AGENT=1`. See [docs/AGENT_MODE.md](docs/AGENT_MODE.md) for authentication, page snapshots, screenshots, and safe commands.

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for the performance, release, and automatic-update plan.

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

### Migrate from the Authenticator extension

1. In the old extension, open its backup screen and choose **Download Backup File**. Export the unencrypted JSON backup (or its one-line `otpauth://` backup); encrypted backups cannot be read without the old extension's password format.
2. In Minimal, open **Authenticator** and choose **Import** next to the account search field.
3. Select the downloaded `.json` or `.txt` file. Accounts are parsed locally, duplicates are ignored, and unsupported HOTP/Steam entries are reported as skipped.
4. Delete the unencrypted backup file after confirming the codes work.

The same authenticator also ships as a Manifest V3 extension in `extension/`, loaded into the guest Chromium session. Electron does not draw Chrome's puzzle-piece toolbar, so the key icon is the control.

## Ad blocking

Ads and trackers are blocked by default in the throwaway session. A built-in host list applies immediately; EasyList and EasyPrivacy are fetched in the background and cached. The shield next to the URL bar means blocking is on. There is no off switch yet.

## Stack

Electron (Chromium), Vite, React, Tailwind, shadcn/ui, [`otpauth`](https://github.com/hectorm/otpauth).
