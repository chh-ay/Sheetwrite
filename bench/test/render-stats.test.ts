import { describe, expect, test } from "bun:test";
import { counterbalancedOrder, medianAbsoluteDeviation, summarizeFinite } from "../src/stats.js";

describe("auditable render statistics", () => {
  test("summarizes odd and even sample sizes", () => {
    expect(summarizeFinite([1, 3, 5])).toEqual({ median: 3, p95: 4.8, mad: 2, iters: 3 });
    expect(summarizeFinite([1, 2, 3, 4])).toEqual({
      median: 2.5,
      p95: 3.8499999999999996,
      mad: 1,
      iters: 4,
    });
  });

  test("keeps repeated values and outliers in the sample", () => {
    expect(medianAbsoluteDeviation([7, 7, 7, 7])).toBe(0);
    expect(summarizeFinite([1, 1, 1, 1_000])).toEqual({
      median: 1,
      p95: 850.1499999999996,
      mad: 0,
      iters: 4,
    });
  });

  test("rejects empty, negative, and non-finite samples", () => {
    expect(() => summarizeFinite([])).toThrow("must not be empty");
    expect(() => summarizeFinite([1, -1])).toThrow("finite non-negative");
    expect(() => summarizeFinite([1, Number.NaN])).toThrow("finite non-negative");
    expect(() => summarizeFinite([1, Number.POSITIVE_INFINITY])).toThrow("finite non-negative");
  });
});

describe("deterministic engine ordering", () => {
  test("uses a seeded AB/BA counterbalance", () => {
    const first = counterbalancedOrder(["sheetwrite", "handsontable"], 4, 0x51c0ffee);
    const second = counterbalancedOrder(["sheetwrite", "handsontable"], 4, 0x51c0ffee);
    expect(second).toEqual(first);
    expect(first[1]).toEqual([...first[0]!].reverse());
    expect(first[2]).toEqual(first[0]);
    expect(first[3]).toEqual(first[1]);
  });

  test("rejects invalid order configurations", () => {
    expect(() => counterbalancedOrder([], 1, 1)).toThrow("at least one");
    expect(() => counterbalancedOrder(["sheetwrite"], 0, 1)).toThrow("positive integer");
  });
});
