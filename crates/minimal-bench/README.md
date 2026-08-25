# minimal-bench

Versioned benchmark data contracts and deterministic statistical summaries for
Minimal Browser. The crate deliberately does not launch or automate browsers;
platform harnesses emit raw samples and this crate validates and summarizes
them.

Validate a raw run:

```sh
cargo run -p minimal-bench -- validate raw-run.json
```

Summarize a raw run using 10,000 deterministic bootstrap resamples:

```sh
cargo run -p minimal-bench -- summarize raw-run.json summary.json
```

Comparison is rejected unless the benchmark schema version, machine identity,
and execution mode match. Browser, engine, settings, and commit fields remain in
every run so published comparisons are auditable.
