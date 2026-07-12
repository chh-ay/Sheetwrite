/**
 * Regression check for the committed data benchmark baseline.
 *
 * Runs three complete Sheetwrite rounds with the same harness as data-bench.ts,
 * compares the best median for every cell against the committed baseline, and
 * reports any workload whose best median is more than 20% slower.
 */

import { readFileSync } from "node:fs";
import {
  runSheetwriteDataBench,
  SHEETWRITE_ROWS,
  type TimedEngineResult,
  WORKLOADS,
  type Workload,
} from "./data-bench.js";
import { ms } from "./stats.js";

// ── Configuration ────────────────────────────────────────────────────────────

const BASELINE_PATH = new URL("../results/data-results.json", import.meta.url);
const REGRESSION_THRESHOLD = 0.2;
const REGRESSION_RATIO = 1 + REGRESSION_THRESHOLD;
const CHECK_ROUNDS = 3;

// ── Baseline parsing ─────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function sheetwriteBaseline(root: unknown): Record<string, unknown> {
  const record = asRecord(root);
  const sheetwrite = asRecord(record?.sheetwrite);
  if (!sheetwrite) {
    throw new Error(`Baseline ${BASELINE_PATH.pathname} does not contain a sheetwrite result set`);
  }
  return sheetwrite;
}

function baselineMedian(
  baseline: Record<string, unknown>,
  rows: number,
  workload: Workload,
): number | undefined {
  const row = asRecord(baseline[String(rows)]);
  const stats = asRecord(row?.stats);
  const stat = asRecord(stats?.[workload]);
  const median = stat?.median;
  return typeof median === "number" && Number.isFinite(median) ? median : undefined;
}

// ── Comparison ───────────────────────────────────────────────────────────────

export interface ComparisonRow {
  readonly rows: number;
  readonly workload: Workload;
  readonly baselineMedian: number | undefined;
  readonly freshMedian: number | undefined;
  readonly roundMedians: readonly [number | undefined, number | undefined, number | undefined];
  readonly absoluteDelta: number | undefined;
  readonly ratio: number | undefined;
  readonly regression: boolean;
}

export function compareSheetwriteMedians(
  baselineRoot: unknown,
  freshRounds: readonly ReadonlyMap<number, TimedEngineResult>[],
): ComparisonRow[] {
  const baseline = sheetwriteBaseline(baselineRoot);
  const rows: ComparisonRow[] = [];

  for (const rowCount of SHEETWRITE_ROWS) {
    for (const workload of WORKLOADS) {
      const base = baselineMedian(baseline, rowCount, workload);
      const medianForRound = (index: number): number | undefined => {
        const median = freshRounds[index]?.get(rowCount)?.stats[workload]?.median;
        return median !== undefined && Number.isFinite(median) ? median : undefined;
      };
      const roundMedians: ComparisonRow["roundMedians"] = [
        medianForRound(0),
        medianForRound(1),
        medianForRound(2),
      ];
      const finiteMedians = roundMedians.filter((median): median is number => median !== undefined);
      const freshMedian = finiteMedians.length === 0 ? undefined : Math.min(...finiteMedians);
      const ratio =
        base !== undefined && base > 0 && freshMedian !== undefined
          ? freshMedian / base
          : undefined;
      rows.push({
        rows: rowCount,
        workload,
        baselineMedian: base,
        freshMedian,
        roundMedians,
        absoluteDelta:
          base !== undefined && freshMedian !== undefined ? freshMedian - base : undefined,
        ratio,
        regression: ratio !== undefined && ratio > REGRESSION_RATIO,
      });
    }
  }

  return rows;
}

// ── Reporting ────────────────────────────────────────────────────────────────

function status(row: ComparisonRow): string {
  if (row.regression) return "REGRESSION";
  if (row.baselineMedian === undefined) return "missing baseline";
  if (row.freshMedian === undefined) return "missing fresh";
  return "ok";
}

function printTable(rows: readonly ComparisonRow[]): void {
  const lines: string[] = [];
  lines.push(
    "| rows | workload | baseline | round 1 | round 2 | round 3 | best | absolute Δ | percent Δ | status |",
  );
  lines.push("|---:|:--|---:|---:|---:|---:|---:|---:|---:|:--|");
  for (const row of rows) {
    const baseline = row.baselineMedian === undefined ? "—" : ms(row.baselineMedian);
    const rounds = row.roundMedians.map((median) => (median === undefined ? "—" : ms(median)));
    const fresh = row.freshMedian === undefined ? "—" : ms(row.freshMedian);
    const absolute = row.absoluteDelta === undefined ? "—" : ms(row.absoluteDelta);
    const delta = row.ratio === undefined ? "—" : `${((row.ratio - 1) * 100).toFixed(1)}%`;
    lines.push(
      `| ${row.rows.toLocaleString("en-US")} | ${row.workload} | ${baseline} | ` +
        `${rounds.join(" | ")} | ${fresh} | ${absolute} | ${delta} | ${status(row)} |`,
    );
  }
  console.log(lines.join("\n"));
}

// ── Entry ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const strict = process.argv.includes("--strict");
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as unknown;
  const freshRounds: ReadonlyMap<number, TimedEngineResult>[] = [];
  for (let round = 1; round <= CHECK_ROUNDS; round++) {
    process.stderr.write(`\n◆ benchmark guard round ${round}/${CHECK_ROUNDS}\n`);
    freshRounds.push(await runSheetwriteDataBench());
  }
  const comparisons = compareSheetwriteMedians(baseline, freshRounds);
  const regressions = comparisons.filter((row) => row.regression);

  printTable(comparisons);

  const threshold = (REGRESSION_THRESHOLD * 100).toFixed(0);
  if (regressions.length === 0) {
    process.stderr.write(`\n✔ no Sheetwrite median regressions above ${threshold}%\n`);
    return;
  }

  process.stderr.write(
    `\n✖ ${regressions.length} Sheetwrite median regression(s) above ${threshold}%\n`,
  );
  if (strict) process.exitCode = 1;
}

if (import.meta.main) {
  await main();
}
