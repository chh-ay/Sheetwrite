import type { ColumnIndex } from "./column-index.js";
import type { OffsetIndex } from "./fenwick.js";

/** A half-open row range `[start, end)` chosen for rendering. */
export interface RowWindow {
  start: number;
  end: number;
}

/** A half-open visible-column position range `[start, end)` chosen for rendering. */
export interface ColumnWindow {
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

/**
 * The visible-column positions intersecting the viewport, padded by `overscan`
 * on each side. `scrollLeft` is in content space and the returned range indexes
 * into the full visible-column list, not absolute sheet columns.
 */
export function computeColumnWindow(
  index: ColumnIndex,
  scrollLeft: number,
  viewportWidth: number,
  overscan: number,
): ColumnWindow {
  const count = index.count;
  if (count === 0) return { start: 0, end: 0 };

  const left = Math.max(0, scrollLeft);
  const right = left + Math.max(0, viewportWidth);
  const firstColumn = index.columnAtX(left);
  const lastColumn = index.columnAtX(right);
  let first = 0;
  if (firstColumn === -1) {
    if (left >= index.totalWidth) first = count - 1;
  } else {
    first = index.positionOf(firstColumn);
  }

  let last = 0;
  if (lastColumn === -1) {
    if (right >= index.totalWidth) last = count - 1;
  } else {
    last = index.positionOf(lastColumn);
  }
  const start = Math.max(0, first - overscan);
  const end = Math.min(count, last + 1 + overscan);
  return { start, end };
}

/** Whether `row` lies within `[window.start, window.end)`. */
export function windowContains(window: RowWindow, row: number): boolean {
  return row >= window.start && row < window.end;
}
