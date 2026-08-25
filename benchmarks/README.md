# Minimal benchmark protocol

Benchmark claims are valid only for the exact machine, operating system,
browser versions, settings, workload, and date recorded with the raw samples.
Results from different machines or benchmark versions must not be ranked.

## Tracks

1. **Product default:** clean profiles and default settings. Minimal keeps its
   built-in blocker enabled. This measures the experience users receive.
2. **Engine isolated:** extensions and blockers disabled in every browser. This
   diagnoses the platform engine rather than the surrounding browser shell.

## Controlled suite

- Cold and warm launch to visible native chrome and a focused, usable omnibox.
- First and repeat navigation against deterministic local fixtures.
- Tab-switch input to first presented frame.
- Whole process-tree private/resident memory at 1, 5, 10, and 20 tabs.
- Ten-minute background CPU, wakeups, and energy impact.
- Installed and compressed artifact size.
- Blocker lookup latency and request/byte reduction.
- Speedometer 3.1, JetStream 3.0, and MotionMark 1.3.1 at 60 Hz.
- Landing-site Lighthouse and WebPageTest first/repeat view.

Use ten independently restarted samples, randomize browser order, keep the
machine plugged in with Low Power Mode disabled, and report median, p25-p75,
and bootstrap 95% confidence intervals. Store every raw sample and exact engine
version. Speedometer/JetStream/MotionMark are engine diagnostics; native-shell
work should be judged primarily by startup, memory, energy, and package metrics.

## Gates

- Pull requests: deterministic correctness and blocker microbench smoke checks.
- Nightly/release runners: full native startup, navigation, memory, and site
  runs on fixed machines.
- Initial regression alert: more than 5% for latency or synthetic scores and
  more than 10% for memory, only when supported by the retained samples.
- A public "fastest" statement requires a dated, same-machine result with raw
  data and confidence intervals. Otherwise use the narrower phrase "faster in
  our test" and name the measured workload.

The first Electron artifact below is a build-size control, not a cross-browser
performance claim. Native runtime and competitor measurements remain pending
until the automation can produce comparable samples.
