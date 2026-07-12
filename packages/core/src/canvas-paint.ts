import { formatNumber } from "./number-format.js";
import type {
  CellAlign,
  CellBorder,
  CellRenderer,
  CellScalar,
  CellStyle,
  RenderLayout,
  Theme,
  Viewport,
  VisibleWindowView,
} from "./types.js";

const CELL_PAD = 6;

/** Pull the pixel size out of a CSS font shorthand ("12px sans-serif"). */
const FONT_PX_RE = /(\d+(?:\.\d+)?)px/;

/** Shared empty style; skips a per-cell `{}` allocation on the render hot path. */
const EMPTY_STYLE: CellStyle = {};

// Border dash patterns, hoisted so paintBorders allocates no array per cell.
const SOLID_DASH: number[] = [];
const DASHED_DASH: number[] = [4, 2];
const DOTTED_DASH: number[] = [1, 2];

/** Composite key stride for the per-frame merge map; column indices are < 2^20. */
const MERGE_KEY_STRIDE = 0x100000;

/** Works against a main-thread or worker (OffscreenCanvas) 2D context. */
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

type MergeRect = { r0: number; c0: number; r1: number; c1: number };

/**
 * Build the per-frame merge lookup. Every covered cell of every merge that
 * intersects the painted window maps to its `MergeRect`, keyed
 * `row * MERGE_KEY_STRIDE + col`. Populating only the window bounds the map to
 * `merges × visible-cells`, turning the per-cell `mergeAt` scan into an O(1)
 * `Map.get`. Returns `undefined` when there is nothing to cover (the fast path).
 */
function buildMergeMap(
  merges: ReadonlyArray<MergeRect>,
  rowStart: number,
  rowEnd: number,
  cols: readonly number[],
): Map<number, MergeRect> | undefined {
  if (merges.length === 0 || cols.length === 0) return undefined;

  const map = new Map<number, MergeRect>();
  for (const m of merges) {
    const r0 = Math.max(m.r0, rowStart);
    const r1 = Math.min(m.r1, rowEnd - 1);
    if (r0 > r1) continue;

    for (let r = r0; r <= r1; r++) {
      const base = r * MERGE_KEY_STRIDE;
      for (const c of cols) {
        if (c >= m.c0 && c <= m.c1) map.set(base + c, m);
      }
    }
  }
  return map.size === 0 ? undefined : map;
}

/**
 * Total pixel height of a merged region's vertical span. With per-row geometry
 * the heights of the spanned rows are summed (rows outside the painted window
 * fall back to the uniform height); without geometry it is the uniform height
 * times the spanned row count.
 */
function mergeRowSpanHeight(
  merge: MergeRect,
  windowStart: number,
  windowRowCount: number,
  rowHeights: Float64Array | undefined,
  rowHeight: number,
): number {
  if (rowHeights === undefined) {
    return (merge.r1 - merge.r0 + 1) * rowHeight;
  }

  let total = 0;
  for (let row = merge.r0; row <= merge.r1; row++) {
    const index = row - windowStart;
    const insideWindow = index >= 0 && index < windowRowCount;
    total += insideWindow ? rowHeights[index]! : rowHeight;
  }
  return total;
}

/** Cached cumulative edges keyed by columns-array identity (see `columnEdges`). */
const columnEdgesCache = new WeakMap<RenderLayout["columns"], number[]>();

/** Cumulative left edges per visible column; `colX[c+1] - colX[c]` is its width. */
export function columnEdges(layout: RenderLayout): number[] {
  const columns = layout.columns;
  const cached = columnEdgesCache.get(columns);
  if (cached !== undefined) return cached;

  const colX: number[] = new Array(columns.length + 1);
  colX[0] = 0;
  for (let c = 0; c < columns.length; c++) {
    colX[c + 1] = colX[c]! + columns[c]!.width;
  }
  columnEdgesCache.set(columns, colX);
  return colX;
}

/**
 * Build a canvas `font` string for the given weight and slant. Returns the plain
 * theme font when neither bold nor italic is requested (the hot-path default).
 */
function fontFor(theme: Theme, bold: boolean | undefined, italic: boolean | undefined): string {
  if (!bold && !italic) return theme.font;
  return `${italic ? "italic " : ""}${bold ? "bold " : ""}${theme.font}`;
}

