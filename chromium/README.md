# Minimal Chromium core

This directory pins and configures the standalone Chromium distribution that
will become Minimal 2.x. The Chromium checkout and build products stay outside
this repository because they require hundreds of gigabytes and have their own
Git history.

```bash
npm run chromium:doctor
npm run chromium:bootstrap
npm run chromium:gen
npm run chromium:build
```

Set `MINIMAL_CHROMIUM_WORKSPACE` to override the default sibling directory
`../minimal-chromium-workspace`. The bootstrap is pinned to the exact version
and revision in `manifest.json`; it never follows Chromium `main` implicitly.

After building, compare the resulting browser with the same clean-profile
workload used for Chrome and Firefox:

```bash
MINIMAL_CHROMIUM_EXECUTABLE=../minimal-chromium-workspace/src/out/MinimalPerformance/Chromium.app/Contents/MacOS/Chromium \
  npm run benchmark:market
```

Do not add speculative flags or remove sandbox/security features for speed.
Runtime changes require repeatable performance evidence plus browser tests.
