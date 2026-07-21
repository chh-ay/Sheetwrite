import {
  intersectingMerges,
  type MergeRect,
  type PreparedMergeIndex,
  prepareMergeIndex,
} from "./canvas-paint.js";
import type { GeometryLayoutController } from "./geometry-layout-controller.js";
import type { CellScalar, CellStyle } from "./types/cell.js";
import type {
  CellPaintContext,
  CellRenderer,
  PanePaint,
  RenderLayout,
  Theme,
  Viewport,
} from "./types/render.js";
import type { VisibleWindowView } from "./types/store.js";

const MERGE_KEY_STRIDE = 0x100000;
const EMPTY_STYLE: CellStyle = {};
const INTERACTIVE_SELECTOR =
  "button,input,select,textarea,a[href],[contenteditable]:not([contenteditable='false']),[tabindex]:not([tabindex='-1'])";
const ACCESSIBLE_SELECTOR = `${INTERACTIVE_SELECTOR},[role],[aria-label],[aria-labelledby],[aria-description],[aria-describedby]`;
const EMPTY_ANCHOR_REQUESTS: readonly DomMergeAnchorRequest[] = [];
const EMPTY_WINDOW_VIEWS: readonly VisibleWindowView[] = [];

interface DomEntry {
  readonly key: string;
  readonly rendererName: string;
  readonly renderer: CellRenderer;
  readonly sheet: string;
  readonly row: number;
  readonly col: number;
  readonly clip: HTMLDivElement;
  readonly bounds: HTMLDivElement;
  readonly context: CellPaintContext;
  node: HTMLElement;
  sourceStyle: CellStyle;
  frame: number;
}

export interface DomOverlayOptions {
  readonly host: HTMLElement;
  readonly geometry: GeometryLayoutController;
}

/** One sparse row-window read containing only off-window DOM merge anchors. */
export interface DomMergeAnchorRequest {
  readonly sheet: string;
  readonly row: number;
  readonly cols: readonly number[];
}

/** Retains custom DOM-renderer nodes for the bounded paint window. */
export class DomOverlay {
  readonly element: HTMLDivElement;

  private readonly host: HTMLElement;
  private readonly geometry: GeometryLayoutController;
  private readonly entries = new Map<string, DomEntry>();
  private readonly rendererIds = new WeakMap<CellRenderer, number>();
  private readonly ownedNodes = new WeakSet<HTMLElement>();
  private readonly mergeMap = new Map<number, MergeRect>();
  private readonly styleCaches: Array<Map<number, CellStyle>> = [];
  private readonly styleTables: Array<VisibleWindowView["styles"]> = [];
  private renderers: ReadonlyMap<string, CellRenderer> = new Map();
  private layout: RenderLayout | null = null;
  private theme: Theme | null = null;
  private mergeIndex: PreparedMergeIndex | null = null;
  private frame = 0;
  private frameStyleTableCount = 0;
  private frameView: VisibleWindowView | null = null;
  private framePanes: readonly PanePaint[] | null = null;
  private frameAnchorViews: readonly VisibleWindowView[] = EMPTY_WINDOW_VIEWS;
  private nextRendererId = 1;
  private destroyed = false;

  constructor(parent: HTMLElement, options: DomOverlayOptions) {
    this.host = options.host;
    this.geometry = options.geometry;

    const element = document.createElement("div");
    element.className = "sheetwrite-dom-overlay";
    element.style.cssText = "position:absolute;inset:0;overflow:hidden;pointer-events:none;";
    element.addEventListener("keydown", this.onKeyDown);
    parent.appendChild(element);
    this.element = element;
  }

  setLayout(layout: RenderLayout): void {
    this.layout = layout;
    this.mergeIndex = layout.merges?.length ? prepareMergeIndex(layout.merges) : null;
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
  }

  setRenderers(renderers: ReadonlyMap<string, CellRenderer>): void {
    this.renderers = renderers;
    let failure: unknown;
    let failed = false;
    for (const entry of this.entries.values()) {
      if (renderers.get(entry.rendererName) === entry.renderer) continue;
      try {
        this.removeEntry(entry, true);
      } catch (error) {
        if (!failed) {
          failure = error;
          failed = true;
        }
      }
    }
    if (failed) throw failure;
  }

