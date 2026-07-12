import { describe, expect, it } from "bun:test";
import { SelectionModel } from "../src/selection.js";

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

  it("round-trips through set()", () => {
    const s = new SelectionModel(100, 0, 2);
    const sel = {
      kind: "range",
      range: { sheet: "s", start: { row: 2, col: 1 }, end: { row: 4, col: 2 } },
    } as const;
    s.set(sel);
    expect(s.toSelection("s")).toEqual(sel);
  });
});
