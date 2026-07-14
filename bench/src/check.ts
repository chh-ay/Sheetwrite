import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type ControlledRenderBaseline,
  parseControlledBaseline,
  samplesByControlledCell,
} from "./controlled-baseline.js";
import {
  type ControlledRunnerFingerprint,
  computeHarnessFingerprint,
  fingerprintMismatches,
  type HarnessFingerprint,
  MATRIX_IDS,
} from "./gate-protocol.js";
import { validateRenderGateArtifact } from "./render-gate.js";
import type { RenderBenchmarkArtifact } from "./render-protocol.js";
import { ms, summarizeFinite } from "./stats.js";

const BENCH_ROOT = new URL("..", import.meta.url).pathname;
const DEFAULT_BASELINE_PATH = resolve(BENCH_ROOT, "results/render-baseline.json");
const DEFAULT_FRESH_PATH = resolve(BENCH_ROOT, "results/render-fresh.json");
const FRESH_RESULT_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
export const CONTROLLED_SAMPLING_FINGERPRINT =
  "measured=3;warmup=1;minimum-sample-ms=100;order-seed=0x51c0ffee";

export interface ControlledComparisonRow {
  readonly key: string;
  readonly baselineMedian: number;
  readonly baselineP95: number;
  readonly baselineMad: number;
  readonly freshMedian: number;
  readonly freshP95: number;
  readonly freshMad: number;
  readonly absoluteDelta: number;
  readonly ratio: number;
  readonly ratioLimit: number;
  readonly absoluteFloorMs: number;
  readonly regression: boolean;
}

export interface ControlledComparisonInput {
  readonly baseline: ControlledRenderBaseline;
  readonly fresh: RenderBenchmarkArtifact;
  readonly harness: HarnessFingerprint;
  readonly runner: ControlledRunnerFingerprint;
}

export function compareControlledRender(
  input: ControlledComparisonInput,
): ControlledComparisonRow[] {
  const baselineArtifact = parseControlledBaseline(input.baseline);
  const freshArtifact = validateRenderGateArtifact(input.fresh, "full", {
    rounds: input.fresh.metadata.rounds,
  });
  const harnessMismatches = fingerprintMismatches(
    baselineArtifact.harness,
    input.harness,
    "harness",
  );
  if (harnessMismatches.length > 0) {
    throw new Error(`protocol/harness mismatch:\n${harnessMismatches.join("\n")}`);
  }
  const runnerMismatches = fingerprintMismatches(baselineArtifact.runner, input.runner, "runner");
  if (runnerMismatches.length > 0) {
    throw new Error(`uncontrolled/unmatched runner:\n${runnerMismatches.join("\n")}`);
  }

  const freshSamples = samplesByControlledCell(freshArtifact);
  const baselineByKey = new Map(baselineArtifact.cells.map((cell) => [cell.key, cell]));
  const rows: ControlledComparisonRow[] = [];
  for (const [key, samples] of freshSamples) {
    const baseline = baselineByKey.get(key);
    if (!baseline) throw new Error(`missing baseline ${key}`);
    const fresh = summarizeFinite(samples);
    if (baseline.medianMs <= 0) {
      throw new Error(`${key} baseline median must be positive for a numeric comparison`);
    }
    const absoluteDelta = fresh.median - baseline.medianMs;
    const ratio = fresh.median / baseline.medianMs;
    rows.push({
      key,
      baselineMedian: baseline.medianMs,
      baselineP95: baseline.p95Ms,
      baselineMad: baseline.observedMadMs,
      freshMedian: fresh.median,
      freshP95: fresh.p95,
      freshMad: fresh.mad,
      absoluteDelta,
      ratio,
      ratioLimit: baseline.ratioLimit,
      absoluteFloorMs: baseline.absoluteFloorMs,
      regression: ratio > baseline.ratioLimit && absoluteDelta > baseline.absoluteFloorMs,
    });
  }
  return rows.sort((left, right) => left.key.localeCompare(right.key));
}

function argumentValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

