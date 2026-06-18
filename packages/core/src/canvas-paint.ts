import { formatNumber } from "./number-format";
import type {
  CellBorder,
  CellRenderer,
  CellScalar,
  CellStyle,
  RenderLayout,
  Theme,
  Viewport,
  VisibleWindowView,
} from "./types";

const CELL_PAD = 6;

/** Works against a main-thread or worker (OffscreenCanvas) 2D context. */
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

type MergeRect = { r0: number; c0: number; r1: number; c1: number };

function mergeAt(
  merges: ReadonlyArray<MergeRect> | undefined,
  row: number,
  col: number,
): MergeRect | undefined {
  if (!merges) return undefined;
  for (const m of merges) {
    if (row >= m.r0 && row <= m.r1 && col >= m.c0 && col <= m.c1) return m;
  }
  return undefined;
}

/** Cumulative left edges per visible column; `colX[c+1] - colX[c]` is its width. */
export function columnEdges(layout: RenderLayout): number[] {
  const colX: number[] = new Array(layout.columns.length + 1);
  colX[0] = 0;
  for (let c = 0; c < layout.columns.length; c++) {
    colX[c + 1] = colX[c]! + layout.columns[c]!.width;
  }
  return colX;
}

/**
 * Paint one visible window. Shared by the main-thread `CanvasRenderer` and the
 * worker backend. `renderers` is empty in the worker (custom cell renderers are
 * functions and cannot cross the worker boundary).
 */
export function paintFrame(
  ctx: Ctx,
  view: VisibleWindowView,
  layout: RenderLayout,
  theme: Theme,
  viewport: Viewport,
  dpr: number,
  renderers: ReadonlyMap<string, CellRenderer>,
): void {
  const { width, height, scrollTop, scrollLeft } = viewport;
  const { rowHeight, headerHeight } = theme;
  const colX = columnEdges(layout);
  const g = theme.rowHeaderWidth;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textBaseline = "middle";
  ctx.font = theme.font;

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, width, height);

  const nCols = view.cols.length;
  const nRows = view.rows.end - view.rows.start;

  // Cell body, clipped below the sticky header.
  ctx.save();
  ctx.beginPath();
  ctx.rect(g, headerHeight, Math.max(0, width - g), Math.max(0, height - headerHeight));
  ctx.clip();
  for (let ri = 0; ri < nRows; ri++) {
    const row = view.rows.start + ri;
    const y = headerHeight + row * rowHeight - scrollTop;
    if (y + rowHeight <= headerHeight || y >= height) continue;
    for (let cj = 0; cj < nCols; cj++) {
      const col = view.cols[cj]!;
      const x = colX[col]! - scrollLeft + g;
      const w = colX[col + 1]! - colX[col]!;
      if (x + w <= g || x >= width) continue;
      const merge = mergeAt(layout.merges, row, col);
      if (merge && (merge.r0 !== row || merge.c0 !== col)) continue; // covered by a merge
      const cw = merge ? colX[merge.c1 + 1]! - colX[merge.c0]! : w;
      const ch = merge ? (merge.r1 - merge.r0 + 1) * rowHeight : rowHeight;
      const i = ri * nCols + cj;
      const value = view.values[i] ?? null;
      const style = view.styles[view.styleIds[i]!] ?? {};
      paintCell(ctx, theme, layout, col, value, style, x, y, cw, ch, renderers);
    }
  }

  ctx.strokeStyle = theme.gridLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let ri = 0; ri < nRows; ri++) {
    const row = view.rows.start + ri;
    const lineY = Math.round(headerHeight + (row + 1) * rowHeight - scrollTop) - 0.5;
    if (lineY < headerHeight || lineY > height) continue;
    ctx.moveTo(g, lineY);
    ctx.lineTo(width, lineY);
  }
  ctx.stroke();
  ctx.restore();

  // Vertical gridlines through header + body.
  ctx.strokeStyle = theme.gridLine;
  ctx.beginPath();
  for (let c = 0; c < colX.length; c++) {
    const lineX = Math.round(colX[c]! - scrollLeft + g) - 0.5;
    if (lineX < g || lineX > width) continue;
    ctx.moveTo(lineX, 0);
    ctx.lineTo(lineX, height);
  }
  ctx.stroke();

  paintHeader(ctx, theme, layout, colX, width, scrollLeft, g);

  if (g > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, g, height);
    ctx.clip();
    ctx.fillStyle = theme.headerBg;
    ctx.fillRect(0, 0, g, height);
    ctx.fillStyle = theme.headerFg;
    ctx.font = theme.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let ri = 0; ri < nRows; ri++) {
      const row = view.rows.start + ri;
      const cy = headerHeight + row * rowHeight - scrollTop + rowHeight / 2;
      if (cy < headerHeight || cy > height) continue;
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
  renderers: ReadonlyMap<string, CellRenderer>,
): void {
  if (style.backgroundColor) {
    ctx.fillStyle = style.backgroundColor;
    ctx.fillRect(x, y, w, h);
  }
  paintBorders(ctx, style, x, y, w, h);

  const column = layout.columns[col];
  const custom = column?.renderer ? renderers.get(column.renderer) : undefined;
  if (custom?.canvas) {
    custom.canvas(ctx as CanvasRenderingContext2D, { value, x, y, w, h, theme, style });
    return;
  }

  if (value === null || value === "") return;
  const text = typeof value === "number" ? formatNumber(value, column?.numberFormat) : value;

  ctx.font =
    style.bold || style.italic
      ? `${style.italic ? "italic " : ""}${style.bold ? "bold " : ""}${theme.font}`
      : theme.font;
  ctx.fillStyle = style.color ?? theme.fg;

  const align = style.align ?? (column?.type === "number" ? "right" : "left");
  const maxWidth = Math.max(1, w - CELL_PAD * 2);
  const cy = y + h / 2;
  if (align === "right") {
    ctx.textAlign = "right";
    ctx.fillText(text, x + w - CELL_PAD, cy, maxWidth);
  } else if (align === "center") {
    ctx.textAlign = "center";
    ctx.fillText(text, x + w / 2, cy, maxWidth);
  } else {
    ctx.textAlign = "left";
    ctx.fillText(text, x + CELL_PAD, cy, maxWidth);
  }
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
    if (side.style === "dashed") ctx.setLineDash([4, 2]);
    else if (side.style === "dotted") ctx.setLineDash([1, 2]);
    else ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function paintHeader(
  ctx: Ctx,
  theme: Theme,
  layout: RenderLayout,
  colX: number[],
  width: number,
  scrollLeft: number,
  g: number,
): void {
  const h = theme.headerHeight;
  ctx.fillStyle = theme.headerBg;
  ctx.fillRect(0, 0, width, h);

  ctx.fillStyle = theme.headerFg;
  ctx.font = `bold ${theme.font}`;
  ctx.textAlign = "center";
  for (let c = 0; c < layout.columns.length; c++) {
    const x = colX[c]! - scrollLeft + g;
    const w = colX[c + 1]! - colX[c]!;
    if (x + w <= g || x >= width) continue;
    ctx.fillText(layout.columns[c]!.header, x + w / 2, h / 2, Math.max(1, w - CELL_PAD * 2));
  }

  ctx.strokeStyle = theme.gridLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h - 0.5);
  ctx.lineTo(width, h - 0.5);
  ctx.stroke();
}
