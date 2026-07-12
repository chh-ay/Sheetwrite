import { describe, expect, it } from "bun:test";
import { ColumnIndex } from "../src/column-index.js";
import { computeColumnWindow } from "../src/virtualization.js";

describe("ColumnIndex", () => {
  const idx = new ColumnIndex([0, 2, 5], [50, 75, 25]);

  it("maps absolute columns to visible positions and left edges", () => {
    expect(idx.count).toBe(3);
    expect(idx.totalWidth).toBe(150);
    expect(idx.positionOf(0)).toBe(0);
    expect(idx.positionOf(2)).toBe(1);
    expect(idx.positionOf(5)).toBe(2);
    expect(idx.positionOf(1)).toBe(-1);
    expect(idx.positionOf(9)).toBe(-1);
    expect(idx.leftOf(0)).toBe(0);
    expect(idx.leftOf(2)).toBe(50);
    expect(idx.leftOf(5)).toBe(125);
    expect(idx.leftOf(9)).toBe(150);
  });

  it("finds the absolute column containing content x", () => {
    expect(idx.columnAtX(-1)).toBe(-1);
    expect(idx.columnAtX(0)).toBe(0);
    expect(idx.columnAtX(49.5)).toBe(0);
    expect(idx.columnAtX(50)).toBe(2);
    expect(idx.columnAtX(124.5)).toBe(2);
    expect(idx.columnAtX(125)).toBe(5);
    expect(idx.columnAtX(149.5)).toBe(5);
    expect(idx.columnAtX(150)).toBe(-1);
  });
});

describe("computeColumnWindow", () => {
  const idx = new ColumnIndex([0, 2, 5, 6, 9], [50, 75, 25, 100, 40]);

  it("returns the visible-column positions intersecting the viewport", () => {
    expect(computeColumnWindow(idx, 60, 100, 0)).toEqual({ start: 1, end: 4 });
  });

  it("applies overscan and clamps to the available columns", () => {
    expect(computeColumnWindow(idx, 60, 100, 1)).toEqual({ start: 0, end: 5 });
    expect(computeColumnWindow(idx, 240, 100, 2)).toEqual({ start: 1, end: 5 });
  });

  it("includes every small-column sheet when overscan covers it", () => {
    expect(computeColumnWindow(idx, 125, 10, 6)).toEqual({ start: 0, end: 5 });
  });

  it("returns an empty window for an empty column index", () => {
    expect(computeColumnWindow(new ColumnIndex([], []), 0, 100, 2)).toEqual({
      start: 0,
      end: 0,
    });
  });
});
