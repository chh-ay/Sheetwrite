import { describe, expect, it } from "bun:test";
import { OffsetIndex } from "../src/fenwick";
import { computeWindow, windowContains } from "../src/virtualization";

describe("computeWindow", () => {
  const idx = new OffsetIndex(1000, 20);

  it("includes the rows intersecting the viewport plus overscan", () => {
    // viewport [100, 200) covers rows 5..10; overscan 2 widens to [3, 13)
    expect(computeWindow(idx, 100, 100, 2)).toEqual({ start: 3, end: 13 });
  });

  it("clamps the start at the top edge", () => {
    expect(computeWindow(idx, 0, 100, 2)).toEqual({ start: 0, end: 8 });
  });

  it("clamps the end at the bottom edge", () => {
    const top = idx.totalHeight - 100; // last 5 rows
    const win = computeWindow(idx, top, 100, 2);
    expect(win.end).toBe(1000);
    expect(win.start).toBe(995 - 2);
  });

  it("returns an empty window for an empty sheet", () => {
    expect(computeWindow(new OffsetIndex(0, 20), 0, 100, 2)).toEqual({ start: 0, end: 0 });
  });

  it("windowContains reflects the half-open range", () => {
    const win = { start: 3, end: 13 };
    expect(windowContains(win, 3)).toBe(true);
    expect(windowContains(win, 12)).toBe(true);
    expect(windowContains(win, 13)).toBe(false);
    expect(windowContains(win, 2)).toBe(false);
  });
});
