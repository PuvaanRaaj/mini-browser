use std::hint::black_box;
use std::time::{Duration, Instant};

use minimal_blocker::Blocker;

const RULE_COUNT: usize = 100_000;
const LOOKUPS_PER_SAMPLE: usize = 200_000;
const LOOKUPS_PER_SAMPLE_F64: f64 = 200_000.0;
const SAMPLE_COUNT: usize = 11;

fn main() {
    let rules: Vec<_> = (0..RULE_COUNT)
        .map(|index| format!("tracker{index:06}.bench.test"))
        .collect();
    let blocker = Blocker::compile(rules).expect("generated hosts are valid");
    let queries: Vec<_> = (0..4_096)
        .map(|index| {
            if index % 2 == 0 {
                format!("asset.tracker{:06}.bench.test", index % RULE_COUNT)
            } else {
                format!("content{index:06}.allowed.test")
            }
        })
        .collect();

    let mut samples = Vec::with_capacity(SAMPLE_COUNT);
    for _ in 0..SAMPLE_COUNT {
        let started = Instant::now();
        let mut hit_count = 0_usize;
        for index in 0..LOOKUPS_PER_SAMPLE {
            hit_count += usize::from(
                black_box(&blocker).is_blocked(black_box(&queries[index % queries.len()])),
            );
        }
        black_box(hit_count);
        samples.push(started.elapsed());
    }
    samples.sort_unstable();
    let median = samples[SAMPLE_COUNT / 2];

    println!("rules={RULE_COUNT}");
    println!("lookups_per_sample={LOOKUPS_PER_SAMPLE}");
    println!("samples={SAMPLE_COUNT}");
    println!("median_sample_ms={:.3}", millis(median));
    println!(
        "median_ns_per_lookup={:.1}",
        median.as_secs_f64() * 1_000_000_000.0 / LOOKUPS_PER_SAMPLE_F64
    );
}

fn millis(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1_000.0
}
