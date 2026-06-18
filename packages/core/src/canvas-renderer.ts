import type {
  CellRenderer,
  CellScalar,
  CellStyle,
  Renderer,
  RenderLayout,
  Theme,
  Viewport,
  VisibleWindowView,
} from "./types";

const CELL_PAD = 6;

/**
 * Canvas 2D backend. Paints the visible window in one pass per frame from the
 * bulk `VisibleWindowView` handed in by the grid — it never reads the store.
 * Four-layer model lives in the grid; this owns Layer 1 (the cell canvas).
 */
export class CanvasRenderer implements Renderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private theme: Theme | null = null;
  private layout: RenderLayout | null = null;
  private viewport: Viewport = { scrollTop: 0, scrollLeft: 0, width: 0, height: 0 };
  private dpr = 1;
  /** Cumulative left edges per column; `colX[c+1] - colX[c]` is column `c`'s width. */
  private colX: number[] = [0];
  private renderers: ReadonlyMap<string, CellRenderer> = new Map();

  mount(host: HTMLElement, theme: Theme): void {
    this.theme = theme;
    const canvas = document.createElement("canvas");
    canvas.className = "sheetwrite-canvas";
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.pointerEvents = "none";
    host.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Sheetwrite: 2D canvas context is unavailable");
    this.canvas = canvas;
    this.ctx = ctx;
  }

  setLayout(layout: RenderLayout): void {
    this.layout = layout;
    const colX: number[] = new Array(layout.columns.length + 1);
    colX[0] = 0;
    for (let c = 0; c < layout.columns.length; c++) {
      colX[c + 1] = colX[c]! + layout.columns[c]!.width;
    }
    this.colX = colX;
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
  }

  setRenderers(renderers: ReadonlyMap<string, CellRenderer>): void {
    this.renderers = renderers;
  }

  setViewport(viewport: Viewport): void {
    this.viewport = viewport;
    const canvas = this.canvas;
    if (!canvas) return;
    this.dpr = globalThis.devicePixelRatio ?? 1;
    const w = Math.max(1, Math.round(viewport.width * this.dpr));
    const h = Math.max(1, Math.round(viewport.height * this.dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
  }

  paint(view: VisibleWindowView): void {
    const ctx = this.ctx;
    const layout = this.layout;
    const theme = this.theme;
    if (!ctx || !layout || !theme) return;

    const { width, height, scrollTop, scrollLeft } = this.viewport;
    const { rowHeight, headerHeight } = theme;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.textBaseline = "middle";
    ctx.font = theme.font;

    // Background.
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, width, height);

    const nCols = view.cols.length;
    const nRows = view.rows.end - view.rows.start;

    // Cell body, clipped below the sticky header.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, headerHeight, width, Math.max(0, height - headerHeight));
    ctx.clip();
    for (let ri = 0; ri < nRows; ri++) {
      const row = view.rows.start + ri;
      const y = headerHeight + row * rowHeight - scrollTop;
      if (y + rowHeight <= headerHeight || y >= height) continue;
      for (let cj = 0; cj < nCols; cj++) {
        const col = view.cols[cj]!;
        const x = this.colX[col]! - scrollLeft;
        const w = this.colX[col + 1]! - this.colX[col]!;
        if (x + w <= 0 || x >= width) continue;
        const i = ri * nCols + cj;
        const value = view.values[i] ?? null;
        const style = view.styles[view.styleIds[i]!] ?? {};
        this.paintCell(ctx, theme, layout, col, value, style, x, y, w, rowHeight);
      }
    }
    // Horizontal gridlines across the body.
    ctx.strokeStyle = theme.gridLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let ri = 0; ri < nRows; ri++) {
      const row = view.rows.start + ri;
      const lineY = Math.round(headerHeight + (row + 1) * rowHeight - scrollTop) - 0.5;
      if (lineY < headerHeight || lineY > height) continue;
      ctx.moveTo(0, lineY);
      ctx.lineTo(width, lineY);
    }
    ctx.stroke();
    ctx.restore();

    // Vertical gridlines (through header + body).
    ctx.strokeStyle = theme.gridLine;
    ctx.beginPath();
    for (let c = 0; c < this.colX.length; c++) {
      const lineX = Math.round(this.colX[c]! - scrollLeft) - 0.5;
      if (lineX < 0 || lineX > width) continue;
      ctx.moveTo(lineX, 0);
      ctx.lineTo(lineX, height);
    }
    ctx.stroke();

    // Sticky header on top.
    this.paintHeader(ctx, theme, layout, width, scrollLeft);
  }

  private paintCell(
    ctx: CanvasRenderingContext2D,
    theme: Theme,
    layout: RenderLayout,
    col: number,
    value: CellScalar,
    style: CellStyle,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    if (style.backgroundColor) {
      ctx.fillStyle = style.backgroundColor;
      ctx.fillRect(x, y, w, h);
    }

    const column = layout.columns[col];
    const custom = column?.renderer ? this.renderers.get(column.renderer) : undefined;
    if (custom?.canvas) {
      custom.canvas(ctx, { value, x, y, w, h, theme, style });
      return;
    }

    if (value === null || value === "") return;
    const text = typeof value === "number" ? value.toLocaleString() : value;

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

  private paintHeader(
    ctx: CanvasRenderingContext2D,
    theme: Theme,
    layout: RenderLayout,
    width: number,
    scrollLeft: number,
  ): void {
    const h = theme.headerHeight;
    ctx.fillStyle = theme.headerBg;
    ctx.fillRect(0, 0, width, h);

    ctx.fillStyle = theme.headerFg;
    ctx.font = `bold ${theme.font}`;
    ctx.textAlign = "left";
    for (let c = 0; c < layout.columns.length; c++) {
      const x = this.colX[c]! - scrollLeft;
      const w = this.colX[c + 1]! - this.colX[c]!;
      if (x + w <= 0 || x >= width) continue;
      ctx.fillText(layout.columns[c]!.header, x + CELL_PAD, h / 2, Math.max(1, w - CELL_PAD * 2));
    }

    ctx.strokeStyle = theme.gridLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h - 0.5);
    ctx.lineTo(width, h - 0.5);
    ctx.stroke();
  }

  destroy(): void {
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
  }
}