  paint(
    view: VisibleWindowView,
    viewport: Viewport,
    anchorViews: readonly VisibleWindowView[] = EMPTY_WINDOW_VIEWS,
  ): void {
    if (!this.beginFrame()) return;
    this.frameView = view;
    this.framePanes = null;
    this.frameAnchorViews = anchorViews;
    try {
      this.populateMergeMap(view);
      this.paintView(view, {
        x: 0,
        y: 0,
        w: viewport.width,
        h: viewport.height,
        scrollTop: viewport.scrollTop,
        scrollLeft: viewport.scrollLeft,
      });
    } catch (error) {
      this.finishFrame(error, true);
      return;
    }
    this.finishFrame(undefined, false);
  }

  paintPanes(
    panes: readonly PanePaint[],
    anchorViews: readonly VisibleWindowView[] = EMPTY_WINDOW_VIEWS,
  ): void {
    if (!this.beginFrame()) return;
    this.frameView = null;
    this.framePanes = panes;
    this.frameAnchorViews = anchorViews;
    try {
      for (const pane of panes) this.populateMergeMap(pane.view);
      for (const pane of panes) {
        this.paintView(pane.view, {
          ...pane.clip,
          scrollTop: pane.scrollTop,
          scrollLeft: pane.scrollLeft,
        });
      }
    } catch (error) {
      this.finishFrame(error, true);
      return;
    }
    this.finishFrame(undefined, false);
  }

  reset(): void {
    this.removeAllEntries(true);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    let failure: unknown;
    let failed = false;
    try {
      this.removeAllEntries(false);
    } catch (error) {
      failure = error;
      failed = true;
    }
    this.entries.clear();
    this.clearFrameSources();
    this.styleTables.length = 0;
    for (const cache of this.styleCaches) cache.clear();
    this.element.removeEventListener("keydown", this.onKeyDown);
    this.element.remove();
    if (failed) throw failure;
  }

  private beginFrame(): boolean {
    if (this.destroyed || this.layout === null || this.theme === null) return false;
    this.frame += 1;
    this.mergeMap.clear();
    for (let slot = 0; slot < this.frameStyleTableCount; slot++) {
      this.styleCaches[slot]!.clear();
    }
    this.styleTables.length = 0;
    this.frameStyleTableCount = 0;
    return true;
  }

  private endFrame(removeCurrentEntries: boolean): void {
    let failure: unknown;
    let failed = false;
    for (const entry of this.entries.values()) {
      if (!removeCurrentEntries && entry.frame === this.frame) continue;
      try {
        this.removeEntry(entry, true);
      } catch (error) {
        if (!failed) {
          failure = error;
          failed = true;
        }
      }
    }
    if (failed) throw failure;
  }

  private populateMergeMap(view: VisibleWindowView): void {
    if (this.mergeIndex === null || view.cols.length === 0) return;
    const merges = intersectingMerges(this.mergeIndex, view.rows.start, view.rows.end, view.cols);
    for (const merge of merges) {
      const rowStart = Math.max(view.rows.start, merge.r0);
      const rowEnd = Math.min(view.rows.end - 1, merge.r1);
      for (let row = rowStart; row <= rowEnd; row++) {
        const base = row * MERGE_KEY_STRIDE;
        for (const col of view.cols) {
          if (col >= merge.c0 && col <= merge.c1) this.mergeMap.set(base + col, merge);
        }
      }
    }
  }

