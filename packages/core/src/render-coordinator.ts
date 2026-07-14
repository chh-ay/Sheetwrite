import type { AriaMirror } from "./aria-mirror.js";
import type { DatasourceController } from "./datasource-controller.js";
import type { GeometryLayoutController } from "./geometry-layout-controller.js";
import type { OverlayPainter } from "./overlay-painter.js";
import type { SheetId } from "./types/coordinates.js";
import type { PanePaint, Renderer, Theme, Viewport } from "./types/render.js";
import type { Store, VisibleWindowView } from "./types/store.js";

export interface RenderCoordinatorOptions {
  renderer: () => Renderer;
  overlayPainter: OverlayPainter;
  ariaMirror: AriaMirror;
  geometry: GeometryLayoutController;
  datasource: DatasourceController;
  store: Store;
  activeSheet: () => SheetId;
  theme: () => Theme;
  overscan: () => number;
  zoom: () => number;
  storeEpoch: () => number;
  viewportHeight: () => number;
  viewportWidth: () => number;
  scrollTop: () => number;
  scrollLeft: () => number;
  repositionEditor: (contentTop: number, scrollLeft: number) => void;
  emitScroll: (event: { scrollTop: number; firstRow: number; lastRow: number }) => void;
}

/** Sole owner of frame scheduling, paint-window caches, and renderer/overlay updates. */
export class RenderCoordinator {
  private frame = 0;
  private invalidationEpoch = 0;
  private columnWindowStart = -1;
  private columnWindowEnd = -1;
  private windowedColumnIndices: readonly number[] = [];
  private columnWindowSignature = "";
  private lastPaintSignature = "";
  private lastPaintView: VisibleWindowView | null = null;
  private destroyed = false;

  constructor(private readonly options: RenderCoordinatorOptions) {}

  get geometryVersion(): number {
    return this.options.storeEpoch() + this.invalidationEpoch;
  }

  invalidate(): void {
    this.invalidationEpoch += 1;
  }

  invalidateColumns(): void {
    this.columnWindowStart = -1;
    this.columnWindowEnd = -1;
    this.windowedColumnIndices = [];
    this.columnWindowSignature = "";
    this.invalidate();
  }

  schedule(): void {
    if (this.frame || this.destroyed) return;
    const requestFrame =
      globalThis.requestAnimationFrame ??
      ((callback: FrameRequestCallback) => setTimeout(callback, 16));
    this.frame = requestFrame(() => {
      this.frame = 0;
      this.render();
    }) as unknown as number;
  }

