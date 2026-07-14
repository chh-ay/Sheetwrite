import type { AriaMirror } from "./aria-mirror.js";
import type { CellScalar } from "./types/cell.js";
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
  private paintInvalidationEpoch = 0;
  private dataInvalidationEpoch = 0;
  private columnWindowStart = -1;
  private columnWindowEnd = -1;
  private windowedColumnIndices: readonly number[] = [];
  private columnWindowSignature = "";
  private lastDataSignature = "";
  private lastPaintSignature = "";
  private lastPaintView: VisibleWindowView | null = null;
  private cachedPaneViews: VisibleWindowView[] = [];
  private readonly paneValuePools: CellScalar[][] = [];
  private destroyed = false;

  constructor(private readonly options: RenderCoordinatorOptions) {}

  get geometryVersion(): number {
    return this.options.storeEpoch() + this.paintInvalidationEpoch + this.dataInvalidationEpoch;
  }

  /** Invalidates pixel/layout paint state without discarding stable data windows. */
  invalidate(): void {
    this.paintInvalidationEpoch += 1;
  }

  /** Invalidates logical row/column contents or order and all dependent paint state. */
  invalidateData(): void {
    this.dataInvalidationEpoch += 1;
    this.paintInvalidationEpoch += 1;
  }

  invalidateColumns(): void {
    this.columnWindowStart = -1;
    this.columnWindowEnd = -1;
    this.windowedColumnIndices = [];
    this.columnWindowSignature = "";
    this.invalidateData();
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
    this.cachedPaneViews = [];
    this.lastDataSignature = "";
    this.lastPaintSignature = "";
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
      contentRevision: storeEpoch + this.dataInvalidationEpoch + this.paintInvalidationEpoch,
    };
    if (rowGeometry) {
      viewport.rowTops = rowGeometry.rowTops;
      viewport.rowHeights = rowGeometry.rowHeights;
    }
    this.options.renderer().setViewport(viewport);

    const dataSignature =
      `${this.options.activeSheet()}|${rows.start}|${rows.end}|${this.columnWindowSignature}` +
      `|${storeEpoch}|${this.dataInvalidationEpoch}|${frozenRows}|${frozenColumns}`;
    const paintSignature =
      `${dataSignature}|${contentTop}|${scrollLeft}|${clientWidth}|${clientHeight}` +
      `|${this.paintInvalidationEpoch}|${frozenHeight}|${frozenWidth}|${this.options.zoom()}`;
    const refreshData = this.lastPaintView === null || dataSignature !== this.lastDataSignature;
    const repaint = refreshData || paintSignature !== this.lastPaintSignature;

    let view: VisibleWindowView;
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
        refreshData,
        repaint,
      );
    } else {
      if (refreshData) {
        this.cachedPaneViews = [];
        this.lastPaintView = this.options.store.getVisibleWindow(
          this.options.activeSheet(),
          rows,
          this.windowedColumnIndices,
        );
      }
      view = this.lastPaintView!;
      if (repaint) this.options.renderer().paint(view);
    }
    this.lastPaintView = view;
    this.lastDataSignature = dataSignature;
    this.lastPaintSignature = paintSignature;
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
    refreshData: boolean,
    repaint: boolean,
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
    const paneView = (
      rows: { start: number; end: number },
      columns: readonly number[],
    ): VisibleWindowView => {
      const slot = panes.length;
      let view = this.cachedPaneViews[slot];
      if (refreshData || !view) {
        view = this.retainPaneView(
          this.options.store.getVisibleWindow(this.options.activeSheet(), rows, columns),
          slot,
        );
        this.cachedPaneViews[slot] = view;
      }
      return view;
    };

    if (frozenRows > 0 && frozenColumns > 0) {
      panes.push({
        view: paneView(frozenRowWindow, frozenColumnIndices),
        clip: { x: 0, y: 0, w: xSplit, h: ySplit },
        scrollTop: 0,
        scrollLeft: 0,
        rowTops: frozenGeometry?.rowTops,
        rowHeights: frozenGeometry?.rowHeights,
      });
    }
    if (frozenRows > 0) {
      panes.push({
        view: paneView(frozenRowWindow, bodyColumns),
        clip: { x: xSplit, y: 0, w: Math.max(0, clientWidth - xSplit), h: ySplit },
        scrollTop: 0,
        scrollLeft,
        rowTops: frozenGeometry?.rowTops,
        rowHeights: frozenGeometry?.rowHeights,
      });
    }
    if (frozenColumns > 0) {
      panes.push({
        view: paneView(bodyRows, frozenColumnIndices),
        clip: { x: 0, y: ySplit, w: xSplit, h: Math.max(0, clientHeight - ySplit) },
        scrollTop: contentTop,
        scrollLeft: 0,
        rowTops: bodyGeometry?.rowTops,
        rowHeights: bodyGeometry?.rowHeights,
      });
    }

    const bodyView = paneView(bodyRows, bodyColumns);
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
    this.cachedPaneViews.length = panes.length;
    if (repaint) {
      this.options.renderer().paintPanes?.(panes, {
        x: frozenColumns > 0 ? xSplit - 0.5 : null,
        y: frozenRows > 0 ? ySplit - 0.5 : null,
      });
    }
    return bodyView;
  }

  private retainPaneView(view: VisibleWindowView, slot: number): VisibleWindowView {
    let values = this.paneValuePools[slot];
    if (!values || values.length !== view.values.length) {
      values = new Array<CellScalar>(view.values.length);
      this.paneValuePools[slot] = values;
    }
    for (let index = 0; index < values.length; index++) values[index] = view.values[index] ?? null;
    return { ...view, values };
  }
}
