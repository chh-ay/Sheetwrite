import { blitVerticalScroll, paintFrame, paintFreezeDivider } from "./canvas-paint.js";
import type {
  CellRenderer,
  PanePaint,
  Renderer,
  RenderLayout,
  Theme,
  Viewport,
  VisibleWindowView,
} from "./types.js";

/**
 * Canvas 2D backend (main thread). Owns Layer 1 (the cell canvas) and paints the
 * visible window in one pass via the shared `paintFrame`. Never reads the store.
 */
export class CanvasRenderer implements Renderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private theme: Theme | null = null;
  private layout: RenderLayout | null = null;
  private viewport: Viewport = { scrollTop: 0, scrollLeft: 0, width: 0, height: 0 };
  private dpr = 1;
  private renderers: ReadonlyMap<string, CellRenderer> = new Map();
  private cssWidth = -1;
  private cssHeight = -1;
  private lastViewport: Viewport | null = null;
  private lastDpr = 1;

  mount(host: HTMLElement, theme: Theme): void {
    this.theme = theme;
    const canvas = document.createElement("canvas");
    canvas.className = "sheetwrite-canvas";
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.pointerEvents = "none";
    host.appendChild(canvas);
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) throw new Error("Sheetwrite: 2D canvas context is unavailable");
    this.canvas = canvas;
    this.ctx = ctx;
  }

  setLayout(layout: RenderLayout): void {
    this.layout = layout;
    this.lastViewport = null;
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    this.lastViewport = null;
  }

  setRenderers(renderers: ReadonlyMap<string, CellRenderer>): void {
    this.renderers = renderers;
    this.lastViewport = null;
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
    if (this.cssWidth !== viewport.width || this.cssHeight !== viewport.height) {
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      this.cssWidth = viewport.width;
      this.cssHeight = viewport.height;
    }
  }

  paint(view: VisibleWindowView): void {
    if (!this.ctx || !this.layout || !this.theme) return;
    const damage = blitVerticalScroll(
      this.ctx,
      this.canvas!,
      this.theme,
      this.lastViewport,
      this.viewport,
      this.dpr,
      this.lastDpr,
    );
    paintFrame(
      this.ctx,
      view,
      this.layout,
      this.theme,
      this.viewport,
      this.dpr,
      this.renderers,
      damage,
    );
    this.lastViewport = { ...this.viewport };
    this.lastDpr = this.dpr;
  }

  paintPanes(panes: readonly PanePaint[], divider: { x: number | null; y: number | null }): void {
    const ctx = this.ctx;
    if (!ctx || !this.layout || !this.theme) return;

    // Frozen frames never blit: pane boundaries make the single-body-shift
    // assumption of `blitVerticalScroll` unsound. Invalidate its cache too.
    this.lastViewport = null;

    for (const pane of panes) {
      const viewport: Viewport = {
        scrollTop: pane.scrollTop,
        scrollLeft: pane.scrollLeft,
        width: this.viewport.width,
        height: this.viewport.height,
        rowTops: pane.rowTops,
        rowHeights: pane.rowHeights,
      };
      paintFrame(
        ctx,
        pane.view,
        this.layout,
        this.theme,
        viewport,
        this.dpr,
        this.renderers,
        undefined,
        pane.clip,
      );
    }

    paintFreezeDivider(ctx, this.theme, this.viewport, this.dpr, divider);
  }

  destroy(): void {
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
  }
}
