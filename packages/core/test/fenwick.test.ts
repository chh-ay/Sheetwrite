import { describe, expect, it } from "bun:test";
import { OffsetIndex, ScaledScroll } from "../src/fenwick.js";

describe("OffsetIndex", () => {
  it("maps rows to offsets and offsets to rows with uniform heights", () => {
    const idx = new OffsetIndex(10, 20);
    expect(idx.totalHeight).toBe(200);
    expect(idx.offsetOf(0)).toBe(0);
    expect(idx.offsetOf(5)).toBe(100);
    expect(idx.rowAtOffset(0)).toEqual({ row: 0, top: 0 });
    expect(idx.rowAtOffset(25)).toEqual({ row: 1, top: 20 });
    expect(idx.rowAtOffset(199)).toEqual({ row: 9, top: 180 });
  });

  it("clamps offsets past the end to the last row", () => {
    const idx = new OffsetIndex(10, 20);
    expect(idx.rowAtOffset(100000)).toEqual({ row: 9, top: 180 });
  });

  it("reflects a single-row height override in subsequent offsets", () => {
    const idx = new OffsetIndex(10, 20);
    idx.setHeight(2, 50);
    expect(idx.totalHeight).toBe(230);
    expect(idx.heightOf(2)).toBe(50);
    expect(idx.offsetOf(3)).toBe(20 + 20 + 50);
    // row 2 now spans [40, 90)
    expect(idx.rowAtOffset(85)).toEqual({ row: 2, top: 40 });
    expect(idx.rowAtOffset(90)).toEqual({ row: 3, top: 90 });
  });

  it("inserts and removes rows, updating the total height", () => {
    const idx = new OffsetIndex(10, 20);
    idx.insertRows(0, 2, 20);
    expect(idx.count).toBe(12);
    expect(idx.totalHeight).toBe(240);
    idx.removeRows(0, 4);
    expect(idx.count).toBe(8);
    expect(idx.totalHeight).toBe(160);
  });
});

describe("ScaledScroll", () => {
  it("is identity below the element-height cap", () => {
    const s = new ScaledScroll(2000, 500, 1_000_000);
    expect(s.scaled).toBe(false);
    expect(s.sizerHeight).toBe(2000);
    expect(s.toContent(300)).toBe(300);
    expect(s.toScroll(300)).toBe(300);
  });

  it("maps a capped scroll range onto the full virtual range above the cap", () => {
    const cap = 1000;
    const total = 10000;
    const viewport = 200;
    const s = new ScaledScroll(total, viewport, cap);
    expect(s.scaled).toBe(true);
    expect(s.sizerHeight).toBe(cap);
    // both ranges start at 0 and end at their max simultaneously
    expect(s.toContent(0)).toBe(0);
    expect(s.toContent(cap - viewport)).toBeCloseTo(total - viewport, 5);
    // round trips within the scrollable range [0, cap - viewport]
    const scroll = 600;
    expect(s.toScroll(s.toContent(scroll))).toBeCloseTo(scroll, 5);
  });

  it("re-engages scaling when the measured cap drops below the content height", () => {
    // A browser-zoom change shrinks the layout clamp mid-session: 30M px of
    // content fit under a 33M cap (identity) but not under the ~26.8M clamp
    // Chromium applies at 125% zoom. The remap must expose the full range.
    const total = 30_000_000;
    const viewport = 600;
    const s = new ScaledScroll(total, viewport, 33_000_000);
    expect(s.scaled).toBe(false);
    expect(s.sizerHeight).toBe(total);

    const zoomedCap = 26_843_545;
    s.update(total, viewport, zoomedCap);
    expect(s.scaled).toBe(true);
    expect(s.sizerHeight).toBe(zoomedCap);
    // The last row stays reachable at the clamped maximum scroll position.
    expect(s.toContent(zoomedCap - viewport)).toBeCloseTo(total - viewport, 5);
  });
});
