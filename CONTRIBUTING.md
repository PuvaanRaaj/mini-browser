# Contributing to Mini

Thanks for helping with a small, hackable Chromium browser.

Canonical remote is Origin: [puvaanraaj/mini-browser](https://origin.cursor.com/puvaanraaj/mini-browser). Install the [Origin CLI](https://origin.cursor.com) (`origin`) so you can clone and open pull requests.

## Setup (macOS)

You need Node 20+ and Xcode command line tools.

```bash
origin repo clone puvaanraaj/mini-browser mini-browser
cd mini-browser
npm install
npm run dev
```

```bash
npm test
npx tsc --noEmit
npm run dist:mac
```

`npm run dist:mac` writes `release/mac/Mini.app`. The first launch of an unsigned build may need System Settings → Privacy & Security.

## Layout

| Path | What it is |
| --- | --- |
| `src/main/` | Electron main process, menus, tab Chromium views |
| `src/preload/` | IPC bridge (`window.mini`) |
| `src/renderer/` | Window chrome (React) |
| `src/components/` | Toolbar, tabs, start page, authenticator |
| `src/lib/totp.ts` | TOTP generation |
| `extension/` | Manifest V3 authenticator, loaded into the guest session |

Pages run in an **in-memory** Chromium partition. Authenticator secrets stay in Mini's renderer storage and survive **Reset Session**.

## Pull requests

Work on a branch, then open a change against `main`:

```bash
git checkout -b your-change
git commit -am "Describe the change"
git push -u origin your-change
origin pr create --title "Describe the change" --body "What you changed and how you tried it."
```

- Keep the chrome thin. New features should earn their pixels.
- Match the existing TypeScript / React style.
- Do not persist guest-session cookies by default.
- Do not send authenticator secrets off-device.