/**
 * Draw horizontally-aligned text inside a cell or header rect. `cy` is the
 * vertical center (baseline is "middle"). Deliberately omit Canvas's
 * `maxWidth`: browsers satisfy it by horizontally distorting glyphs.
 */
function fillAlignedText(
  ctx: Ctx,
  text: string,
  align: CellAlign,
  x: number,
  w: number,
  cy: number,
): void {
  if (align === "right") {
    ctx.textAlign = "right";
    ctx.fillText(text, x + w - CELL_PAD, cy);
  } else if (align === "center") {
    ctx.textAlign = "center";
    ctx.fillText(text, x + w / 2, cy);
  } else {
    ctx.textAlign = "left";
    ctx.fillText(text, x + CELL_PAD, cy);
  }
}

/**
 * Draw underline and/or strikethrough for a drawn text run. Called only when the
 * resolved style requests a decoration, so the `measureText` and regex cost stay
 * off the undecorated hot path. Each line is a 1px filled rect spanning the glyph
 * run and reuses the current fill (already set to the text color by the caller).
 */
function paintTextDecoration(
  ctx: Ctx,
  style: CellStyle,
  text: string,
  align: CellAlign,
  x: number,
  w: number,
  cy: number,
  theme: Theme,
): void {
  const runWidth = ctx.measureText(text).width;
  if (runWidth <= 0) return;

  let left: number;
  if (align === "right") left = x + w - CELL_PAD - runWidth;
  else if (align === "center") left = x + w / 2 - runWidth / 2;
  else left = x + CELL_PAD;

  const fontPx = Number.parseFloat(FONT_PX_RE.exec(theme.font)?.[1] ?? "") || 12;

  if (style.underline) {
    // Just under the baseline, which sits ~0.4em below the "middle" text origin.
    ctx.fillRect(left, Math.round(cy + fontPx * 0.4), runWidth, 1);
  }
  if (style.strikethrough) {
    // Through the run's visual middle (≈ the "middle" baseline origin at `cy`).
    ctx.fillRect(left, Math.round(cy), runWidth, 1);
  }
}

/**
 * Per-frame guard state: `ctx.font`/`ctx.fillStyle` writes are surprisingly
 * costly on canvas backends, so paint routines assign only when the string
 * actually changes and record the last applied value here.
 */
interface PaintState {
  lastFont: string;
  lastFill: string;
  measuredFont: string;
  digitWidth: number;
  hashWidth: number;
}

function applyFont(ctx: Ctx, state: PaintState, font: string): void {
  if (state.lastFont !== font) {
    ctx.font = font;
    state.lastFont = font;
  }
}

function applyFill(ctx: Ctx, state: PaintState, fill: string): void {
  if (state.lastFill !== fill) {
    ctx.fillStyle = fill;
    state.lastFill = fill;
  }
}