  mergeAnchorRequests(views: readonly VisibleWindowView[]): readonly DomMergeAnchorRequest[] {
    if (this.mergeIndex === null || this.layout === null || views.length === 0) {
      return EMPTY_ANCHOR_REQUESTS;
    }

    const grouped = new Map<string, { sheet: string; row: number; cols: number[] }>();
    for (const view of views) {
      const merges = intersectingMerges(this.mergeIndex, view.rows.start, view.rows.end, view.cols);
      for (const merge of merges) {
        const rendererName = this.layout.columns[merge.c0]?.renderer;
        const renderer = rendererName === undefined ? undefined : this.renderers.get(rendererName);
        if (renderer?.dom === undefined) continue;

        let intersectsColumn = false;
        for (const col of view.cols) {
          if (col >= merge.c0 && col <= merge.c1) {
            intersectsColumn = true;
            break;
          }
        }
        if (
          !intersectsColumn ||
          this.findViewContaining(views, view.sheet, merge.r0, merge.c0) !== null
        ) {
          continue;
        }

        const key = `${view.sheet}\u0000${merge.r0}`;
        let request = grouped.get(key);
        if (request === undefined) {
          request = { sheet: view.sheet, row: merge.r0, cols: [] };
          grouped.set(key, request);
        }
        if (!request.cols.includes(merge.c0)) request.cols.push(merge.c0);
      }
    }
    if (grouped.size === 0) return EMPTY_ANCHOR_REQUESTS;

    const requests: DomMergeAnchorRequest[] = [];
    for (const request of grouped.values()) {
      request.cols.sort((left, right) => left - right);
      requests.push(request);
    }
    requests.sort((left, right) => left.sheet.localeCompare(right.sheet) || left.row - right.row);
    return requests;
  }

  private paintView(
    view: VisibleWindowView,
    pane: { x: number; y: number; w: number; h: number; scrollTop: number; scrollLeft: number },
  ): void {
    const layout = this.layout!;
    const theme = this.theme!;
    const nCols = view.cols.length;
    const nRows = view.rows.end - view.rows.start;
    const styleStride = view.styles.length || 1;
    const styleCache = this.styleCacheFor(view.styles);

    for (let rowOffset = 0; rowOffset < nRows; rowOffset++) {
      const row = view.rows.start + rowOffset;
      for (let colOffset = 0; colOffset < nCols; colOffset++) {
        const col = view.cols[colOffset]!;
        const merge = this.mergeMap.get(row * MERGE_KEY_STRIDE + col);
        if (merge && (merge.r0 !== row || merge.c0 !== col)) {
          this.retainCoveredMerge(view, merge, pane, theme);
          continue;
        }

        const column = layout.columns[col];
        const rendererName = column?.renderer;
        const renderer = rendererName === undefined ? undefined : this.renderers.get(rendererName);
        if (renderer?.dom === undefined || rendererName === undefined) continue;

        const rendererId = this.rendererId(renderer);
        const key = `${view.sheet}\u0000${row}\u0000${col}\u0000${rendererId}`;
        let entry = this.entries.get(key);
        const index = rowOffset * nCols + colOffset;
        const hasFreshStyle = index < view.styleIds.length;
        const styleId = hasFreshStyle ? view.styleIds[index]! : 0;
        const sourceStyle = hasFreshStyle
          ? (view.styles[styleId] ?? EMPTY_STYLE)
          : (entry?.sourceStyle ?? EMPTY_STYLE);
        const style =
          !hasFreshStyle && entry
            ? entry.context.style
            : this.effectiveStyle(styleCache, col, styleId, styleStride, sourceStyle);
        const value = view.values[index] ?? null;
        const rowEnd = merge?.r1 ?? row;
        const colEnd = merge?.c1 ?? col;
        const x = this.geometry.screenColumnLeft(col, pane.scrollLeft);
        const y = this.geometry.screenRowTop(row, pane.scrollTop);
        const w = this.geometry.columnLeft(colEnd + 1) - this.geometry.columnLeft(col);
        const h = this.geometry.rowOffset(rowEnd + 1) - this.geometry.rowOffset(row);

        if (entry === undefined) {
          const context: CellPaintContext = { value, x, y, w, h, theme, style };
          entry = this.createEntry(
            key,
            rendererName,
            renderer,
            context,
            sourceStyle,
            row,
            col,
            view.sheet,
          );
          this.entries.set(key, entry);
        } else {
          this.updateEntry(entry, value, x, y, w, h, theme, style, sourceStyle);
        }
        entry.frame = this.frame;
        this.positionEntry(entry, x, y, w, h, pane, theme);
      }
    }
  }

