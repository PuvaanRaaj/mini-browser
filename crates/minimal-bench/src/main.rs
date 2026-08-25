use minimal_bench::{DEFAULT_BOOTSTRAP_RESAMPLES, DEFAULT_BOOTSTRAP_SEED, RawRun};
use std::{env, error::Error, fs, path::Path};

fn main() {
    if let Err(error) = run() {
        eprintln!("minimal-bench: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn Error>> {
    let arguments: Vec<String> = env::args().skip(1).collect();
    match arguments.as_slice() {
        [command, input] if command == "validate" => {
            let run = read_run(input)?;
            run.validate()?;
            println!("valid: {} case(s)", run.cases.len());
        }
        [command, input, output] if command == "summarize" => {
            let run = read_run(input)?;
            let result = run.summarize(DEFAULT_BOOTSTRAP_RESAMPLES, DEFAULT_BOOTSTRAP_SEED)?;
            let json = serde_json::to_string_pretty(&result)?;
            fs::write(output, format!("{json}\n"))?;
            println!("summarized: {} case(s) -> {output}", result.cases.len());
        }
        _ => {
            return Err(
                "usage: minimal-bench validate <raw.json> | summarize <raw.json> <result.json>"
                    .into(),
            );
        }
    }
    Ok(())
}

fn read_run(path: impl AsRef<Path>) -> Result<RawRun, Box<dyn Error>> {
    let bytes = fs::read(path)?;
    Ok(serde_json::from_slice(&bytes)?)
}
