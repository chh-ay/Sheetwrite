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

/** Retains custom DOM-renderer nodes for the bounded paint window. */
export class DomOverlay {
  readonly element: HTMLDivElement;

  private readonly host: HTMLElement;
  private readonly geometry: GeometryLayoutController;
  private readonly entries = new Map<string, DomEntry>();
  private readonly rendererIds = new WeakMap<CellRenderer, number>();
  private readonly mergeMap = new Map<number, MergeRect>();
  private readonly styleCache = new Map<number, CellStyle>();
  private renderers: ReadonlyMap<string, CellRenderer> = new Map();
  private layout: RenderLayout | null = null;
  private theme: Theme | null = null;
  private mergeIndex: PreparedMergeIndex | null = null;
  private frame = 0;
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
    for (const entry of this.entries.values()) {
      if (renderers.get(entry.rendererName) !== entry.renderer) this.removeEntry(entry, true);
    }
  }

  paint(view: VisibleWindowView, viewport: Viewport): void {
    if (!this.beginFrame()) return;
    this.populateMergeMap(view);
    this.paintView(view, {
      x: 0,
      y: 0,
      w: viewport.width,
      h: viewport.height,
      scrollTop: viewport.scrollTop,
      scrollLeft: viewport.scrollLeft,
    });
    this.endFrame();
  }

  paintPanes(panes: readonly PanePaint[]): void {
    if (!this.beginFrame()) return;
    for (const pane of panes) this.populateMergeMap(pane.view);
    for (const pane of panes) {
      this.paintView(pane.view, {
        ...pane.clip,
        scrollTop: pane.scrollTop,
        scrollLeft: pane.scrollLeft,
      });
    }
    this.endFrame();
  }

  reset(): void {
    for (const entry of this.entries.values()) this.removeEntry(entry, true);
    this.entries.clear();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const entry of this.entries.values()) this.removeEntry(entry, false);
    this.entries.clear();
    this.element.removeEventListener("keydown", this.onKeyDown);
    this.element.remove();
  }

  private beginFrame(): boolean {
    if (this.destroyed || this.layout === null || this.theme === null) return false;
    this.frame += 1;
    this.mergeMap.clear();
    this.styleCache.clear();
    return true;
  }

  private endFrame(): void {
    for (const entry of this.entries.values()) {
      if (entry.frame !== this.frame) this.removeEntry(entry, true);
    }
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

  private paintView(
    view: VisibleWindowView,
    pane: { x: number; y: number; w: number; h: number; scrollTop: number; scrollLeft: number },
  ): void {
    const layout = this.layout!;
    const theme = this.theme!;
    const nCols = view.cols.length;
    const nRows = view.rows.end - view.rows.start;
    const styleStride = view.styles.length || 1;

    for (let rowOffset = 0; rowOffset < nRows; rowOffset++) {
      const row = view.rows.start + rowOffset;
      for (let colOffset = 0; colOffset < nCols; colOffset++) {
        const col = view.cols[colOffset]!;
        const merge = this.mergeMap.get(row * MERGE_KEY_STRIDE + col);
        if (merge && (merge.r0 !== row || merge.c0 !== col)) {
          this.retainCoveredMerge(view.sheet, merge, pane, theme);
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
            : this.effectiveStyle(col, styleId, styleStride, sourceStyle);
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
    sheet: string,
    merge: MergeRect,
    pane: { x: number; y: number; w: number; h: number; scrollTop: number; scrollLeft: number },
    theme: Theme,
  ): void {
    const rendererName = this.layout!.columns[merge.c0]?.renderer;
    const renderer = rendererName === undefined ? undefined : this.renderers.get(rendererName);
    if (renderer?.dom === undefined || rendererName === undefined) return;
    const key = `${sheet}\u0000${merge.r0}\u0000${merge.c0}\u0000${this.rendererId(renderer)}`;
    const entry = this.entries.get(key);
    if (entry === undefined || entry.frame === this.frame) return;

    const x = this.geometry.screenColumnLeft(merge.c0, pane.scrollLeft);
    const y = this.geometry.screenRowTop(merge.r0, pane.scrollTop);
    const w = this.geometry.columnLeft(merge.c1 + 1) - this.geometry.columnLeft(merge.c0);
    const h = this.geometry.rowOffset(merge.r1 + 1) - this.geometry.rowOffset(merge.r0);
    entry.context.x = x;
    entry.context.y = y;
    entry.context.w = w;
    entry.context.h = h;
    entry.context.theme = theme;
    entry.renderer.update?.(entry.node, entry.context);
    this.syncSemantics(entry);
    entry.frame = this.frame;
    this.positionEntry(entry, x, y, w, h, pane, theme);
  }

  private effectiveStyle(
    col: number,
    styleId: number,
    styleStride: number,
    sourceStyle: CellStyle,
  ): CellStyle {
    const columnStyle = this.layout!.columns[col]?.cellStyle;
    if (columnStyle === undefined) return sourceStyle;
    const key = col * styleStride + styleId;
    let style = this.styleCache.get(key);
    if (style === undefined) {
      style = { ...columnStyle, ...sourceStyle };
      this.styleCache.set(key, style);
    }
    return style;
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

    const clip = document.createElement("div");
    clip.className = "sheetwrite-dom-cell";
    clip.dataset.sheet = sheet;
    clip.dataset.row = String(row);
    clip.dataset.col = String(col);
    clip.style.cssText = "position:absolute;overflow:hidden;pointer-events:none;";
    const bounds = document.createElement("div");
    bounds.className = "sheetwrite-dom-cell-bounds";
    bounds.style.cssText = "position:absolute;pointer-events:none;";
    bounds.appendChild(node);
    clip.appendChild(bounds);
    this.element.appendChild(clip);

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
    this.syncSemantics(entry);
    return entry;
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
      if (next !== entry.node) {
        const hadFocus = entry.node.contains(document.activeElement);
        entry.renderer.destroy?.(entry.node);
        entry.bounds.replaceChildren(next);
        entry.node = next;
        if (hadFocus) this.focusHost();
      }
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
    entry.renderer.destroy?.(entry.node);
    entry.clip.remove();
    this.entries.delete(entry.key);
    if (restoreFocus && hadFocus) this.focusHost();
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
