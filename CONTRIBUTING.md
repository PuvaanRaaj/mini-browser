# Contributing to Minimal

Thank you for helping build a focused, secure, and measurable browser.

## Before you start

- Use [GitHub Issues](https://github.com/PuvaanRaaj/mini-browser/issues) for bugs and focused feature proposals.
- Discuss large UI, security, storage, or Chromium-core changes before implementation.
- Never attach real passwords, cookies, OAuth tokens, TOTP seeds, QR codes, or private browsing history.
- Keep the interface compact. New controls should solve a clear, common problem.

## Development setup

Requirements:

- Node.js 22+
- npm
- macOS or Windows for desktop integration testing

```bash
git clone https://github.com/PuvaanRaaj/mini-browser.git
cd mini-browser
npm install
npm run dev
```

Before opening a pull request, run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run check:bundle
npm run vercel-build
```

Run the platform package command when your change affects Electron, native permissions, passkeys, packaging, or release resources:

```bash
npm run dist:mac   # macOS Apple Silicon
npm run dist:win   # Windows x64
```

## Standalone Chromium development

The Chromium checkout lives outside this repository and requires substantial disk space. Read [chromium/README.md](chromium/README.md) first.

On macOS, install full Xcode and its Metal compiler:

```bash
xcodebuild -downloadComponent MetalToolchain
npm run chromium:doctor
```

Then use the pinned workflow:

```bash
npm run chromium:bootstrap
npm run chromium:gen
npm run chromium:build
```

Do not remove the sandbox or security features for benchmark gains. A performance change needs repeated clean-profile measurements and must pass the non-negotiable gates in `chromium/performance-gates.json`.

## Architecture boundaries

| Path | Responsibility |
| --- | --- |
| `src/main/` | Privileged desktop code, tab views, vault, security policy, IPC handlers |
| `src/preload/` | Small typed bridge exposed as `window.mini` |
| `src/components/` | Unprivileged React interface |
| `src/lib/` | Shared pure logic and types |
| `extension/` | Bundled Manifest V3 authenticator |
| `chromium/` | Reproducible standalone Chromium configuration |
| `website/` | Download site and changelog pages |

Security rules:

- Keep `contextIsolation` and renderer sandboxing enabled.
- Validate every privileged IPC sender and every untrusted argument.
- Keep passwords, TOTP seeds, and OAuth tokens in the main-process OS-backed vault.
- Fail closed if secure encryption is unavailable.
- Do not upload page captures or authenticator QR images. Clear temporary image data after decoding.
- Fill credentials only on the exact saved HTTPS origin.
- Do not make website sessions persistent by default.

## Pull requests

1. Create a focused branch from the latest `main`.
2. Add or update tests for behavior changes.
3. Update `CHANGELOG.md` for user-visible work.
4. Keep generated files and local benchmark data out of the commit.
5. Explain the problem, approach, security impact, and verification in the PR description.

Use conventional commits so Release Please can determine the next version:

```text
feat(authenticator): scan QR codes from page captures
fix(tabs): preserve active tab after close
docs(contributing): clarify Chromium prerequisites
```

Prefer one concern per pull request. Maintainers may ask to split unrelated changes.

## Reporting security issues

Do not open a public issue for a vulnerability that could expose secrets or bypass browser isolation. Use GitHub's private vulnerability reporting for this repository when available, or contact the maintainer privately through the profile listed on GitHub. Include a minimal reproduction with synthetic data only.

## Helping the repository grow

GitHub Trending has no guaranteed public formula. Sustainable visibility comes from useful releases and genuine community activity—not artificial stars or spam.

Helpful contributions include:

- Ship a small, reliable release with clear notes and working macOS/Windows downloads.
- Add a short demo video or GIF that shows focus mode, QR import, and private-session behavior.
- Improve the repository description, social preview, and relevant topics such as `browser`, `chromium`, `electron`, `privacy`, `totp`, and `password-manager`.
- Create well-scoped `good first issue` and `help wanted` tickets with reproduction steps and acceptance criteria.
- Publish honest, reproducible benchmark results with hardware, browser versions, profiles, and raw output.
- Share releases in relevant developer communities only when they solve the audience's problem; answer questions and bring feedback back as issues.
- Keep a predictable changelog and release cadence so visitors can see that the project is maintained.
- Star, watch, fork, or share the project only when you genuinely find it useful.

Do not buy stars, use bots, exchange stars, mass-mention users, or post repetitive promotional comments. Those tactics damage trust and can violate platform rules.

Maintainers should measure healthy growth with release downloads, returning contributors, issue response time, benchmark reproducibility, and visitor-to-install conversion—not stars alone.