export interface PaintDamage {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function blitVerticalScroll(
  ctx: Ctx,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  theme: Theme,
  prev: Viewport | null,
  viewport: Viewport,
  dpr: number,
  lastDpr: number,
): PaintDamage | undefined {
  if (!prev) return undefined;
  if (prev.contentRevision === undefined || viewport.contentRevision === undefined)
    return undefined;
  if (prev.contentRevision !== viewport.contentRevision) return undefined;
  if (prev.scrollLeft !== viewport.scrollLeft) return undefined;
  if (prev.width !== viewport.width || prev.height !== viewport.height) return undefined;
  if (lastDpr !== dpr) return undefined;

  const bodyTop = theme.headerHeight;
  const bodyH = viewport.height - bodyTop;
  if (bodyH <= 0) return undefined;

  const deltaPx = Math.round((viewport.scrollTop - prev.scrollTop) * dpr);
  const bodyTopPx = Math.round(bodyTop * dpr);
  const heightPx = Math.round(viewport.height * dpr);
  const widthPx = Math.round(viewport.width * dpr);
  const bodyHPx = heightPx - bodyTopPx;
  const shiftPx = Math.abs(deltaPx);
  if (shiftPx === 0 || shiftPx >= bodyHPx) return undefined;

  const copyH = bodyHPx - shiftPx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (deltaPx > 0) {
    ctx.drawImage(canvas, 0, bodyTopPx + shiftPx, widthPx, copyH, 0, bodyTopPx, widthPx, copyH);
    return {
      x: 0,
      y: viewport.height - shiftPx / dpr,
      w: viewport.width,
      h: shiftPx / dpr,
    };
  }

  ctx.drawImage(canvas, 0, bodyTopPx, widthPx, copyH, 0, bodyTopPx + shiftPx, widthPx, copyH);
  return { x: 0, y: bodyTop, w: viewport.width, h: shiftPx / dpr };
}

/** Solid lines on the freeze boundaries, drawn over the pane seams (Sheets-style). */
export function paintFreezeDivider(
  ctx: Ctx,
  theme: Theme,
  viewport: { width: number; height: number },
  dpr: number,
  divider: { x: number | null; y: number | null },
): void {
  if (divider.x === null && divider.y === null) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.strokeStyle = theme.headerFg;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (divider.y !== null) {
    ctx.moveTo(0, divider.y);
    ctx.lineTo(viewport.width, divider.y);
  }
  if (divider.x !== null) {
    ctx.moveTo(divider.x, 0);
    ctx.lineTo(divider.x, viewport.height);
  }
  ctx.stroke();
}

/**
 * Paint one visible window. Shared by the main-thread `CanvasRenderer` and the
 * worker backend. `renderers` is empty in the worker (custom cell renderers are
 * functions and cannot cross the worker boundary).
 *
 * `pane` clips the whole pass to one frozen-pane rectangle: the same code path
 * paints the corner/top/left/body panes of a frozen sheet, each with its own
 * scroll offsets in `viewport`, and the clip discards everything outside its
 * slice (including the header band/gutter segments other panes own).
 */
export function paintFrame(
  ctx: Ctx,
  view: VisibleWindowView,
  layout: RenderLayout,
  theme: Theme,
  viewport: Viewport,
  dpr: number,
  renderers: ReadonlyMap<string, CellRenderer>,
  damage?: PaintDamage,
  pane?: PaintDamage,
): void {
  const { width, height, scrollTop, scrollLeft, rowTops, rowHeights } = viewport;
  const { rowHeight, headerHeight } = theme;
  const colX = columnEdges(layout);
  const g = theme.rowHeaderWidth;

  const state: PaintState = {
    lastFont: "",
    lastFill: "",
    measuredFont: "",
    digitWidth: 0,
    hashWidth: 0,
  };
  const styleCache = new Map<number, CellStyle>();
  const styleStride = view.styles.length || 1;
  const merges = layout.merges;
  const mergeMap =
    merges !== undefined
      ? buildMergeMap(merges, view.rows.start, view.rows.end, view.cols)
      : undefined;
  const mergesByColumn =
    merges && merges.length > 0 ? [...merges].sort((a, b) => a.c0 - b.c0) : undefined;
  const mergesByRow =
    merges && merges.length > 0 ? [...merges].sort((a, b) => a.r0 - b.r0) : undefined;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.save();
  if (pane) {
    ctx.beginPath();
    ctx.rect(pane.x, pane.y, pane.w, pane.h);
    ctx.clip();
  }
  if (damage) {
    ctx.beginPath();
    ctx.rect(damage.x, damage.y, damage.w, damage.h);
    ctx.clip();
  }
  ctx.textBaseline = "middle";
  applyFont(ctx, state, theme.font);

  applyFill(ctx, state, theme.bg);
  if (damage) ctx.fillRect(damage.x, damage.y, damage.w, damage.h);
  else if (pane) ctx.fillRect(pane.x, pane.y, pane.w, pane.h);
  else ctx.fillRect(0, 0, width, height);

  const nCols = view.cols.length;
  const nRows = view.rows.end - view.rows.start;
  const clipTop = Math.max(damage ? damage.y : 0, pane ? pane.y : 0);
  const clipBottom = Math.min(
    damage ? damage.y + damage.h : height,
    pane ? pane.y + pane.h : height,
  );
  const paintTop = Math.max(headerHeight, clipTop);
  const paintBottom = Math.min(height, clipBottom);

  // Cell body, clipped below the sticky header.
  ctx.save();
  ctx.beginPath();
  ctx.rect(g, headerHeight, Math.max(0, width - g), Math.max(0, height - headerHeight));
  ctx.clip();
  for (let ri = 0; ri < nRows; ri++) {
    const row = view.rows.start + ri;
    const rowTop = rowTops !== undefined ? rowTops[ri]! : row * rowHeight;
    const rowH = rowHeights !== undefined ? rowHeights[ri]! : rowHeight;
    const y = headerHeight + rowTop - scrollTop;
    if (y + rowH <= paintTop || y >= paintBottom) continue;
    for (let cj = 0; cj < nCols; cj++) {
      const col = view.cols[cj]!;
      const x = colX[col]! - scrollLeft + g;
      const w = colX[col + 1]! - colX[col]!;
      if (x + w <= g || x >= width) continue;
      const merge = mergeMap !== undefined ? mergeMap.get(row * MERGE_KEY_STRIDE + col) : undefined;
      if (merge && (merge.r0 !== row || merge.c0 !== col)) continue; // covered by a merge
      const cw = merge ? colX[merge.c1 + 1]! - colX[merge.c0]! : w;
      const ch = merge
        ? mergeRowSpanHeight(merge, view.rows.start, nRows, rowHeights, rowHeight)
        : rowH;
      const i = ri * nCols + cj;
      const value = view.values[i] ?? null;
      const styleId = view.styleIds[i]!;
      const style = view.styles[styleId] ?? EMPTY_STYLE;
      const styleKey = col * styleStride + styleId;

      // Sheets lets text spill through adjacent empty cells, but never through
      // occupied cells. Compute the contiguous empty run around this cell; the
      // painter chooses the relevant side after resolving alignment. Numbers
      // and custom renderers deliberately keep their own cell bounds.
      let spillX = x;
      let spillRight = x + cw;
      if (!merge && typeof value === "string" && value !== "") {
        for (let k = cj - 1; k >= 0; k--) {
          const adjacent = view.cols[k]! + 1 === view.cols[k + 1]!;
          const neighbour = view.values[ri * nCols + k];
          if (!adjacent || (neighbour !== null && neighbour !== "" && neighbour !== undefined))
            break;
          spillX = colX[view.cols[k]!]! - scrollLeft + g;
        }
        for (let k = cj + 1; k < nCols; k++) {
          const adjacent = view.cols[k - 1]! + 1 === view.cols[k]!;
          const neighbour = view.values[ri * nCols + k];
          if (!adjacent || (neighbour !== null && neighbour !== "" && neighbour !== undefined))
            break;
          spillRight = colX[view.cols[k]! + 1]! - scrollLeft + g;
        }
      }
      paintCell(
        ctx,
        theme,
        layout,
        col,
        value,
        style,
        x,
        y,
        cw,
        ch,
        spillX,
        spillRight - spillX,
        renderers,
        state,
        styleKey,
        styleCache,
      );
    }
  }

  ctx.strokeStyle = theme.gridLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let ri = 0; ri < nRows; ri++) {
    const row = view.rows.start + ri;
    const rowBottom =
      rowTops !== undefined && rowHeights !== undefined
        ? rowTops[ri]! + rowHeights[ri]!
        : (row + 1) * rowHeight;
    const lineY = Math.round(headerHeight + rowBottom - scrollTop) - 0.5;
    if (lineY < paintTop || lineY > paintBottom) continue;
    let cursorX = g;
    if (mergesByColumn) {
      for (const merge of mergesByColumn) {
        if (merge.r0 > row || row >= merge.r1) continue;
        const gapStart = Math.max(g, colX[merge.c0]! - scrollLeft + g);
        const gapEnd = Math.min(width, colX[merge.c1 + 1]! - scrollLeft + g);
        if (gapEnd <= cursorX || gapStart >= width) continue;
        if (gapStart > cursorX) {
          ctx.moveTo(cursorX, lineY);
          ctx.lineTo(gapStart, lineY);
        }
        cursorX = Math.max(cursorX, gapEnd);
      }
    }
    if (cursorX < width) {
      ctx.moveTo(cursorX, lineY);
      ctx.lineTo(width, lineY);
    }
  }
  ctx.stroke();
  ctx.restore();
  state.lastFont = theme.font;
  state.lastFill = theme.bg;

