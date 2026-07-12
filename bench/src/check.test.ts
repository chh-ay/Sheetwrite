import { expect, test } from "bun:test";
import { compareSheetwriteMedians } from "./check.js";
import { SHEETWRITE_ROWS, type TimedEngineResult } from "./data-bench.js";

const stat = (median: number) => ({
  median,
  p95: median,
  mean: median,
  stddev: 0,
  min: median,
  max: median,
  iters: 1,
});

const stats = (median: number): TimedEngineResult["stats"] => ({
  ingest: stat(median),
  windowRead: stat(median),
  edit: stat(median),
  sort: stat(median),
  filter: stat(median),
  aggregate: stat(median),
});

function round(median: number): Map<number, TimedEngineResult> {
  return new Map(
    SHEETWRITE_ROWS.map((rows) => [
      rows,
      {
        rows,
        stats: stats(median),
        notes: {},
      },
    ]),
  );
}

const baseline = {
  sheetwrite: Object.fromEntries(SHEETWRITE_ROWS.map((rows) => [rows, { stats: stats(10) }])),
};

test("records every round while comparing the best median", () => {
  const comparisons = compareSheetwriteMedians(baseline, [round(13), round(11), round(12)]);
  expect(comparisons).toHaveLength(30);
  expect(comparisons[0]).toMatchObject({
    baselineMedian: 10,
    roundMedians: [13, 11, 12],
    freshMedian: 11,
    absoluteDelta: 1,
    ratio: 1.1,
    regression: false,
  });
});

test("keeps the fixed strict-greater-than twenty-percent comparison", () => {
  const atThreshold = compareSheetwriteMedians(baseline, [round(12), round(12), round(12)]);
  const overThreshold = compareSheetwriteMedians(baseline, [round(13), round(13), round(13)]);
  expect(atThreshold.every((row) => !row.regression)).toBe(true);
  expect(overThreshold.every((row) => row.regression)).toBe(true);
});
