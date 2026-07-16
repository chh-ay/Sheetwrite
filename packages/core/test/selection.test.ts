import { describe, expect, it } from "bun:test";
import { SelectionModel } from "../src/selection.js";
import type { Selection } from "../src/types.js";

describe("SelectionModel", () => {
  it("reports a single cell", () => {
    const s = new SelectionModel(100, 0, 2);
    s.selectCell(3, 1);
    expect(s.toSelection("s")).toEqual({ kind: "cell", addr: { sheet: "s", row: 3, col: 1 } });
    expect(s.contains(3, 1)).toBe(true);
    expect(s.contains(3, 0)).toBe(false);
    expect(s.focusCell).toEqual({ row: 3, col: 1 });
  });

  it("builds a range via anchor + extend", () => {
    const s = new SelectionModel(100, 0, 2);
    s.selectCell(1, 0);
    s.extendTo(3, 2);
    expect(s.toSelection("s")).toEqual({
      kind: "range",
      range: { sheet: "s", start: { row: 1, col: 0 }, end: { row: 3, col: 2 } },
    });
    expect(s.contains(2, 1)).toBe(true);
    expect(s.contains(4, 1)).toBe(false);
  });

  it("selects a whole column", () => {
    const s = new SelectionModel(10, 0, 2);
    s.selectColumn(1);
    expect(s.toSelection("s")).toEqual({ kind: "column", sheet: "s", col: 1 });
    expect(s.contains(9, 1)).toBe(true);
    expect(s.contains(9, 0)).toBe(false);
  });

  it("accumulates additive regions into a multi selection", () => {
    const s = new SelectionModel(100, 0, 2);
    s.selectCell(0, 0);
    s.selectCell(5, 2, true);
    const sel = s.toSelection("s");
    expect(sel?.kind).toBe("multi");
    expect(s.contains(0, 0)).toBe(true);
    expect(s.contains(5, 2)).toBe(true);
    expect(s.contains(3, 1)).toBe(false);
  });

  it("accepts every public selection shape through set()", () => {
    const cases: Array<{ input: Selection | null; expected: Selection | null }> = [
      { input: null, expected: null },
      {
        input: { kind: "row", sheet: "s", row: 4 },
        expected: { kind: "row", sheet: "s", row: 4 },
      },
      {
        input: { kind: "column", sheet: "s", col: 1 },
        expected: { kind: "column", sheet: "s", col: 1 },
      },
      {
        input: {
          kind: "range",
          range: { sheet: "s", start: { row: 5, col: 2 }, end: { row: 2, col: 0 } },
        },
        expected: {
          kind: "range",
          range: { sheet: "s", start: { row: 2, col: 0 }, end: { row: 5, col: 2 } },
        },
      },
      {
        input: {
          kind: "multi",
          ranges: [
            { sheet: "s", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
            { sheet: "s", start: { row: 7, col: 2 }, end: { row: 7, col: 2 } },
          ],
        },
        expected: {
          kind: "multi",
          ranges: [
            { sheet: "s", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } },
            { sheet: "s", start: { row: 7, col: 2 }, end: { row: 7, col: 2 } },
          ],
        },
      },
    ];

    for (const { input, expected } of cases) {
      const selection = new SelectionModel(100, 0, 2);
      selection.set(input);
      expect(selection.toSelection("s")).toEqual(expected);
    }
  });
});
