# Minimal for Windows

The Windows shell is a direct Win32 application written in Rust. It creates the
native frame, navigation controls, and new-tab view synchronously. The WebView2
environment is not requested until the first non-empty navigation is submitted.

## Security boundary

- Web content runs in the installed Evergreen WebView2 runtime.
- The shell does not inject scripts, expose host objects, or enable web messages.
- DevTools and host objects are disabled in the initial slice.
- Web permissions are denied until a native permission prompt is implemented.
- Navigation to non-HTTP(S)/`about:` schemes is cancelled.

The application uses the shared `minimal-core` navigation contract. Both x64 and
Arm64 Windows use the same source and target-scoped dependencies.

## Build

```powershell
cargo build --release --package minimal-windows
```

The Evergreen WebView2 runtime must be installed. Windows 11 includes it; the
eventual installer will carry Microsoft's runtime bootstrapper for supported
Windows 10 systems.

On non-Windows hosts, the package builds a small diagnostic stub so workspace
formatting, tests, and dependency checks remain available.
