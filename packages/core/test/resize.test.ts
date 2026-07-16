import { describe, expect, it } from "bun:test";
import { autofitColumnWidth, resizeTargetAt } from "../src/resize.js";

describe("resize gesture geometry", () => {
  it("selects the nearest legal trailing boundary and never resizes before the first band", () => {
    expect(resizeTargetAt(99, 2, 100, 40, 1)).toBe(1);
    expect(resizeTargetAt(139, 2, 100, 40, 1)).toBe(2);
    expect(resizeTargetAt(120, 2, 100, 40, 1)).toBeNull();
    expect(resizeTargetAt(1, 0, 0, 40, -1)).toBeNull();

    // When a tiny band puts both edges in the hit slop, the closer boundary wins.
    expect(resizeTargetAt(101, 2, 100, 3, 1, 4)).toBe(1);
    expect(resizeTargetAt(102, 2, 100, 3, 1, 4)).toBe(2);
  });

  it("autofits to the widest header or cell text", () => {
    const measure = (text: string): number => text.length * 7.25;

    expect(autofitColumnWidth(measure, ["Ada", "Lin"], "Customer name")).toBe(107);
    expect(autofitColumnWidth(measure, ["Ada", "a much longer value"], "Name")).toBe(150);
  });
});