function controlledRunner(
  fresh: RenderBenchmarkArtifact,
  powerMode: string,
  concurrency: number,
): ControlledRunnerFingerprint {
  if (powerMode.length === 0) throw new Error("--power-mode is required for a controlled check");
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error("--concurrency must be a positive integer for a controlled check");
  }
  return {
    os: fresh.metadata.os,
    arch: fresh.metadata.arch,
    cpu: fresh.metadata.cpu,
    bun: fresh.metadata.bunVersion,
    node: fresh.metadata.nodeVersion,
    browser: fresh.metadata.browserVersion,
    powerMode,
    concurrency,
  };
}

function printTable(rows: readonly ControlledComparisonRow[]): void {
  const lines = [
    "| cell | baseline median | baseline p95 | baseline MAD | fresh median | fresh p95 | fresh MAD | absolute Δ | ratio | limits | status |",
    "|:--|--:|--:|--:|--:|--:|--:|--:|--:|:--|:--|",
  ];
  for (const row of rows) {
    lines.push(
      `| ${row.key} | ${ms(row.baselineMedian)} | ${ms(row.baselineP95)} | ${ms(row.baselineMad)} | ${ms(row.freshMedian)} | ${ms(row.freshP95)} | ${ms(row.freshMad)} | ${ms(row.absoluteDelta)} | ${row.ratio.toFixed(3)}× | >${row.ratioLimit.toFixed(3)}× and >${ms(row.absoluteFloorMs)} | ${row.regression ? "REGRESSION" : "ok"} |`,
    );
  }
  console.log(lines.join("\n"));
}

function gitHead(): string {
  const result = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
    cwd: resolve(BENCH_ROOT, ".."),
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(`cannot identify current commit: ${result.stderr.toString().trim()}`);
  }
  return result.stdout.toString().trim();
}

export async function runCheck(args: readonly string[]): Promise<number> {
  const reportOnly = args.includes("--report-only");
  if (reportOnly) {
    process.stderr.write(
      "\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n" +
        "REPORT ONLY — NON-GATING PERFORMANCE DIAGNOSTIC\n" +
        "Invalid, incomplete, unmatched, and regressed results will be reported without failing.\n" +
        "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n\n",
    );
  }

  try {
    const baselinePath = resolve(argumentValue(args, "--baseline") ?? DEFAULT_BASELINE_PATH);
    const freshPath = resolve(argumentValue(args, "--fresh") ?? DEFAULT_FRESH_PATH);
    const powerMode = argumentValue(args, "--power-mode") ?? "";
    const concurrency = Number(argumentValue(args, "--concurrency") ?? Number.NaN);
    const baselineJson = readFileSync(baselinePath, "utf8");
    const freshJson = readFileSync(freshPath, "utf8");
    const baseline = parseControlledBaseline(JSON.parse(baselineJson) as unknown);
    const fresh = validateRenderGateArtifact(JSON.parse(freshJson) as unknown, "full", {
      nowMs: Date.now(),
      maxAgeMs: FRESH_RESULT_MAX_AGE_MS,
    });
    if (fresh.metadata.dirty)
      throw new Error("fresh controlled result was recorded from a dirty tree");
    const head = gitHead();
    if (fresh.metadata.commit !== head) {
      throw new Error(
        `stale controlled result commit: expected ${head}, observed ${fresh.metadata.commit}`,
      );
    }
    const harness = computeHarnessFingerprint(
      MATRIX_IDS.render.full,
      CONTROLLED_SAMPLING_FINGERPRINT,
    );
    const rows = compareControlledRender({
      baseline,
      fresh,
      harness,
      runner: controlledRunner(fresh, powerMode, concurrency),
    });
    printTable(rows);
    const regressions = rows.filter((row) => row.regression);
    if (regressions.length > 0) {
      process.stderr.write(`\n✖ ${regressions.length} controlled performance regression(s)\n`);
      return reportOnly ? 0 : 1;
    }
    process.stderr.write("\n✔ complete controlled performance result passed\n");
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`\n✖ performance gate invalid: ${message}\n`);
    return reportOnly ? 0 : 1;
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  process.exitCode = await runCheck(args);
}
