# minimal-blocker

Pure Rust, host-only ad/tracker matching for Minimal's native shells.

## Contract

- Rules are normalized lowercase ASCII hosts.
- Matching checks the exact host and each dot-delimited suffix in a `HashSet`.
  `ads.example.com` matches `example.com`; `notexample.com` does not.
- No URL substring scan, regular expression engine, network fetch, or page-engine
  callback exists in this crate.
- Unicode input is rejected. The native page engine must supply its canonical
  ASCII host serialization. Punycode labels such as `xn--bcher-kva.example`
  are accepted. This deliberately avoids platform-specific IDNA drift.
- IP-address rules are rejected. The blocker is for DNS host labels.
- Compiled cache JSON has a schema version, caller-supplied source freshness,
  a checked rule count, and lexically sorted hosts. Identical inputs and
  metadata serialize to identical bytes.

Legacy import accepts the previous JSON string array, object arrays named
`hosts`, `rules`, or `blockedHosts`, plain host lines, hosts-file mappings, and
EasyList-style `||host^` entries. Unsupported filter syntax is ignored; malformed
host-looking entries are reported so migration cannot silently lose them.

## Benchmark

Run an optimized deterministic 100,000-rule, 50/50 hit/miss workload:

```sh
cargo run --release -p minimal-blocker --bin blocker-bench
```

The engineering target is a median below **1 microsecond per lookup** on release
hardware used for Minimal's supported macOS and Windows release gates. This is
not asserted in unit tests: shared CI timing is noisy. Release evidence must
record the machine, OS, compiler, raw samples, median, and commit before claiming
the target or comparing against another browser.