  // Vertical gridlines through header + body.
  ctx.strokeStyle = theme.gridLine;
  ctx.beginPath();
  const appendVerticalGridline = (c: number, lineX: number): void => {
    if (lineX < g || lineX > width) return;
    let cursorY = 0;
    if (mergesByRow) {
      for (const merge of mergesByRow) {
        if (merge.c0 >= c || c > merge.c1) continue;
        const mergeIndex = merge.r0 - view.rows.start;
        const mergeContentTop =
          rowTops !== undefined && mergeIndex >= 0 && mergeIndex < nRows
            ? rowTops[mergeIndex]!
            : merge.r0 * rowHeight;
        const mergeTop = headerHeight + mergeContentTop - scrollTop;
        const gapStart = Math.max(0, mergeTop);
        const gapEnd = Math.min(
          height,
          mergeTop + mergeRowSpanHeight(merge, view.rows.start, nRows, rowHeights, rowHeight),
        );
        if (gapEnd <= cursorY || gapStart >= height) continue;
        if (gapStart > cursorY) {
          ctx.moveTo(lineX, cursorY);
          ctx.lineTo(lineX, gapStart);
        }
        cursorY = Math.max(cursorY, gapEnd);
      }
    }
    if (cursorY < height) {
      ctx.moveTo(lineX, cursorY);
      ctx.lineTo(lineX, height);
    }
  };

