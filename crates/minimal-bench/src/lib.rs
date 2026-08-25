//! Strict benchmark schemas and deterministic summary statistics.

use serde::{Deserialize, Serialize};
use std::fmt;

pub const BENCHMARK_SCHEMA_VERSION: &str = "minimal-bench/v1";
pub const DEFAULT_BOOTSTRAP_RESAMPLES: u32 = 10_000;
pub const DEFAULT_BOOTSTRAP_SEED: u64 = 0x4d49_4e49_4d41_4c01;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MachineIdentity {
    pub hardware_model: String,
    pub cpu_model: String,
    pub physical_cores: u16,
    pub logical_cores: u16,
    pub memory_bytes: u64,
    pub os_name: String,
    pub os_version: String,
    pub os_build: String,
    pub architecture: String,
    pub power_source: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionMode {
    Cold,
    Warm,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BrowserIdentity {
    pub name: String,
    pub version: String,
    pub channel: String,
    pub executable_sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EngineIdentity {
    pub name: String,
    pub version: String,
    pub runtime_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BenchmarkSettings {
    pub profile_state: String,
    pub cache_state: String,
    pub network_profile: String,
    pub viewport_width_px: u32,
    pub viewport_height_px: u32,
    pub display_scale_percent: u16,
    pub extensions_enabled: bool,
    pub blocker_enabled: bool,
    pub telemetry_disabled: bool,
    pub notes: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RunMetadata {
    pub schema_version: String,
    pub benchmark_version: String,
    pub run_id: String,
    pub captured_at_utc: String,
    pub git_commit: String,
    pub execution_mode: ExecutionMode,
    pub machine: MachineIdentity,
    pub browser: BrowserIdentity,
    pub engine: EngineIdentity,
    pub settings: BenchmarkSettings,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StartupMilestone {
    Visible,
    Usable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BrowserBenchSuite {
    Speedometer,
    JetStream,
    MotionMark,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SiteMetric {
    FirstContentfulPaint,
    LargestContentfulPaint,
    DomContentLoaded,
    LoadEvent,
    TimeToInteractive,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum BenchmarkId {
    Startup {
        milestone: StartupMilestone,
    },
    Navigation {
        site_id: String,
    },
    TabSwitch {
        from_tabs: u16,
        to_tab: u16,
    },
    ProcessTreeMemory {
        tab_count: u16,
    },
    IdleCpu,
    IdleEnergy,
    PackageSize {
        artifact: String,
    },
    Blocker {
        workload: String,
    },
    BrowserBench {
        suite: BrowserBenchSuite,
        suite_version: String,
        subtest: String,
    },
    Site {
        site_id: String,
        metric: SiteMetric,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Unit {
    Milliseconds,
    Bytes,
    Percent,
    Joules,
    OperationsPerSecond,
    Score,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PreferredDirection {
    Lower,
    Higher,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RawCase {
    pub benchmark: BenchmarkId,
    pub unit: Unit,
    pub preferred_direction: PreferredDirection,
    pub samples: Vec<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RawRun {
    pub metadata: RunMetadata,
    pub cases: Vec<RawCase>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConfidenceInterval {
    pub lower: f64,
    pub upper: f64,
    pub confidence: f64,
    pub resamples: u32,
    pub seed: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Statistics {
    pub sample_count: usize,
    pub minimum: f64,
    pub p25: f64,
    pub median: f64,
    pub p75: f64,
    pub maximum: f64,
    pub median_bootstrap_ci: ConfidenceInterval,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResultCase {
    pub benchmark: BenchmarkId,
    pub unit: Unit,
    pub preferred_direction: PreferredDirection,
    pub statistics: Statistics,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResultRun {
    pub metadata: RunMetadata,
    pub cases: Vec<ResultCase>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BenchmarkError {
    UnsupportedSchemaVersion(String),
    EmptyRun,
    EmptySamples(usize),
    NonFiniteSample {
        case_index: usize,
        sample_index: usize,
    },
    ZeroBootstrapResamples,
    ComparisonMismatch(&'static str),
}

impl fmt::Display for BenchmarkError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedSchemaVersion(version) => {
                write!(formatter, "unsupported benchmark schema version: {version}")
            }
            Self::EmptyRun => formatter.write_str("benchmark run contains no cases"),
            Self::EmptySamples(index) => write!(formatter, "case {index} contains no samples"),
            Self::NonFiniteSample {
                case_index,
                sample_index,
            } => write!(
                formatter,
                "case {case_index} sample {sample_index} is not finite"
            ),
            Self::ZeroBootstrapResamples => {
                formatter.write_str("bootstrap resamples must be greater than zero")
            }
            Self::ComparisonMismatch(field) => {
                write!(formatter, "runs cannot be compared: {field} differs")
            }
        }
    }
}

impl std::error::Error for BenchmarkError {}

impl RawRun {
    /// Validates metadata and every recorded sample.
    ///
    /// # Errors
    ///
    /// Returns an error when the schema, case list, or any sample is invalid.
    pub fn validate(&self) -> Result<(), BenchmarkError> {
        validate_metadata(&self.metadata)?;
        if self.cases.is_empty() {
            return Err(BenchmarkError::EmptyRun);
        }
        for (case_index, case) in self.cases.iter().enumerate() {
            if case.samples.is_empty() {
                return Err(BenchmarkError::EmptySamples(case_index));
            }
            for (sample_index, sample) in case.samples.iter().enumerate() {
                if !sample.is_finite() {
                    return Err(BenchmarkError::NonFiniteSample {
                        case_index,
                        sample_index,
                    });
                }
            }
        }
        Ok(())
    }

    /// Computes percentile statistics and a deterministic bootstrap interval.
    ///
    /// # Errors
    ///
    /// Returns an error when the raw run is invalid or `resamples` is zero.
    pub fn summarize(&self, resamples: u32, seed: u64) -> Result<ResultRun, BenchmarkError> {
        self.validate()?;
        if resamples == 0 {
            return Err(BenchmarkError::ZeroBootstrapResamples);
        }
        let cases = self
            .cases
            .iter()
            .enumerate()
            .map(|(index, case)| ResultCase {
                benchmark: case.benchmark.clone(),
                unit: case.unit,
                preferred_direction: case.preferred_direction,
                statistics: statistics(&case.samples, resamples, seed.wrapping_add(index as u64)),
            })
            .collect();
        Ok(ResultRun {
            metadata: self.metadata.clone(),
            cases,
        })
    }
}

/// Checks whether two runs are valid for a same-machine comparison.
///
/// # Errors
///
/// Returns an error when either run is invalid or their schema, machine, or
/// execution mode differs.
pub fn validate_comparison(left: &RunMetadata, right: &RunMetadata) -> Result<(), BenchmarkError> {
    validate_metadata(left)?;
    validate_metadata(right)?;
    if left.schema_version != right.schema_version {
        return Err(BenchmarkError::ComparisonMismatch("schema_version"));
    }
    if left.benchmark_version != right.benchmark_version {
        return Err(BenchmarkError::ComparisonMismatch("benchmark_version"));
    }
    if left.machine != right.machine {
        return Err(BenchmarkError::ComparisonMismatch("machine"));
    }
    if left.execution_mode != right.execution_mode {
        return Err(BenchmarkError::ComparisonMismatch("execution_mode"));
    }
    if left.settings != right.settings {
        return Err(BenchmarkError::ComparisonMismatch("settings"));
    }
    Ok(())
}

fn validate_metadata(metadata: &RunMetadata) -> Result<(), BenchmarkError> {
    if metadata.schema_version != BENCHMARK_SCHEMA_VERSION {
        return Err(BenchmarkError::UnsupportedSchemaVersion(
            metadata.schema_version.clone(),
        ));
    }
    Ok(())
}

fn statistics(samples: &[f64], resamples: u32, seed: u64) -> Statistics {
    let mut sorted = samples.to_vec();
    sorted.sort_by(f64::total_cmp);
    let mut rng = SplitMix64::new(seed);
    let mut bootstrap_medians = Vec::with_capacity(resamples as usize);
    let mut resample = Vec::with_capacity(samples.len());
    for _ in 0..resamples {
        resample.clear();
        for _ in samples {
            resample.push(samples[rng.index(samples.len())]);
        }
        resample.sort_by(f64::total_cmp);
        bootstrap_medians.push(quantile_sorted(&resample, 0.5));
    }
    bootstrap_medians.sort_by(f64::total_cmp);
    Statistics {
        sample_count: sorted.len(),
        minimum: sorted[0],
        p25: quantile_sorted(&sorted, 0.25),
        median: quantile_sorted(&sorted, 0.5),
        p75: quantile_sorted(&sorted, 0.75),
        maximum: sorted[sorted.len() - 1],
        median_bootstrap_ci: ConfidenceInterval {
            lower: quantile_sorted(&bootstrap_medians, 0.025),
            upper: quantile_sorted(&bootstrap_medians, 0.975),
            confidence: 0.95,
            resamples,
            seed,
        },
    }
}

// Hyndman-Fan type 7, also used by R's default quantile implementation.
#[allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss
)]
fn quantile_sorted(sorted: &[f64], probability: f64) -> f64 {
    if sorted.len() == 1 {
        return sorted[0];
    }
    let position = probability * (sorted.len() - 1) as f64;
    let lower = position.floor() as usize;
    let upper = position.ceil() as usize;
    let fraction = position - lower as f64;
    sorted[lower] + (sorted[upper] - sorted[lower]) * fraction
}

struct SplitMix64(u64);

impl SplitMix64 {
    const fn new(seed: u64) -> Self {
        Self(seed)
    }

    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9e37_79b9_7f4a_7c15);
        let mut value = self.0;
        value = (value ^ (value >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        value = (value ^ (value >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        value ^ (value >> 31)
    }

    #[allow(clippy::cast_possible_truncation)]
    fn index(&mut self, length: usize) -> usize {
        (self.next() % length as u64) as usize
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::float_cmp)]

    use super::*;

    fn metadata() -> RunMetadata {
        RunMetadata {
            schema_version: BENCHMARK_SCHEMA_VERSION.into(),
            benchmark_version: "suite-1".into(),
            run_id: "run-1".into(),
            captured_at_utc: "2026-08-23T00:00:00Z".into(),
            git_commit: "0123456789abcdef".into(),
            execution_mode: ExecutionMode::Cold,
            machine: MachineIdentity {
                hardware_model: "Test Machine".into(),
                cpu_model: "Test CPU".into(),
                physical_cores: 4,
                logical_cores: 8,
                memory_bytes: 16_000_000_000,
                os_name: "TestOS".into(),
                os_version: "1.0".into(),
                os_build: "100".into(),
                architecture: "x86_64".into(),
                power_source: "ac".into(),
            },
            browser: BrowserIdentity {
                name: "Minimal".into(),
                version: "0.1.0".into(),
                channel: "dev".into(),
                executable_sha256: "abc".into(),
            },
            engine: EngineIdentity {
                name: "WebView2".into(),
                version: "1".into(),
                runtime_path: "system".into(),
            },
            settings: BenchmarkSettings {
                profile_state: "fresh".into(),
                cache_state: "empty".into(),
                network_profile: "offline".into(),
                viewport_width_px: 1280,
                viewport_height_px: 720,
                display_scale_percent: 100,
                extensions_enabled: false,
                blocker_enabled: true,
                telemetry_disabled: true,
                notes: String::new(),
            },
        }
    }

    fn run(samples: Vec<f64>) -> RawRun {
        RawRun {
            metadata: metadata(),
            cases: vec![RawCase {
                benchmark: BenchmarkId::Startup {
                    milestone: StartupMilestone::Visible,
                },
                unit: Unit::Milliseconds,
                preferred_direction: PreferredDirection::Lower,
                samples,
            }],
        }
    }

    #[test]
    fn calculates_interpolated_quartiles_and_median() {
        let result = run(vec![4.0, 1.0, 3.0, 2.0])
            .summarize(100, 7)
            .expect("summary");
        let stats = &result.cases[0].statistics;
        assert_eq!(stats.minimum, 1.0);
        assert_eq!(stats.p25, 1.75);
        assert_eq!(stats.median, 2.5);
        assert_eq!(stats.p75, 3.25);
        assert_eq!(stats.maximum, 4.0);
    }

    #[test]
    fn bootstrap_is_deterministic_for_seed() {
        let raw = run(vec![10.0, 20.0, 30.0, 40.0, 50.0]);
        let first = raw.summarize(1_000, 42).expect("first summary");
        let second = raw.summarize(1_000, 42).expect("second summary");
        assert_eq!(first, second);
        let ci = &first.cases[0].statistics.median_bootstrap_ci;
        assert!(ci.lower <= 30.0);
        assert!(ci.upper >= 30.0);
    }

    #[test]
    fn rejects_invalid_raw_data() {
        assert_eq!(run(vec![]).validate(), Err(BenchmarkError::EmptySamples(0)));
        assert_eq!(
            run(vec![f64::NAN]).validate(),
            Err(BenchmarkError::NonFiniteSample {
                case_index: 0,
                sample_index: 0
            })
        );
    }

    #[test]
    fn comparisons_require_same_machine_version_and_mode() {
        let left = metadata();
        let mut right = left.clone();
        right.browser.name = "Competitor".into();
        right.engine.name = "Other engine".into();
        assert_eq!(validate_comparison(&left, &right), Ok(()));

        right.machine.cpu_model = "Different CPU".into();
        assert_eq!(
            validate_comparison(&left, &right),
            Err(BenchmarkError::ComparisonMismatch("machine"))
        );

        let mut right = left.clone();
        right.benchmark_version = "suite-2".into();
        assert_eq!(
            validate_comparison(&left, &right),
            Err(BenchmarkError::ComparisonMismatch("benchmark_version"))
        );
    }

    #[test]
    fn schema_rejects_unknown_fields() {
        let json = serde_json::to_value(run(vec![1.0])).expect("serialize");
        let mut object = json.as_object().expect("object").clone();
        object.insert("surprise".into(), serde_json::Value::Bool(true));
        assert!(serde_json::from_value::<RawRun>(object.into()).is_err());
    }
}
