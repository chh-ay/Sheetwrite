import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CONTROLLED_SAMPLING_FINGERPRINT } from "./check.js";
import {
  buildControlledBaseline,
  CONTROLLED_BASELINE_MINIMUM_ROUNDS,
  stableBaselineJson,
} from "./controlled-baseline.js";
import {
  type ControlledRunnerFingerprint,
  computeHarnessFingerprint,
  MATRIX_IDS,
} from "./gate-protocol.js";
import type { RenderBenchmarkArtifact } from "./render-protocol.js";
import { parseRenderArtifact } from "./render-protocol.js";

const BENCH_ROOT = new URL("..", import.meta.url).pathname;
const REPOSITORY_ROOT = resolve(BENCH_ROOT, "..");
const DEFAULT_CANDIDATE_PATH = resolve(
  BENCH_ROOT,
  "results/candidates/render-baseline-candidate.json",
);
const DEFAULT_RAW_PATH = resolve(BENCH_ROOT, "results/candidates/render-baseline-raw.json");
const DEFAULT_APPROVED_PATH = resolve(BENCH_ROOT, "results/render-baseline.json");

function argumentValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

function gitOutput(args: readonly string[]): string {
  const result = Bun.spawnSync(["git", ...args], {
    cwd: REPOSITORY_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString().trim()}`);
  }
  return result.stdout.toString().trim();
}

function runCommand(command: readonly string[]): void {
  const result = Bun.spawnSync([...command], {
    cwd: BENCH_ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) {
    throw new Error(`${command.join(" ")} exited ${result.exitCode}`);
  }
}

function runnerFromArtifact(
  artifact: RenderBenchmarkArtifact,
  powerMode: string,
  concurrency: number,
): ControlledRunnerFingerprint {
  if (powerMode.length === 0) throw new Error("--power-mode is required");
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error("--concurrency must be a positive integer");
  }
  return {
    os: artifact.metadata.os,
    arch: artifact.metadata.arch,
    cpu: artifact.metadata.cpu,
    bun: artifact.metadata.bunVersion,
    node: artifact.metadata.nodeVersion,
    browser: artifact.metadata.browserVersion,
    powerMode,
    concurrency,
  };
}

export async function generateBaseline(args: readonly string[]): Promise<string> {
  const diagnostic = args.includes("--diagnostic");
  const writeBaseline = args.includes("--write-baseline");
  if (diagnostic && writeBaseline) {
    throw new Error("--diagnostic can produce review candidates only, not an approved baseline");
  }
  const dirty = gitOutput(["status", "--porcelain"]).length > 0;
  if (dirty && !diagnostic) {
    throw new Error(
      "baseline generation refuses a dirty tree; use --diagnostic for a non-approved candidate",
    );
  }
  if (dirty && writeBaseline) {
    throw new Error("an approved baseline cannot be written from a dirty tree");
  }

  const approvedPath = resolve(argumentValue(args, "--approved") ?? DEFAULT_APPROVED_PATH);
  const candidatePath = resolve(argumentValue(args, "--output") ?? DEFAULT_CANDIDATE_PATH);
  const targetPath = writeBaseline ? approvedPath : candidatePath;
  if (!writeBaseline && targetPath === approvedPath) {
    throw new Error("refusing to overwrite the approved baseline without --write-baseline");
  }
  const powerMode = argumentValue(args, "--power-mode") ?? "";
  const concurrency = Number(argumentValue(args, "--concurrency") ?? Number.NaN);
  const inputArgument = argumentValue(args, "--input");
  let rawPath: string;

  if (inputArgument) {
    rawPath = resolve(inputArgument);
  } else {
    rawPath = resolve(argumentValue(args, "--raw-output") ?? DEFAULT_RAW_PATH);
    const markdownPath = rawPath.replace(/\.json$/u, ".md");
    runCommand(["bun", "run", "bench:render:prepare"]);
    runCommand([
      "bun",
      "run",
      "src/render-driver.ts",
      "--rounds",
      String(CONTROLLED_BASELINE_MINIMUM_ROUNDS),
      "--output",
      rawPath,
      "--markdown-output",
      markdownPath,
    ]);
  }

  if (!existsSync(rawPath)) throw new Error(`raw controlled artifact does not exist: ${rawPath}`);
  const artifact = parseRenderArtifact(JSON.parse(readFileSync(rawPath, "utf8")) as unknown);
  if (artifact.metadata.dirty && !diagnostic) {
    throw new Error("raw controlled artifact was recorded from a dirty tree");
  }
  if (artifact.metadata.dirty && writeBaseline) {
    throw new Error("an approved baseline cannot use a dirty raw artifact");
  }
  if (!diagnostic) {
    const head = gitOutput(["rev-parse", "HEAD"]);
    if (artifact.metadata.commit !== head) {
      throw new Error(
        `stale controlled raw artifact commit: expected ${head}, observed ${artifact.metadata.commit}`,
      );
    }
  }
  const harness = computeHarnessFingerprint(
    MATRIX_IDS.render.full,
    CONTROLLED_SAMPLING_FINGERPRINT,
  );
  const baseline = buildControlledBaseline(
    artifact,
    harness,
    runnerFromArtifact(artifact, powerMode, concurrency),
    rawPath,
  );
  await Bun.write(targetPath, stableBaselineJson(baseline));
  if (!writeBaseline && existsSync(approvedPath)) {
    process.stderr.write(`approved baseline left unchanged: ${approvedPath}\n`);
  }
  process.stderr.write(
    `${writeBaseline ? "wrote approved baseline" : "wrote review candidate"}: ${targetPath}\n` +
      `raw rounds retained: ${rawPath}\n`,
  );
  return targetPath;
}

if (import.meta.main) {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  await generateBaseline(args);
}
