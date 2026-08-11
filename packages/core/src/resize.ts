// Pure geometry for column/row resize gestures and column autofit. No DOM: the
// grid feeds content-space coordinates and band spans, and text measurement is
// injected, so this stays unit-testable without a canvas.

// ── Constants ────────────────────────────────────────────────────────────────

/** Pointer proximity (px) to a boundary that counts as grabbing it. */
const RESIZE_THRESHOLD = 4;
/** Floors so a resized column / row never collapses away. */
export const MIN_COLUMN_WIDTH = 24;
export const MIN_ROW_HEIGHT = 12;
/** Left+right text padding baked into an autofit width (matches the paint CELL_PAD * 2). */
const AUTOFIT_PADDING = 12;

// ── Boundary hit-testing ─────────────────────────────────────────────────────

/**
 * Which band's trailing edge the pointer grabs at content-space `pos`, or null
 * when not within `threshold` of a boundary. `index`/`start`/`size` describe the
 * band under the pointer; `prev` is the band before it (or -1 at the very start).
 *
 * A drag on a band's leading edge resizes the *previous* band, matching the
 * spreadsheet convention that a border handle sizes the band to its left. When
 * the pointer straddles both edges the nearer one wins.
 */
export function resizeTargetAt(
  pos: number,
  index: number,
  start: number,
  size: number,
  prev: number,
  threshold = RESIZE_THRESHOLD,
): number | null {
  const distEnd = Math.abs(pos - (start + size));
  const distStart = Math.abs(pos - start);
  if (distEnd <= threshold && (prev < 0 || distEnd <= distStart)) return index;
  if (distStart <= threshold && prev >= 0) return prev;
  return null;
}

// ── Autofit ──────────────────────────────────────────────────────────────────

/**
 * Autofit width for a column: the widest of the header label and every supplied
 * cell text (measured by `measure`), plus padding, clamped to `minWidth`.
 */
export function autofitColumnWidth(
  measure: (text: string) => number,
  cellTexts: Iterable<string>,
  headerText: string,
  padding = AUTOFIT_PADDING,
  minWidth = MIN_COLUMN_WIDTH,
): number {
  let widest = measure(headerText);
  for (const text of cellTexts) {
    const w = measure(text);
    if (w > widest) widest = w;
  }
  return Math.max(minWidth, Math.ceil(widest + padding));
}
