import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(resolve(repoRoot, "chromium/manifest.json"), "utf8"));

export function configuration(environment = process.env) {
  const workspace = resolve(environment.MINIMAL_CHROMIUM_WORKSPACE ?? resolve(repoRoot, "..", "minimal-chromium-workspace"));
  const depotTools = resolve(environment.DEPOT_TOOLS ?? resolve(workspace, "depot_tools"));
  const source = resolve(workspace, "src");
  return {
    workspace,
    depotTools,
    source,
    output: resolve(source, manifest.buildDirectory),
    argsFile: resolve(repoRoot, manifest.argsFile),
  };
}

export function validateManifest(value = manifest) {
  if (value.schemaVersion !== 1) throw new Error("Unsupported Chromium manifest schema.");
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(value.chromiumVersion)) throw new Error("Chromium version must be exact.");
  if (!/^[a-f0-9]{40}$/.test(value.chromiumRevision)) throw new Error("Chromium revision must be a full commit SHA.");
  if (!Number.isFinite(value.minimumFreeDiskGb) || value.minimumFreeDiskGb < 100) throw new Error("Chromium disk floor is unsafe.");
  return value;
}

export function platformEnvironment(environment = process.env, platform = process.platform, pathExists = existsSync) {
  const result = { ...environment };
  const standardXcode = "/Applications/Xcode.app/Contents/Developer";
  if (platform === "darwin" && !result.DEVELOPER_DIR && pathExists(standardXcode)) {
    result.DEVELOPER_DIR = standardXcode;
  }
  return result;
}

function run(command, args, options = {}) {
  const rendered = [command, ...args].map((part) => JSON.stringify(part)).join(" ");
  if (options.dryRun) {
    console.log(`[dry-run] ${options.cwd ?? process.cwd()}: ${rendered}`);
    return;
  }
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}.`);
}

function executable(name, config) {
  const suffix = process.platform === "win32" ? ".bat" : "";
  return resolve(config.depotTools, `${name}${suffix}`);
}

function freeDiskGb(path) {
  const target = existsSync(path) ? path : dirname(path);
  const output = execFileSync("df", ["-Pk", target], { encoding: "utf8" }).trim().split("\n").at(-1);
  const fields = output.trim().split(/\s+/);
  return Number(fields[3]) / 1024 / 1024;
}

function doctor(config, { dryRun }) {
  validateManifest();
  const environment = platformEnvironment();
  for (const command of ["git", "python3"]) {
    const probe = spawnSync(command, ["--version"], { env: environment, stdio: "ignore", shell: process.platform === "win32" });
    if (probe.status !== 0) throw new Error(`${command} is required.`);
  }
  if (process.platform === "darwin") {
    const probe = spawnSync("xcodebuild", ["-version"], { env: environment, encoding: "utf8" });
    if (probe.status !== 0) {
      const detail = `${probe.stderr ?? probe.stdout ?? ""}`.trim();
      throw new Error(`Full Xcode is required for Chromium macOS builds.${detail ? ` ${detail}` : ""}`);
    }
    const metalProbe = spawnSync("xcrun", ["--find", "metal"], { env: environment, stdio: "ignore" });
    if (metalProbe.status !== 0) {
      throw new Error("Xcode's Metal toolchain is required. Run: xcodebuild -downloadComponent MetalToolchain");
    }
  }
  const available = process.platform === "win32" ? null : freeDiskGb(config.workspace);
  if (available !== null && available < manifest.minimumFreeDiskGb) {
    throw new Error(`Chromium needs at least ${manifest.minimumFreeDiskGb} GB free; found ${available.toFixed(1)} GB.`);
  }
  console.log(JSON.stringify({
    chromiumVersion: manifest.chromiumVersion,
    chromiumRevision: manifest.chromiumRevision,
    workspace: config.workspace,
    availableDiskGb: available === null ? "not checked on Windows" : Number(available.toFixed(1)),
    dryRun,
  }, null, 2));
}

function bootstrap(config, options) {
  doctor(config, options);
  mkdirSync(config.workspace, { recursive: true });
  if (!existsSync(config.depotTools)) {
    run("git", ["clone", manifest.depotToolsRepository, config.depotTools], options);
  }
  ensureDepotTools(config, options);
  if (!existsSync(config.source)) {
    const gclientConfig = `solutions = [\n  {\n    "name": "src",\n    "url": "${manifest.sourceRepository}",\n    "deps_file": "DEPS",\n    "managed": False,\n    "custom_deps": {},\n    "custom_vars": { "checkout_pgo_profiles": True },\n    "safesync_url": ""\n  }\n]\ntarget_os = []\n`;
    if (options.dryRun) console.log(`[dry-run] write ${resolve(config.workspace, ".gclient")}`);
    else writeFileSync(resolve(config.workspace, ".gclient"), gclientConfig, { flag: "wx" });
  }
  sync(config, { ...options, allowMissingSource: true });
}

function ensureDepotTools(config, options) {
  const command = process.platform === "win32"
    ? resolve(config.depotTools, "bootstrap", "win_tools.bat")
    : resolve(config.depotTools, "ensure_bootstrap");
  run(command, [], { ...options, cwd: config.depotTools, env: toolEnvironment(config) });
}

function sync(config, options) {
  if (!existsSync(config.source) && !options.dryRun && !options.allowMissingSource) throw new Error("Run chromium:bootstrap first.");
  run(executable("gclient", config), ["sync", "--nohooks", "--no-history", "--revision", `src@${manifest.chromiumRevision}`], {
    ...options,
    cwd: config.workspace,
    env: toolEnvironment(config),
  });
  run(executable("gclient", config), ["runhooks"], { ...options, cwd: config.workspace, env: toolEnvironment(config) });
}

function generate(config, options) {
  if (!existsSync(config.source) && !options.dryRun) throw new Error("Run chromium:bootstrap first.");
  const args = readFileSync(config.argsFile, "utf8");
  run(executable("gn", config), ["gen", config.output, `--args=${args}`], {
    ...options,
    cwd: config.source,
    env: toolEnvironment(config),
  });
  run(executable("gn", config), ["args", config.output, "--list", "--short"], {
    ...options,
    cwd: config.source,
    env: toolEnvironment(config),
  });
}

function build(config, options) {
  if (!existsSync(config.output) && !options.dryRun) throw new Error("Run chromium:gen first.");
  run(executable("autoninja", config), ["-C", config.output, manifest.buildTarget], {
    ...options,
    cwd: config.source,
    env: toolEnvironment(config),
  });
}

function toolEnvironment(config) {
  const environment = platformEnvironment();
  return { ...environment, PATH: `${config.depotTools}${delimiter}${environment.PATH ?? ""}`, DEPOT_TOOLS_UPDATE: "0" };
}

export function main(argv = process.argv.slice(2)) {
  const command = argv.find((argument) => !argument.startsWith("--")) ?? "doctor";
  const options = { dryRun: argv.includes("--dry-run") };
  const config = configuration();
  if (command === "doctor") return doctor(config, options);
  if (command === "bootstrap") return bootstrap(config, options);
  if (command === "sync") return sync(config, options);
  if (command === "gen") return generate(config, options);
  if (command === "build") return build(config, options);
  throw new Error(`Unknown Chromium command: ${command}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { main(); } catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
}
