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

On macOS, install full Xcode and its separately distributed Metal compiler. The
doctor reports the exact command when that component is missing:

```bash
xcodebuild -downloadComponent MetalToolchain
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

## Remote macOS build

GitHub's standard and larger hosted macOS runners expose only 14 GB of SSD,
which is below this project's 180 GB preflight floor. The manual
`chromium-macos.yml` workflow therefore targets a remote self-hosted Apple
Silicon Mac with these labels:

```text
self-hosted, macOS, ARM64, remote-minimal-chromium
```

The remote runner needs full Xcode, at least 180 GB free, and should be a cloud
or dedicated build machine—not a contributor's daily-use laptop. Set the
optional repository variable `MINIMAL_CHROMIUM_WORKSPACE` when its large build
volume is outside the runner work directory. The workflow uploads a seven-day
artifact and deletes the remote checkout by default after the upload succeeds.