  private retainCoveredMerge(
    currentView: VisibleWindowView,
    merge: MergeRect,
    pane: { x: number; y: number; w: number; h: number; scrollTop: number; scrollLeft: number },
    theme: Theme,
  ): void {
    const rendererName = this.layout!.columns[merge.c0]?.renderer;
    const renderer = rendererName === undefined ? undefined : this.renderers.get(rendererName);
    if (renderer?.dom === undefined || rendererName === undefined) return;
    const key = `${currentView.sheet}\u0000${merge.r0}\u0000${merge.c0}\u0000${this.rendererId(renderer)}`;
    let entry = this.entries.get(key);
    if (entry?.frame === this.frame) return;

    const anchorView = this.findAnchorView(currentView, currentView.sheet, merge.r0, merge.c0);
    if (anchorView === null) return;
    const index = this.viewCellIndex(anchorView, currentView.sheet, merge.r0, merge.c0);
    if (index < 0) return;
    const hasFreshStyle = index < anchorView.styleIds.length;
    const styleId = hasFreshStyle ? anchorView.styleIds[index]! : 0;
    const sourceStyle = hasFreshStyle
      ? (anchorView.styles[styleId] ?? EMPTY_STYLE)
      : (entry?.sourceStyle ?? EMPTY_STYLE);
    const style =
      !hasFreshStyle && entry
        ? entry.context.style
        : this.effectiveStyle(
            this.styleCacheFor(anchorView.styles),
            merge.c0,
            styleId,
            anchorView.styles.length || 1,
            sourceStyle,
          );
    const value = anchorView.values[index] ?? null;
    const x = this.geometry.screenColumnLeft(merge.c0, pane.scrollLeft);
    const y = this.geometry.screenRowTop(merge.r0, pane.scrollTop);
    const w = this.geometry.columnLeft(merge.c1 + 1) - this.geometry.columnLeft(merge.c0);
    const h = this.geometry.rowOffset(merge.r1 + 1) - this.geometry.rowOffset(merge.r0);

    if (entry === undefined) {
      const context: CellPaintContext = { value, x, y, w, h, theme, style };
      entry = this.createEntry(
        key,
        rendererName,
        renderer,
        context,
        sourceStyle,
        merge.r0,
        merge.c0,
        currentView.sheet,
      );
      this.entries.set(key, entry);
    } else {
      this.updateEntry(entry, value, x, y, w, h, theme, style, sourceStyle);
    }
    entry.frame = this.frame;
    this.positionEntry(entry, x, y, w, h, pane, theme);
  }

  private effectiveStyle(
    cache: Map<number, CellStyle>,
    col: number,
    styleId: number,
    styleStride: number,
    sourceStyle: CellStyle,
  ): CellStyle {
    const columnStyle = this.layout!.columns[col]?.cellStyle;
    if (columnStyle === undefined) return sourceStyle;
    const key = col * styleStride + styleId;
    let style = cache.get(key);
    if (style === undefined) {
      style = { ...columnStyle, ...sourceStyle };
      cache.set(key, style);
    }
    return style;
  }

  private styleCacheFor(styles: VisibleWindowView["styles"]): Map<number, CellStyle> {
    for (let slot = 0; slot < this.frameStyleTableCount; slot++) {
      if (this.styleTables[slot] === styles) return this.styleCaches[slot]!;
    }
    const slot = this.frameStyleTableCount++;
    this.styleTables[slot] = styles;
    let cache = this.styleCaches[slot];
    if (cache === undefined) {
      cache = new Map();
      this.styleCaches[slot] = cache;
    }
    return cache;
  }

  private findAnchorView(
    currentView: VisibleWindowView,
    sheet: string,
    row: number,
    col: number,
  ): VisibleWindowView | null {
    if (this.viewCellIndex(currentView, sheet, row, col) >= 0) return currentView;
    if (
      this.frameView !== null &&
      this.frameView !== currentView &&
      this.viewCellIndex(this.frameView, sheet, row, col) >= 0
    ) {
      return this.frameView;
    }
    if (this.framePanes !== null) {
      for (const pane of this.framePanes) {
        if (pane.view !== currentView && this.viewCellIndex(pane.view, sheet, row, col) >= 0) {
          return pane.view;
        }
      }
    }
    return this.findViewContaining(this.frameAnchorViews, sheet, row, col);
  }