  renderNow(): void {
    if (this.destroyed) return;
    if (this.frame) {
      (globalThis.cancelAnimationFrame ?? clearTimeout)(this.frame);
      this.frame = 0;
    }
    this.render();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.frame) {
      (globalThis.cancelAnimationFrame ?? clearTimeout)(this.frame);
      this.frame = 0;
    }
    this.lastPaintView = null;
  }

  private render(): void {
    const { geometry } = this.options;
    const clientHeight = this.options.viewportHeight();
    const clientWidth = this.options.viewportWidth();
    const theme = this.options.theme();
    const bodyHeight = Math.max(0, clientHeight - theme.headerHeight);
    const contentTop = geometry.toContent(this.options.scrollTop());
    const scrollLeft = this.options.scrollLeft();
    const cellViewportWidth = Math.max(0, clientWidth - theme.rowHeaderWidth);
    const paintWindow = geometry.paintWindow(
      contentTop,
      scrollLeft,
      bodyHeight,
      cellViewportWidth,
      this.options.overscan(),
    );
    const rows = paintWindow.rows;
    const columns = paintWindow.columns;
    const frozenRows = paintWindow.frozenRows;
    const frozenColumns = paintWindow.frozenColumns;
    const frozenHeight = paintWindow.frozenHeight;
    const frozenWidth = paintWindow.frozenWidth;
    const usePanes =
      (frozenRows > 0 || frozenColumns > 0) && this.options.renderer().paintPanes !== undefined;
    const rowGeometry = geometry.rowGeometry(rows);
    if (frozenRows > 0) this.options.datasource.ensureLoaded(0, frozenRows);
    this.options.datasource.ensureLoaded(rows.start, rows.end);

    if (columns.start !== this.columnWindowStart || columns.end !== this.columnWindowEnd) {
      this.columnWindowStart = columns.start;
      this.columnWindowEnd = columns.end;
      this.windowedColumnIndices = geometry.columnIndices.slice(columns.start, columns.end);
      this.columnWindowSignature = this.windowedColumnIndices.join(",");
      this.options.ariaMirror.bumpVersion();
    }

    const storeEpoch = this.options.storeEpoch();
    const viewport: Viewport = {
      scrollTop: contentTop,
      scrollLeft,
      width: clientWidth,
      height: clientHeight,
      contentRevision: storeEpoch + this.invalidationEpoch,
    };
    if (rowGeometry) {
      viewport.rowTops = rowGeometry.rowTops;
      viewport.rowHeights = rowGeometry.rowHeights;
    }
    this.options.renderer().setViewport(viewport);

    const paintSignature =
      `${this.options.activeSheet()}|${rows.start}|${rows.end}|${this.columnWindowSignature}` +
      `|${contentTop}|${scrollLeft}|${clientWidth}|${clientHeight}|${storeEpoch}` +
      `|${this.invalidationEpoch}|${frozenRows}|${frozenColumns}|${this.options.zoom()}`;

    let view = this.lastPaintView;
    if (!view || paintSignature !== this.lastPaintSignature) {
      if (usePanes) {
        view = this.paintFrozenPanes(
          rows,
          this.windowedColumnIndices,
          frozenRows,
          frozenColumns,
          frozenHeight,
          frozenWidth,
          contentTop,
          scrollLeft,
          clientWidth,
          clientHeight,
          rowGeometry,
        );
      } else {
        view = this.options.store.getVisibleWindow(
          this.options.activeSheet(),
          rows,
          this.windowedColumnIndices,
        );
        this.options.renderer().paint(view);
      }
      this.lastPaintView = view;
      this.lastPaintSignature = paintSignature;
    }
    this.options.ariaMirror.update(view);
    this.options.overlayPainter.paint(contentTop, scrollLeft, clientWidth, clientHeight);
    this.options.repositionEditor(contentTop, scrollLeft);
    this.options.emitScroll({
      scrollTop: contentTop,
      firstRow: rows.start,
      lastRow: Math.max(rows.start, rows.end - 1),
    });
  }

  private paintFrozenPanes(
    bodyRows: { start: number; end: number },
    bodyColumns: readonly number[],
    frozenRows: number,
    frozenColumns: number,
    frozenHeight: number,
    frozenWidth: number,
    contentTop: number,
    scrollLeft: number,
    clientWidth: number,
    clientHeight: number,
    bodyGeometry: { rowTops: Float64Array; rowHeights: Float64Array } | null,
  ): VisibleWindowView {
    const theme = this.options.theme();
    const gutter = theme.rowHeaderWidth;
    const headerHeight = theme.headerHeight;
    const xSplit = frozenColumns > 0 ? gutter + frozenWidth : 0;
    const ySplit = frozenRows > 0 ? headerHeight + frozenHeight : 0;
    const frozenRowWindow = { start: 0, end: frozenRows };
    const frozenColumnIndices =
      frozenColumns > 0 ? this.options.geometry.columnIndices.slice(0, frozenColumns) : [];
    const frozenGeometry =
      frozenRows > 0 ? this.options.geometry.frozenRowGeometry(frozenRows) : null;
    const panes: PanePaint[] = [];

    if (frozenRows > 0 && frozenColumns > 0) {
      panes.push({
        view: this.options.store.getVisibleWindow(
          this.options.activeSheet(),
          frozenRowWindow,
          frozenColumnIndices,
        ),
        clip: { x: 0, y: 0, w: xSplit, h: ySplit },
        scrollTop: 0,
        scrollLeft: 0,
        rowTops: frozenGeometry?.rowTops,
        rowHeights: frozenGeometry?.rowHeights,
      });
    }
    if (frozenRows > 0) {
      panes.push({
        view: this.options.store.getVisibleWindow(
          this.options.activeSheet(),
          frozenRowWindow,
          bodyColumns,
        ),
        clip: { x: xSplit, y: 0, w: Math.max(0, clientWidth - xSplit), h: ySplit },
        scrollTop: 0,
        scrollLeft,
        rowTops: frozenGeometry?.rowTops,
        rowHeights: frozenGeometry?.rowHeights,
      });
    }
    if (frozenColumns > 0) {
      panes.push({
        view: this.options.store.getVisibleWindow(
          this.options.activeSheet(),
          bodyRows,
          frozenColumnIndices,
        ),
        clip: { x: 0, y: ySplit, w: xSplit, h: Math.max(0, clientHeight - ySplit) },
        scrollTop: contentTop,
        scrollLeft: 0,
        rowTops: bodyGeometry?.rowTops,
        rowHeights: bodyGeometry?.rowHeights,
      });
    }

    const bodyView = this.options.store.getVisibleWindow(
      this.options.activeSheet(),
      bodyRows,
      bodyColumns,
    );
    panes.push({
      view: bodyView,
      clip: {
        x: xSplit,
        y: ySplit,
        w: Math.max(0, clientWidth - xSplit),
        h: Math.max(0, clientHeight - ySplit),
      },
      scrollTop: contentTop,
      scrollLeft,
      rowTops: bodyGeometry?.rowTops,
      rowHeights: bodyGeometry?.rowHeights,
    });
    this.options.renderer().paintPanes?.(panes, {
      x: frozenColumns > 0 ? xSplit - 0.5 : null,
      y: frozenRows > 0 ? ySplit - 0.5 : null,
    });
    return bodyView;
  }
}