  for (let cj = 0; cj < nCols; cj++) {
    const c = view.cols[cj]!;
    appendVerticalGridline(c, Math.round(colX[c]! - scrollLeft + g) - 0.5);
  }
  if (nCols > 0) {
    const c = view.cols[nCols - 1]! + 1;
    appendVerticalGridline(c, Math.round(colX[c]! - scrollLeft + g) - 0.5);
  }
  ctx.stroke();

  paintHeader(ctx, theme, layout, colX, view.cols, width, scrollLeft, g, state);

  if (g > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, g, height);
    ctx.clip();
    applyFill(ctx, state, theme.headerBg);
    ctx.fillRect(0, 0, g, height);
    applyFill(ctx, state, theme.headerFg);
    applyFont(ctx, state, theme.font);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let ri = 0; ri < nRows; ri++) {
      const row = view.rows.start + ri;
      const cy =
        rowTops !== undefined && rowHeights !== undefined
          ? headerHeight + rowTops[ri]! + rowHeights[ri]! / 2 - scrollTop
          : headerHeight + row * rowHeight - scrollTop + rowHeight / 2;
      if (cy < paintTop || cy > paintBottom) continue;
      ctx.fillText(String(row + 1), g / 2, cy);
    }
    ctx.strokeStyle = theme.gridLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(g - 0.5, 0);
    ctx.lineTo(g - 0.5, height);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Clip cell content without using fillText's `maxWidth`, which scales and
 * visibly squeezes glyphs. Text may receive a wider Sheets-style spill rect;
 * its height always remains locked to the owning row.
 */
function clipCell(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.rect(x, y, Math.max(0, w), Math.max(0, h));
  ctx.clip();
}