  private findViewContaining(
    views: readonly VisibleWindowView[],
    sheet: string,
    row: number,
    col: number,
  ): VisibleWindowView | null {
    for (const view of views) {
      if (this.viewCellIndex(view, sheet, row, col) >= 0) return view;
    }
    return null;
  }

  private viewCellIndex(view: VisibleWindowView, sheet: string, row: number, col: number): number {
    if (view.sheet !== sheet || row < view.rows.start || row >= view.rows.end) return -1;
    for (let colOffset = 0; colOffset < view.cols.length; colOffset++) {
      if (view.cols[colOffset] === col) {
        return (row - view.rows.start) * view.cols.length + colOffset;
      }
    }
    return -1;
  }

  private finishFrame(failure: unknown, failed: boolean): void {
    try {
      this.endFrame(failed);
    } catch (error) {
      if (!failed) {
        failure = error;
        failed = true;
      }
    }
    this.clearFrameSources();
    if (failed) throw failure;
  }

  private clearFrameSources(): void {
    this.frameView = null;
    this.framePanes = null;
    this.frameAnchorViews = EMPTY_WINDOW_VIEWS;
  }

  private createEntry(
    key: string,
    rendererName: string,
    renderer: CellRenderer,
    context: CellPaintContext,
    sourceStyle: CellStyle,
    row: number,
    col: number,
    sheet: string,
  ): DomEntry {
    const node = renderer.dom!(context);
    if (!(node instanceof HTMLElement)) {
      throw new TypeError("Sheetwrite: CellRenderer.dom() must return an HTMLElement");
    }
    this.claimRendererNode(node);

    const clip = document.createElement("div");
    clip.className = "sheetwrite-dom-cell";
    clip.dataset.sheet = sheet;
    clip.dataset.row = String(row);
    clip.dataset.col = String(col);
    clip.style.cssText = "position:absolute;overflow:hidden;pointer-events:none;";
    const bounds = document.createElement("div");
    bounds.className = "sheetwrite-dom-cell-bounds";
    bounds.style.cssText = "position:absolute;pointer-events:none;";
    const entry: DomEntry = {
      key,
      rendererName,
      sheet,
      row,
      col,
      renderer,
      clip,
      bounds,
      context,
      node,
      sourceStyle,
      frame: this.frame,
    };

    try {
      bounds.appendChild(node);
      clip.appendChild(bounds);
      this.element.appendChild(clip);
      this.syncSemantics(entry);
      return entry;
    } catch (error) {
      try {
        this.removeEntry(entry, false);
      } catch {
        // Preserve the creation failure after completing structural cleanup.
      }
      throw error;
    }
  }

  private updateEntry(
    entry: DomEntry,
    value: CellScalar,
    x: number,
    y: number,
    w: number,
    h: number,
    theme: Theme,
    style: CellStyle,
    sourceStyle: CellStyle,
  ): void {
    const context = entry.context;
    const needsLegacyRefresh =
      context.value !== value ||
      context.w !== w ||
      context.h !== h ||
      context.theme !== theme ||
      context.style !== style;
    context.value = value;
    context.x = x;
    context.y = y;
    context.w = w;
    context.h = h;
    context.theme = theme;
    context.style = style;
    entry.sourceStyle = sourceStyle;

    if (entry.renderer.update) {
      entry.renderer.update(entry.node, context);
    } else if (needsLegacyRefresh) {
      const next = entry.renderer.dom!(context);
      if (!(next instanceof HTMLElement)) {
        throw new TypeError("Sheetwrite: CellRenderer.dom() must return an HTMLElement");
      }
      this.claimRendererNode(next);
      const previous = entry.node;
      const hadFocus = previous.contains(document.activeElement);
      let failure: unknown;
      let failed = false;
      try {
        entry.renderer.destroy?.(previous);
      } catch (error) {
        failure = error;
        failed = true;
      }
      this.ownedNodes.delete(previous);
      entry.bounds.replaceChildren(next);
      entry.node = next;
      if (hadFocus) {
        try {
          this.focusHost();
        } catch (error) {
          if (!failed) {
            failure = error;
            failed = true;
          }
        }
      }
      if (failed) throw failure;
    }
    this.syncSemantics(entry);
  }

