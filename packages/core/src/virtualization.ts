import type { OffsetIndex } from "./fenwick";

/** A half-open row range `[start, end)` chosen for rendering. */
export interface RowWindow {
  start: number;
  end: number;
}

/**
 * The rows intersecting the viewport, padded by `overscan` on each side so a
 * fast scroll reveals already-painted rows. `contentTop` is in content space
 * (after any scaled-scroll mapping).
 */
export function computeWindow(
  index: OffsetIndex,
  contentTop: number,
  viewportHeight: number,
  overscan: number,
): RowWindow {
  const count = index.count;
  if (count === 0) return { start: 0, end: 0 };
  const first = index.rowAtOffset(contentTop).row;
  const last = index.rowAtOffset(contentTop + viewportHeight).row;
  const start = Math.max(0, first - overscan);
  const end = Math.min(count, last + 1 + overscan);
  return { start, end };
}

/** Whether `row` lies within `[window.start, window.end)`. */
export function windowContains(window: RowWindow, row: number): boolean {
  return row >= window.start && row < window.end;
}
