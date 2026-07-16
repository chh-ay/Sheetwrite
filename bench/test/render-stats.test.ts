import { describe, expect, test } from "bun:test";
import { counterbalancedOrder, medianAbsoluteDeviation, summarizeFinite } from "../src/stats.js";

describe("auditable render statistics", () => {
  test("summarizes odd and even sample sizes", () => {
    const odd = summarizeFinite([1, 3, 5]);
    expect(odd.median).toBe(3);
    expect(odd.p95).toBeCloseTo(4.8);
    expect(odd.mad).toBe(2);
    expect(odd.iters).toBe(3);

    const even = summarizeFinite([1, 2, 3, 4]);
    expect(even.median).toBe(2.5);
    expect(even.p95).toBeCloseTo(3.85);
    expect(even.mad).toBe(1);
    expect(even.iters).toBe(4);
  });

  test("keeps repeated values and outliers in the sample", () => {
    expect(medianAbsoluteDeviation([7, 7, 7, 7])).toBe(0);
    const summary = summarizeFinite([1, 1, 1, 1_000]);
    expect(summary.median).toBe(1);
    expect(summary.p95).toBeCloseTo(850.15);
    expect(summary.mad).toBe(0);
    expect(summary.iters).toBe(4);
  });

  test("rejects empty, negative, and non-finite samples", () => {
    expect(() => summarizeFinite([])).toThrow("must not be empty");
    expect(() => summarizeFinite([1, -1])).toThrow("finite non-negative");
    expect(() => summarizeFinite([1, Number.NaN])).toThrow("finite non-negative");
    expect(() => summarizeFinite([1, Number.POSITIVE_INFINITY])).toThrow("finite non-negative");
  });
});

describe("deterministic engine ordering", () => {
  test("balances three engines across positions while retaining seed sensitivity", () => {
    const engines = ["sheetwrite", "handsontable", "third-party"] as const;
    const orders = [1, 2].map((seed) => counterbalancedOrder(engines, engines.length * 2, seed));

    for (const seededOrders of orders) {
      expect(seededOrders).toHaveLength(6);
      for (let position = 0; position < engines.length; position++) {
        const counts = new Map(engines.map((engine) => [engine, 0]));
        for (const order of seededOrders) {
          const engine = order[position]!;
          counts.set(engine, counts.get(engine)! + 1);
        }
        expect([...counts.values()]).toEqual([2, 2, 2]);
      }
    }
    expect(orders[0]![0]).not.toEqual(orders[1]![0]);
  });

  test("rejects invalid order configurations", () => {
    expect(() => counterbalancedOrder([], 1, 1)).toThrow("at least one");
    expect(() => counterbalancedOrder(["sheetwrite"], 0, 1)).toThrow("positive integer");
  });
});