  private positionEntry(
    entry: DomEntry,
    x: number,
    y: number,
    w: number,
    h: number,
    pane: { x: number; y: number; w: number; h: number },
    theme: Theme,
  ): void {
    const left = Math.max(0, theme.rowHeaderWidth, pane.x, x);
    const top = Math.max(0, theme.headerHeight, pane.y, y);
    const right = Math.min(pane.x + pane.w, x + w);
    const bottom = Math.min(pane.y + pane.h, y + h);
    if (right <= left || bottom <= top) {
      entry.clip.style.display = "none";
      return;
    }

    const clipStyle = entry.clip.style;
    clipStyle.display = "block";
    clipStyle.left = `${left}px`;
    clipStyle.top = `${top}px`;
    clipStyle.width = `${right - left}px`;
    clipStyle.height = `${bottom - top}px`;
    const boundsStyle = entry.bounds.style;
    boundsStyle.left = `${x - left}px`;
    boundsStyle.top = `${y - top}px`;
    boundsStyle.width = `${w}px`;
    boundsStyle.height = `${h}px`;
  }

  private syncSemantics(entry: DomEntry): void {
    const accessible =
      entry.node.matches(ACCESSIBLE_SELECTOR) || entry.node.querySelector(ACCESSIBLE_SELECTOR);
    if (accessible) entry.clip.removeAttribute("aria-hidden");
    else entry.clip.setAttribute("aria-hidden", "true");

    const interactive =
      entry.node.matches(INTERACTIVE_SELECTOR) ||
      entry.node.querySelector(INTERACTIVE_SELECTOR) !== null;
    entry.clip.dataset.interactive = interactive ? "true" : "false";
    entry.clip.style.pointerEvents = interactive ? "auto" : "none";
  }

  private removeEntry(entry: DomEntry, restoreFocus: boolean): void {
    const hadFocus = entry.node.contains(document.activeElement);
    let failure: unknown;
    let failed = false;
    try {
      entry.renderer.destroy?.(entry.node);
    } catch (error) {
      failure = error;
      failed = true;
    }
    this.ownedNodes.delete(entry.node);
    entry.node.remove();
    entry.clip.remove();
    this.entries.delete(entry.key);
    if (restoreFocus && hadFocus) {
      try {
        this.focusHost();
      } catch (error) {
        if (!failed) {
          failure = error;
          failed = true;
        }
      }
    }
    if (failed) throw failure;
  }

  private removeAllEntries(restoreFocus: boolean): void {
    let failure: unknown;
    let failed = false;
    for (const entry of this.entries.values()) {
      try {
        this.removeEntry(entry, restoreFocus);
      } catch (error) {
        if (!failed) {
          failure = error;
          failed = true;
        }
      }
    }
    if (failed) throw failure;
  }

  private claimRendererNode(node: HTMLElement): void {
    if (this.ownedNodes.has(node)) {
      throw new TypeError(
        "Sheetwrite: CellRenderer.dom() must return a unique HTMLElement for each cell",
      );
    }
    if (node.parentNode !== null || node.isConnected) {
      throw new TypeError(
        "Sheetwrite: CellRenderer.dom() must return a fresh detached HTMLElement",
      );
    }
    this.ownedNodes.add(node);
  }

  private focusHost(): void {
    this.host.focus({ preventScroll: true });
  }

  private rendererId(renderer: CellRenderer): number {
    let id = this.rendererIds.get(renderer);
    if (id === undefined) {
      id = this.nextRendererId++;
      this.rendererIds.set(renderer, id);
    }
    return id;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const cell = target.closest<HTMLElement>(".sheetwrite-dom-cell");
    if (cell?.dataset.interactive === "true") event.stopPropagation();
  };
}