function paintCell(
  ctx: Ctx,
  theme: Theme,
  layout: RenderLayout,
  col: number,
  value: CellScalar,
  style: CellStyle,
  x: number,
  y: number,
  w: number,
  h: number,
  spillX: number,
  spillW: number,
  renderers: ReadonlyMap<string, CellRenderer>,
  state: PaintState,
  styleKey: number,
  styleCache: Map<number, CellStyle>,
): void {
  const column = layout.columns[col];

  // The column's `cellStyle` is the base layer and the per-cell style wins on any
  // shared property. Skip the merge (and its allocation) when no column style
  // exists; otherwise reuse a merge cached per (column, view-local style id).
  const columnStyle = column?.cellStyle;
  let effective: CellStyle;
  if (columnStyle === undefined) {
    effective = style;
  } else {
    const cached = styleCache.get(styleKey);
    if (cached !== undefined) {
      effective = cached;
    } else {
      effective = { ...columnStyle, ...style };
      styleCache.set(styleKey, effective);
    }
  }

  if (effective.backgroundColor) {
    applyFill(ctx, state, effective.backgroundColor);
    ctx.fillRect(x, y, w, h);
  }
  paintBorders(ctx, effective, x, y, w, h);

  const custom = column?.renderer ? renderers.get(column.renderer) : undefined;
  if (custom?.canvas) {
    ctx.save();
    clipCell(ctx, x, y, w, h);
    custom.canvas(ctx as CanvasRenderingContext2D, { value, x, y, w, h, theme, style: effective });
    ctx.restore();
    return;
  }

  if (value === null || value === "") return;

  applyFont(ctx, state, fontFor(theme, effective.bold, effective.italic));
  applyFill(ctx, state, effective.color ?? theme.fg);

  const align =
    effective.align ??
    (column?.type === "number" || column?.type === "currency" ? "right" : "left");
  const numeric = typeof value === "number";
  let text = numeric ? formatNumber(value, column?.numberFormat) : value;
  const availableTextWidth = Math.max(0, w - CELL_PAD * 2);
  if (numeric) {
    if (state.measuredFont !== state.lastFont) {
      state.measuredFont = state.lastFont;
      state.digitWidth = ctx.measureText("0").width;
      state.hashWidth = ctx.measureText("#").width || 1;
    }
    // Most numeric cells are comfortably wider than their formatted value.
    // Only pay for exact measurement when a cached digit-width estimate says
    // the run is close enough to the edge to plausibly overflow.
    const mayOverflow = text.length * state.digitWidth > availableTextWidth * 0.8;
    const exactWidth = mayOverflow ? ctx.measureText(text).width : 0;
    if (exactWidth > availableTextWidth) {
      text = "#".repeat(Math.max(1, Math.floor(availableTextWidth / state.hashWidth)));
    }
  }

  // Left-aligned strings spill right, right-aligned strings spill left, and
  // centered strings can use both sides. Numeric output never spills.
  let textClipX = x;
  let textClipW = w;
  if (!numeric) {
    if (align === "left") textClipW = spillX + spillW - x;
    else if (align === "right") {
      textClipX = spillX;
      textClipW = x + w - spillX;
    } else {
      textClipX = spillX;
      textClipW = spillW;
    }
  }

  const cy = y + h / 2;
  ctx.save();
  clipCell(ctx, textClipX, y, textClipW, h);
  fillAlignedText(ctx, text, align, x, w, cy);
  if (effective.underline || effective.strikethrough) {
    paintTextDecoration(ctx, effective, text, align, x, w, cy, theme);
  }
  ctx.restore();
}

function paintBorders(
  ctx: Ctx,
  style: CellStyle,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const b = style.border;
  if (!b) return;
  const sides: Array<[CellBorder | undefined, number, number, number, number]> = [
    [b.top ?? b.all, x, y, x + w, y],
    [b.bottom ?? b.all, x, y + h, x + w, y + h],
    [b.left ?? b.all, x, y, x, y + h],
    [b.right ?? b.all, x + w, y, x + w, y + h],
  ];
  for (const [side, x0, y0, x1, y1] of sides) {
    if (!side) continue;
    ctx.strokeStyle = side.color ?? "#000000";
    ctx.lineWidth = side.width ?? 1;
    if (side.style === "dashed") ctx.setLineDash(DASHED_DASH);
    else if (side.style === "dotted") ctx.setLineDash(DOTTED_DASH);
    else ctx.setLineDash(SOLID_DASH);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.setLineDash(SOLID_DASH);
}

function paintHeader(
  ctx: Ctx,
  theme: Theme,
  layout: RenderLayout,
  colX: number[],
  cols: readonly number[],
  width: number,
  scrollLeft: number,
  g: number,
  state: PaintState,
): void {
  const h = theme.headerHeight;

  // Default header bar; any per-column `headerStyle` background paints over it.
  applyFill(ctx, state, theme.headerBg);
  ctx.fillRect(0, 0, width, h);

  const cy = h / 2;
  for (const c of cols) {
    const column = layout.columns[c]!;
    const x = colX[c]! - scrollLeft + g;
    const w = colX[c + 1]! - colX[c]!;
    if (x + w <= g || x >= width) continue;

    const headerStyle = column.headerStyle;

    if (headerStyle?.backgroundColor) {
      applyFill(ctx, state, headerStyle.backgroundColor);
      ctx.fillRect(x, 0, w, h);
    }

    // Theme header defaults are bold and centered; `headerStyle` overrides where set.
    const bold = headerStyle?.bold ?? true;
    applyFont(ctx, state, fontFor(theme, bold, headerStyle?.italic));
    applyFill(ctx, state, headerStyle?.color ?? theme.headerFg);

    const align = headerStyle?.align ?? "center";
    ctx.save();
    clipCell(ctx, x, 0, w, h);
    fillAlignedText(ctx, column.header, align, x, w, cy);
    ctx.restore();
  }

  ctx.strokeStyle = theme.gridLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h - 0.5);
  ctx.lineTo(width, h - 0.5);
  ctx.stroke();
}
