import { load } from "@sheetwrite/wasm";
import { colToA1 } from "./a1.js";
import { AriaMirror } from "./aria-mirror.js";
import { CanvasRenderer } from "./canvas-renderer.js";
import { parseCellInput } from "./cell-input.js";
import { ClipboardController } from "./clipboard-controller.js";
import { ColumnIndex } from "./column-index.js";
import { ContextMenu } from "./context-menu.js";
import { EditController, type EditNavigate } from "./editor.js";
import { downloadBytes, toCsv, toXlsx } from "./export.js";
import { OffsetIndex, ScaledScroll } from "./fenwick.js";
import { FindBar } from "./find-bar.js";
import { UndoManager } from "./history.js";
import { InputController } from "./input-controller.js";
import { OverlayPainter } from "./overlay-painter.js";
import { SearchController } from "./search-controller.js";
import { type CellRef, SelectionModel, type SelRect } from "./selection.js";
import { SheetTabs } from "./sheet-tabs.js";
import { SheetwriteStore } from "./store.js";
import { StyleActions } from "./style-actions.js";
import { Toolbar } from "./toolbar.js";
import type {
  AggregateOp,
  CellAddress,
  CellInputSnapshot,
  CellRenderer,
  CellScalar,
  CellStyle,
  CellValue,
  Column,
  ColumnFilter,
  Grid,
  GridActions,
  GridConfig,
  GridEvents,
  GridOptions,
  GridTransaction,
  HighlightRange,
  PanePaint,
  Patch,
  Range,
  Renderer,
  ReplaceResult,
  RowGroup,
  SearchOptions,
  SearchResult,
  Selection,
  Sheet,
  SheetId,
  SortKey,
  Store,
  Theme,
  Viewport,
  VisibleWindowView,
  Workbook,
} from "./types.js";
import { computeColumnWindow, computeWindow } from "./virtualization.js";
import { WorkerRenderer } from "./worker-renderer.js";

/** Chrome caps element height near here; beyond it the sizer is scaled. */
const MAX_ELEMENT_HEIGHT = 33_000_000;
const DEFAULT_OVERSCAN = 6;
const DEFAULT_COL_WIDTH = 100;

/** Scale every `<n>px` occurrence in a CSS font shorthand by `zoom`. */
function scaleFontPx(font: string, zoom: number): string {
  return font.replace(
    /(\d+(?:\.\d+)?)px/g,
    (_, px: string) => `${Math.round(Number.parseFloat(px) * zoom * 10) / 10}px`,
  );
}

export const DEFAULT_THEME: Theme = {
  font: "13px system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  bg: "#ffffff",
  fg: "#111111",
  gridLine: "#eeeeee",
  headerBg: "#f4ede1",
  headerFg: "#6b4a1f",
  selection: "#2563eb22",
  selectionBorder: "#2563eb",
  rowHeight: 28,
  headerHeight: 32,
  rowHeaderWidth: 48,
  searchMatch: "#ffd54f80",
  searchActiveMatch: "#f59e0b",
  highlight: "#a7f3d080",
};

let wasmReady = false;

/** Load the WASM data engine once. Must be awaited before `createGrid`. */
export async function initSheetwrite(
  source?: BufferSource | URL | string | Request | WebAssembly.Module,
): Promise<void> {
  await load(source);
  wasmReady = true;
}

/** Read `--sheetwrite-*` CSS custom properties into a partial theme. */
export function resolveThemeFromCss(el: HTMLElement): Partial<Theme> {
  if (typeof getComputedStyle !== "function") return {};

  const cs = getComputedStyle(el);
  const theme: Partial<Theme> = {};
  const read = (name: string): string => cs.getPropertyValue(name).trim();

  const map: Array<[keyof Theme, string]> = [
    ["bg", "--sheetwrite-bg"],
    ["fg", "--sheetwrite-fg"],
    ["gridLine", "--sheetwrite-grid-line"],
    ["headerBg", "--sheetwrite-header-bg"],
    ["headerFg", "--sheetwrite-header-fg"],
    ["selection", "--sheetwrite-selection"],
    ["selectionBorder", "--sheetwrite-selection-border"],
    ["searchMatch", "--sheetwrite-search-match"],
    ["searchActiveMatch", "--sheetwrite-search-active"],
    ["highlight", "--sheetwrite-highlight"],
  ];
  for (const [key, prop] of map) {
    const value = read(prop);
    if (value) (theme[key] as string) = value;
  }

  const rh = read("--sheetwrite-row-height");
  if (rh) theme.rowHeight = Number.parseFloat(rh);
  return theme;
}

export function createGrid(host: HTMLElement, opts: GridOptions): Grid {
  if (!wasmReady) {
    throw new Error("Sheetwrite: await initSheetwrite() before createGrid()");
  }
  return new GridImpl(host, opts);
}

export class GridImpl implements Grid {
  readonly store: Store;
  readonly actions: GridActions;
  private readonly loadable: SheetwriteStore | null;
  /**
   * Store ownership. `true` when the grid constructed its own `SheetwriteStore`
   * (no store was injected via the constructor). Only an owned store is disposed
   * in `destroy()`; a caller-provided store outlives the grid, so freeing its
   * WASM `CellStore` is the caller's responsibility, not ours.
   */
  private readonly ownsStore: boolean;
  private readonly host: HTMLElement;
  private readonly scroller: HTMLDivElement;
  private readonly sizer: HTMLDivElement;
  private readonly renderer: Renderer;
  private readonly editor: EditController;
  private readonly input: InputController;
  private readonly ariaMirror: AriaMirror;
  private readonly searchController: SearchController;
  private readonly clipboard: ClipboardController;
  private readonly styleActions: StyleActions;
  private readonly overlayPainter: OverlayPainter;
  private readonly overscan: number;
  private readonly datasource: GridOptions["datasource"];
  private readOnly: boolean;
  private tabBar: HTMLDivElement | null = null;
  private sheetTabs: SheetTabs | null = null;
  private tabBarHeight = 0;
  private keyboardPolicy: boolean | ((e: KeyboardEvent) => boolean) = true;
  private zoom = 1;
  private baseTheme: Theme;
  private toolbar: Toolbar | null = null;
  private contextMenu: ContextMenu | null = null;
  private findBar: FindBar | null = null;
  private config: GridConfig | undefined;
  private toolbarHeight = 0;
  private readonly viewportEl: HTMLDivElement;
  private readonly merges = new Map<SheetId, SelRect[]>();
  private readonly history = new UndoManager();
  private applyingHistory = false;
  private rowTopsScratch = new Float64Array(0);
  private rowHeightsScratch = new Float64Array(0);
  private rowTopsView = this.rowTopsScratch;
  private rowHeightsView = this.rowHeightsScratch;
  private rowGeometryLength = 0;
  private readonly onContextMenu = (e: MouseEvent): void => {
    if (!this.contextMenu) return;
    e.preventDefault();

    const cell = this.input.cellAtPointer(e.clientX, e.clientY);
    if (cell && !this.selection.contains(cell.row, cell.col)) {
      this.selection.selectCell(cell.row, cell.col);
      this.emitSelection();
      this.scheduleRender();
    }

    const addr = cell ? { sheet: this.activeSheet, row: cell.row, col: cell.col } : null;
    this.contextMenu.open(e.clientX, e.clientY, addr);
  };
  private readonly customRenderers = new Map<string, CellRenderer>();
  private readonly listeners: { [K in keyof GridEvents]: Set<(e: GridEvents[K]) => void> } = {
    change: new Set(),
    selection: new Set(),
    scroll: new Set(),
    "edit-begin": new Set(),
    "edit-commit": new Set(),
    search: new Set(),
    "active-sheet": new Set(),
  };

  private theme: Theme;
  private activeSheet: SheetId;
  /** Memoized active `Sheet` object; invalidated on store change / tab switch. */
  private activeSheetCache: Sheet | null = null;
  private index: OffsetIndex;
  private scaled: ScaledScroll;
  private colIndices: number[];
  private columnIndex: ColumnIndex;
  private selection: SelectionModel;
  private loaded: Uint8Array;
  private inFlight = new Set<number>();
  private loadGeneration = 0;
  private destroyed = false;
  private frame = 0;
  private columnWindowStart = -1;
  private columnWindowEnd = -1;
  private windowedColIndices: readonly number[] = [];
  private columnWindowSignature = "";
  private storeEpoch = 0;
  private paintEpoch = 0;
  private lastPaintSignature = "";
  private lastPaintView: VisibleWindowView | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private readonly onScroll = () => this.scheduleRender();
  private readonly disposeStore: () => void;

  constructor(host: HTMLElement, opts: GridOptions, store?: Store) {
    this.host = host;
    const workbook = store ? opts.workbook : padColumns(opts.workbook, opts, host);
    this.store = store ?? new SheetwriteStore(workbook, opts.data);
    this.loadable = this.store instanceof SheetwriteStore ? this.store : null;
    this.ownsStore = store === undefined;
    this.datasource = opts.datasource;
    this.readOnly = opts.readOnly ?? false;
    this.config = opts.config;
    this.overscan = opts.overscan ?? DEFAULT_OVERSCAN;
    this.baseTheme = { ...DEFAULT_THEME, ...resolveThemeFromCss(host), ...opts.theme };
    this.theme = this.baseTheme;
    this.activeSheet = opts.workbook.activeSheet;
    this.tabBarHeight = opts.config?.tabs !== false && opts.workbook.sheets.length > 1 ? 28 : 0;

    // Headless hosts opt out of (or intercept) the stock key bindings once at
    // construction; the input controller consults this on every keydown.
    const keyboardOpt = opts.config?.keyboard ?? true;
    this.keyboardPolicy =
      typeof keyboardOpt === "function" ? (e: KeyboardEvent) => keyboardOpt(e, this) : keyboardOpt;

    for (const [name, r] of Object.entries(opts.renderers ?? {})) {
      this.customRenderers.set(name, r);
    }

    const sheet = this.sheet();
    this.colIndices = visibleColumns(sheet.columns);
    this.columnIndex = buildColumnIndex(sheet, this.colIndices, this.zoom);
    this.index = new OffsetIndex(sheet.rowCount, this.theme.rowHeight);
    this.applyRowHeights(sheet);
    this.scaled = new ScaledScroll(
      this.index.totalHeight + this.theme.headerHeight,
      host.clientHeight - this.tabBarHeight,
      MAX_ELEMENT_HEIGHT,
    );
    this.selection = new SelectionModel(sheet.rowCount, this.firstCol(), this.lastCol());
    this.loaded = new Uint8Array(sheet.rowCount);
    this.searchController = new SearchController({
      store: this.store,
      loadable: this.loadable,
      activeSheet: () => this.activeSheet,
      sheet: (id) => this.sheet(id),
      toViewRow: (dataRow) => this.toViewRow(dataRow),
      scrollToCell: (addr) => this.scrollToCell(addr),
      scheduleRender: () => this.scheduleRender(),
      emit: (result) => {
        for (const fn of this.listeners.search) fn(result);
      },
      readOnly: () => this.readOnly,
      commit: (patches) => this.commit(patches),
    });
    this.clipboard = new ClipboardController({
      store: this.store,
      selection: () => this.selection,
      activeSheet: () => this.activeSheet,
      sheet: () => this.sheet(),
      colIndices: () => this.colIndices,
      readOnly: () => this.readOnly,
      mergeAnchorAt: (row, col) => this.mergeAnchorAt(row, col),
      toDataRow: (viewRow) => this.toDataRow(viewRow),
      commit: (patches) => this.commit(patches),
    });
    this.styleActions = new StyleActions({
      store: this.store,
      loadable: this.loadable,
      selection: () => this.selection,
      activeSheet: () => this.activeSheet,
      sheet: () => this.sheet(),
      readOnly: () => this.readOnly,
      theme: () => this.theme,
      merges: this.merges,
      anchorCell: (row, col) => this.anchorCell(row, col),
      toDataRow: (viewRow) => this.toDataRow(viewRow),
      commit: (patches) => this.commit(patches),
      applyLayout: () => this.applyLayout(),
    });

    this.actions = this.buildActions();

    // host chrome: optional toolbar (top) + viewport (cells) + optional tab bar.
    host.classList.add("sheetwrite");
    host.style.position = host.style.position || "relative";
    host.style.overflow = "hidden";
    if (!host.hasAttribute("tabindex")) host.tabIndex = 0;

    const config = this.config;
    if (config && config.toolbar !== false) {
      this.toolbar = new Toolbar(host, config, this.theme, this);
      this.toolbarHeight = Toolbar.height;
    }

    if (config?.contextMenu !== false) {
      this.contextMenu = new ContextMenu(host, config ?? {}, this.theme, this.actions, this);
    }

    if (config?.find !== false) {
      this.findBar = new FindBar(host, this.theme, this, this.readOnly);
    }

    this.viewportEl = document.createElement("div");
    this.viewportEl.className = "sheetwrite-viewport";
    this.viewportEl.style.cssText = `position:absolute;left:0;right:0;top:${this.toolbarHeight}px;bottom:${this.tabBarHeight}px;`;
    host.appendChild(this.viewportEl);

    this.scroller = document.createElement("div");
    this.scroller.className = "sheetwrite-scroller";
    this.scroller.style.cssText = "position:absolute;inset:0;overflow:auto;will-change:transform;";
    this.sizer = document.createElement("div");
    this.sizer.className = "sheetwrite-sizer";
    this.scroller.appendChild(this.sizer);
    this.viewportEl.appendChild(this.scroller);

    this.renderer = this.createRenderer(opts, this.viewportEl);
    this.renderer.setRenderers(this.customRenderers);

    this.editor = new EditController(this.viewportEl, {
      highlightCells: (ranges) => this.highlightCells(ranges),
      sheet: () => this.activeSheet,
    });
    this.input = new InputController({
      host,
      scroller: this.scroller,
      viewportEl: this.viewportEl,
      editor: this.editor,
      findBar: () => this.findBar,
      store: this.store,
      loadable: this.loadable,
      selection: () => this.selection,
      activeSheet: () => this.activeSheet,
      sheet: () => this.sheet(),
      theme: () => this.theme,
      colIndices: () => this.colIndices,
      firstCol: () => this.firstCol(),
      lastCol: () => this.lastCol(),
      nextVisibleCol: (col, dir) => this.nextVisibleCol(col, dir),
      colAtX: (contentX) => this.colAtX(contentX),
      rowAtOffset: (contentY) => this.index.rowAtOffset(contentY).row,
      rowCount: () => this.index.count,
      contentTop: () => this.scaled.toContent(this.scroller.scrollTop),
      viewportH: () => this.viewportH(),
      colLeftOf: (col) => this.colLeftOf(col),
      rowTop: (row) => this.index.offsetOf(row),
      rowHeight: (row) => this.index.heightOf(row),
      visibleRowWindow: () =>
        computeWindow(
          this.index,
          this.scaled.toContent(this.scroller.scrollTop),
          Math.max(0, this.viewportH() - this.theme.headerHeight),
          this.overscan,
        ),
      previewColumnWidth: (col, width) => {
        const column = this.sheet().columns[col];
        if (!column) return;
        column.width = width;
        this.rebuildColumnIndex();
        this.applyLayout();
        this.scheduleRender();
      },
      setRowHeight: (row, height) => this.setRowHeight(row, height / this.zoom),
      dataEdge: (row, col, dRow, dCol) => this.dataEdge(row, col, dRow, dCol),
      keyboard: () => this.keyboardPolicy,
      contentXAt: (viewportX) => this.contentXAt(viewportX),
      contentYAt: (viewportY) => this.contentYAt(viewportY),
      zoom: () => this.zoom,
      screenRect: (row, col, contentTop, scrollLeft) =>
        this.screenRect(row, col, contentTop, scrollLeft),
      anchorCell: (row, col) => this.anchorCell(row, col),
      toDataRow: (viewRow) => this.toDataRow(viewRow),
      beginEdit: (row, col, initial, selectAll) => this.beginEdit(row, col, initial, selectAll),
      clearSelection: () => this.clearSelection(),
      emitSelection: () => this.emitSelection(),
      scrollToCell: (addr) => this.scrollToCell(addr),
      scheduleRender: () => this.scheduleRender(),
      undo: () => this.undo(),
      redo: () => this.redo(),
      copy: () => this.clipboard.copy(),
      cut: () => this.clipboard.cut(),
      paste: () => void this.clipboard.paste(),
      pasteValues: () => void this.clipboard.pasteValues(),
      commit: (patches) => this.commit(patches),
      readOnly: () => this.readOnly,
    });

    this.overlayPainter = new OverlayPainter(this.viewportEl, {
      theme: () => this.theme,
      activeSheet: () => this.activeSheet,
      sheet: () => this.sheet(),
      selection: () => this.selection,
      rowOffsetOf: (row) => this.index.offsetOf(row),
      freeze: () => ({
        fr: this.frozenRowCount(),
        frozenH: this.frozenHeight(),
        frozenW: this.frozenWidth(),
        firstBodyCol: this.firstBodyCol(),
      }),
      zoom: () => this.zoom,
      colLeftOf: (col) => this.colLeftOf(col),
      screenRect: (row, col, contentTop, scrollLeft) =>
        this.screenRect(row, col, contentTop, scrollLeft),
      toViewRow: (dataRow) => this.toViewRow(dataRow),
      isEditing: () => this.editor.isEditing,
      fillTarget: () => this.input.fillPreview,
      fillHandleScreen: (contentTop, scrollLeft) =>
        this.input.fillHandleScreen(contentTop, scrollLeft),
      searchMatches: () => this.searchController.matches,
      searchActive: () => this.searchController.active,
      searchVersion: () => this.searchController.version,
      geometryVersion: () => this.storeEpoch + this.paintEpoch,
      scheduleRender: () => this.scheduleRender(),
    });

    this.ariaMirror = new AriaMirror({
      host,
      scroller: this.scroller,
      overlay: this.overlayPainter.element,
      viewport: this.viewportEl,
      rowCount: sheet.rowCount,
      colCount: this.colIndices.length,
      readOnly: this.readOnly,
      focusCell: () => this.selection.focusCell,
    });

    if (this.tabBarHeight > 0) this.buildTabBar();

    this.disposeStore = this.store.on("change", (event) => {
      this.storeEpoch += 1;
      this.activeSheetCache = null;
      let shouldRebuildRows = false;
      let shouldRebuildColumns = false;
      for (const patch of event.transaction.patches) {
        if (patch.op === "addRows" || patch.op === "removeRows") {
          shouldRebuildRows = true;
        } else if (
          patch.op === "addColumns" ||
          patch.op === "removeColumns" ||
          (patch.op === "setColumn" &&
            patch.sheet === this.activeSheet &&
            ("width" in patch.patch || "visible" in patch.patch))
        ) {
          shouldRebuildColumns = true;
        }
      }
      // One rebuild per transaction: a bulk insert/delete of m row patches
      // would otherwise pay m full O(rows) index rebuilds.
      if (shouldRebuildRows) this.rebuildIndex();
      if (shouldRebuildColumns) {
        this.rebuildColumnIndex();
        this.applyLayout();
      }
      this.ariaMirror.bumpVersion();
      this.scheduleRender();
      for (const fn of this.listeners.change) fn(event);
    });

    this.applyLayout();
    this.scroller.addEventListener("scroll", this.onScroll, { passive: true });
    this.scroller.addEventListener("contextmenu", this.onContextMenu);
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.onResize());
      this.resizeObserver.observe(host);
    }
    this.render();
  }

  private createRenderer(opts: GridOptions, host: HTMLElement): Renderer {
    if (opts.renderer === "worker") {
      try {
        const worker = new WorkerRenderer(opts.workerUrl);
        worker.mount(host, this.theme);
        return worker;
      } catch {
        // worker unavailable (no OffscreenCanvas / bundling) — fall back to canvas
      }
    }
    const canvas = new CanvasRenderer();
    canvas.mount(host, this.theme);
    return canvas;
  }

  // ── sheet / layout geometry ────────────────────────────────────────────────

  private sheet(id: SheetId = this.activeSheet): Sheet {
    if (id === this.activeSheet && this.activeSheetCache) return this.activeSheetCache;

    const s = this.store.getWorkbook().sheets.find((sh) => sh.id === id);
    if (!s) throw new Error(`Sheetwrite: unknown sheet ${id}`);
    if (id === this.activeSheet) this.activeSheetCache = s;
    return s;
  }

  private viewportH(): number {
    return this.viewportEl.clientHeight;
  }

  private buildTabBar(): void {
    const bar = document.createElement("div");
    bar.className = "sheetwrite-tabbar";
    // Positioning is behavior (the bar reserves this.tabBarHeight in the host
    // layout); everything cosmetic lives in styles.css behind CSS custom
    // properties seeded from the theme, so host CSS can restyle freely.
    bar.style.position = "absolute";
    bar.style.left = "0";
    bar.style.right = "0";
    bar.style.bottom = "0";
    bar.style.height = `${this.tabBarHeight}px`;
    this.host.appendChild(bar);
    this.tabBar = bar;
    this.sheetTabs = new SheetTabs(bar, { onActivate: (id) => this.setActiveSheet(id) });
    this.syncTabBarTheme();
    this.renderTabs();
  }

  /** Re-seed the tab bar's CSS custom properties from the (base) theme. */
  private syncTabBarTheme(): void {
    const bar = this.tabBar;
    if (!bar) return;
    bar.style.setProperty("--sheetwrite-tab-font", this.baseTheme.font);
    bar.style.setProperty("--sheetwrite-tab-bg", this.baseTheme.bg);
    bar.style.setProperty("--sheetwrite-tab-fg", this.baseTheme.headerFg);
    bar.style.setProperty("--sheetwrite-tab-border", this.baseTheme.gridLine);
    bar.style.setProperty("--sheetwrite-tab-hover-bg", this.baseTheme.headerBg);
    bar.style.setProperty("--sheetwrite-tab-active-bg", this.baseTheme.selection);
    bar.style.setProperty("--sheetwrite-tab-active-fg", this.baseTheme.selectionBorder);
  }

  private renderTabs(): void {
    this.sheetTabs?.update(this.store.getWorkbook().sheets, this.activeSheet);
  }

  private firstCol(): number {
    return this.colIndices[0] ?? 0;
  }

  private lastCol(): number {
    return this.colIndices[this.colIndices.length - 1] ?? 0;
  }

  private colLeftOf(col: number): number {
    return this.columnIndex.leftOf(col);
  }

  private colAtX(contentX: number): number {
    return this.columnIndex.columnAtX(contentX);
  }

  private nextVisibleCol(col: number, dir: 1 | -1): number {
    const pos = this.columnIndex.positionOf(col);
    if (pos === -1) return col;
    const next = pos + dir;
    if (next < 0 || next >= this.colIndices.length) return col;
    return this.colIndices[next]!;
  }

  // ── Frozen-pane geometry ─────────────────────────────────────────────────--

  /** Frozen leading view rows, clamped to leave at least one scrollable row. */
  private frozenRowCount(): number {
    const fr = this.sheet().frozenRows ?? 0;
    return Math.max(0, Math.min(fr, Math.max(0, this.index.count - 1)));
  }

  /** Frozen leading visible-column positions, clamped likewise. */
  private frozenColCount(): number {
    const fc = this.sheet().frozenCols ?? 0;
    return Math.max(0, Math.min(fc, Math.max(0, this.colIndices.length - 1)));
  }

  /** Pixel height of the frozen row band (0 when no rows are frozen). */
  private frozenHeight(): number {
    const fr = this.frozenRowCount();
    return fr > 0 ? this.index.offsetOf(fr) : 0;
  }

  /** Pixel width of the frozen column band (0 when no columns are frozen). */
  private frozenWidth(): number {
    const fc = this.frozenColCount();
    if (fc <= 0) return 0;
    const firstBody = this.colIndices[fc];
    return firstBody === undefined ? this.columnIndex.totalWidth : this.colLeftOf(firstBody);
  }

  /** First non-frozen column index; columns before it are pinned. */
  private firstBodyCol(): number {
    const fc = this.frozenColCount();
    return fc > 0 ? (this.colIndices[fc] ?? Number.MAX_SAFE_INTEGER) : 0;
  }

  /** Screen y of a view row's top edge; frozen rows ignore vertical scroll. */
  private yOfRow(row: number, contentTop: number): number {
    const scroll = row < this.frozenRowCount() ? 0 : contentTop;
    return this.theme.headerHeight + this.index.offsetOf(row) - scroll;
  }

  /** Screen x of a column's left edge; frozen columns ignore horizontal scroll. */
  private xOfCol(col: number, scrollLeft: number): number {
    const frozen = this.frozenColCount() > 0 && col < this.firstBodyCol();
    return this.theme.rowHeaderWidth + this.colLeftOf(col) - (frozen ? 0 : scrollLeft);
  }

  private screenRect(
    row: number,
    col: number,
    contentTop: number,
    scrollLeft: number,
  ): {
    x: number;
    y: number;
    w: number;
    h: number;
  } {
    const sheet = this.sheet();
    return {
      x: this.xOfCol(col, scrollLeft),
      y: this.yOfRow(row, contentTop),
      w: (sheet.columns[col]?.width ?? 0) * this.zoom,
      h: this.index.heightOf(row),
    };
  }

  /** Freeze-aware viewport-x → column content-x (frozen band ignores scroll). */
  private contentXAt(viewportX: number): number {
    const xx = viewportX - this.theme.rowHeaderWidth;
    const inFrozenBand = this.frozenColCount() > 0 && xx < this.frozenWidth();
    return inFrozenBand ? xx : xx + this.scroller.scrollLeft;
  }

  /** Freeze-aware viewport-y → row content-y (frozen band ignores scroll). */
  private contentYAt(viewportY: number): number {
    const yy = viewportY - this.theme.headerHeight;
    const inFrozenBand = this.frozenRowCount() > 0 && yy < this.frozenHeight();
    return inFrozenBand ? yy : yy + this.scaled.toContent(this.scroller.scrollTop);
  }

  private applyLayout(): void {
    this.paintEpoch += 1;
    const sheet = this.sheet();
    this.renderer.setLayout({
      columns: sheet.columns.map((column, c) => ({
        ...column,
        header: column.visible === false ? "" : colToA1(c),
        // Paint geometry is zoomed to match the column index; base widths stay
        // untouched on the workbook.
        width: column.visible === false ? 0 : column.width * this.zoom,
      })),
      rowHeight: this.theme.rowHeight,
      headerHeight: this.theme.headerHeight,
      totalRows: sheet.rowCount,
      merges: this.loadable?.hasView(this.activeSheet)
        ? []
        : (this.merges.get(this.activeSheet) ?? []),
    });
    this.selection.setBounds(sheet.rowCount, this.firstCol(), this.lastCol());
    this.syncSizer();
  }

  private syncSizer(): void {
    this.scaled.update(this.index.totalHeight + this.theme.headerHeight, this.viewportH());
    this.sizer.style.width = `${this.columnIndex.totalWidth + this.theme.rowHeaderWidth}px`;
    this.sizer.style.height = `${this.scaled.sizerHeight}px`;
  }

  private rebuildIndex(): void {
    const sheet = this.sheet();
    this.index = new OffsetIndex(sheet.rowCount, this.theme.rowHeight);
    this.applyRowHeights(sheet);
    if (this.loaded.length !== sheet.rowCount) this.loaded = new Uint8Array(sheet.rowCount);
    this.syncSizer();
  }

  private rebuildColumnIndex(): void {
    const sheet = this.sheet();
    this.colIndices = visibleColumns(sheet.columns);
    this.columnIndex = buildColumnIndex(sheet, this.colIndices, this.zoom);
    this.columnWindowStart = -1;
    this.columnWindowEnd = -1;
    this.windowedColIndices = [];
  }

  private applyRowHeights(sheet: Sheet): void {
    if (!sheet.rowHeights) return;
    // Overrides persist in base units keyed by DATA row; the offset index is
    // zoomed and VIEW-indexed, so map each override through the active view
    // (identity without one; filtered-out rows have no view slot).
    for (const [dataRow, h] of sheet.rowHeights) {
      const viewRow = this.toViewRow(dataRow);
      if (viewRow !== null && viewRow < this.index.count) {
        this.index.setHeight(viewRow, h * this.zoom);
      }
    }
  }

  private toDataRow(viewRow: number): number {
    return this.loadable?.dataRowAt(this.activeSheet, viewRow) ?? viewRow;
  }

  private toViewRow(dataRow: number): number | null {
    if (!this.loadable) return dataRow;

    return this.loadable.viewRowOf(this.activeSheet, dataRow);
  }

  private mergeAnchorAt(row: number, col: number): SelRect | null {
    if (this.loadable?.hasView(this.activeSheet)) return null;

    const merges = this.merges.get(this.activeSheet);
    if (!merges) return null;

    for (const merge of merges) {
      const insideRows = merge.r0 <= row && row <= merge.r1;
      const insideCols = merge.c0 <= col && col <= merge.c1;
      if (insideRows && insideCols) return merge;
    }

    return null;
  }

  private anchorCell(row: number, col: number): CellRef {
    const merge = this.mergeAnchorAt(row, col);
    return merge ? { row: merge.r0, col: merge.c0 } : { row, col };
  }

  // ── render loop ──────────────────────────────────────────────────────────--

  private scheduleRender(): void {
    if (this.frame) return;
    const raf =
      globalThis.requestAnimationFrame ?? ((fn: FrameRequestCallback) => setTimeout(fn, 16));
    this.frame = raf(() => {
      this.frame = 0;
      this.render();
    }) as unknown as number;
  }

  private render(): void {
    const clientH = this.viewportH();
    const clientW = this.viewportEl.clientWidth;
    const headerHeight = this.theme.headerHeight;
    const bodyHeight = Math.max(0, clientH - headerHeight);
    const contentTop = this.scaled.toContent(this.scroller.scrollTop);
    const scrollLeft = this.scroller.scrollLeft;

    const fr = this.frozenRowCount();
    const fc = this.frozenColCount();
    const frozenH = fr > 0 ? this.index.offsetOf(fr) : 0;
    const frozenW = this.frozenWidth();
    const usePanes = (fr > 0 || fc > 0) && this.renderer.paintPanes !== undefined;

    const rawWin = computeWindow(
      this.index,
      contentTop + frozenH,
      Math.max(0, bodyHeight - frozenH),
      this.overscan,
    );
    const win =
      fr > 0 ? { start: Math.max(rawWin.start, fr), end: Math.max(rawWin.end, fr) } : rawWin;
    const rowGeometry = this.rowGeometryForWindow(win);
    if (this.datasource) {
      if (fr > 0) this.ensureLoaded(0, fr);
      this.ensureLoaded(win.start, win.end);
    }

    const cellViewportWidth = Math.max(0, clientW - this.theme.rowHeaderWidth);
    const rawColumnWin = computeColumnWindow(
      this.columnIndex,
      scrollLeft + frozenW,
      Math.max(0, cellViewportWidth - frozenW),
      this.overscan,
    );
    const columnWin =
      fc > 0
        ? {
            start: Math.max(rawColumnWin.start, fc),
            end: Math.max(rawColumnWin.end, fc),
          }
        : rawColumnWin;
    if (columnWin.start !== this.columnWindowStart || columnWin.end !== this.columnWindowEnd) {
      this.columnWindowStart = columnWin.start;
      this.columnWindowEnd = columnWin.end;
      this.windowedColIndices = this.colIndices.slice(columnWin.start, columnWin.end);
      this.columnWindowSignature = this.windowedColIndices.join(",");
      this.ariaMirror.bumpVersion();
    }
    const cols = this.windowedColIndices;

    const viewport: Viewport = {
      scrollTop: contentTop,
      scrollLeft,
      width: clientW,
      height: clientH,
      contentRevision: this.storeEpoch + this.paintEpoch,
    };

    if (rowGeometry) {
      viewport.rowTops = rowGeometry.rowTops;
      viewport.rowHeights = rowGeometry.rowHeights;
    }

    this.renderer.setViewport(viewport);

    const paintSignature =
      `${this.activeSheet}|${win.start}|${win.end}|${this.columnWindowSignature}` +
      `|${contentTop}|${scrollLeft}|${clientW}|${clientH}|${this.storeEpoch}|${this.paintEpoch}` +
      `|${fr}|${fc}|${this.zoom}`;

    let view = this.lastPaintView;
    if (!view || paintSignature !== this.lastPaintSignature) {
      if (usePanes) {
        view = this.paintFrozenPanes(
          win,
          cols,
          fr,
          fc,
          frozenH,
          frozenW,
          contentTop,
          scrollLeft,
          clientW,
          clientH,
          rowGeometry,
        );
      } else {
        view = this.store.getVisibleWindow(this.activeSheet, win, cols);
        this.renderer.paint(view);
      }
      this.lastPaintView = view;
      this.lastPaintSignature = paintSignature;
    }
    this.ariaMirror.update(view);

    this.overlayPainter.paint(contentTop, scrollLeft, clientW, clientH);
    this.repositionEditor(contentTop, scrollLeft);

    for (const fn of this.listeners.scroll) {
      fn({
        scrollTop: contentTop,
        firstRow: win.start,
        lastRow: Math.max(win.start, win.end - 1),
      });
    }
  }

  /**
   * Frozen-frame paint: up to four clipped panes (corner, top, left, body),
   * each its own bulk window read with pinned axes at scroll 0. Returns the
   * body pane's view (the one ARIA mirrors and the paint cache retain).
   */
  private paintFrozenPanes(
    bodyWin: { start: number; end: number },
    bodyCols: readonly number[],
    fr: number,
    fc: number,
    frozenH: number,
    frozenW: number,
    contentTop: number,
    scrollLeft: number,
    clientW: number,
    clientH: number,
    bodyGeometry: { rowTops: Float64Array; rowHeights: Float64Array } | null,
  ): VisibleWindowView {
    const g = this.theme.rowHeaderWidth;
    const hh = this.theme.headerHeight;
    const xSplit = fc > 0 ? g + frozenW : 0;
    const ySplit = fr > 0 ? hh + frozenH : 0;
    const bodyW = Math.max(0, clientW - xSplit);
    const bodyH = Math.max(0, clientH - ySplit);

    const frozenWin = { start: 0, end: fr };
    const frozenCols = fc > 0 ? this.colIndices.slice(0, fc) : [];
    const frozenGeometry = fr > 0 ? this.frozenRowGeometry(fr) : null;

    const panes: PanePaint[] = [];
    if (fr > 0 && fc > 0) {
      panes.push({
        view: this.store.getVisibleWindow(this.activeSheet, frozenWin, frozenCols),
        clip: { x: 0, y: 0, w: xSplit, h: ySplit },
        scrollTop: 0,
        scrollLeft: 0,
        rowTops: frozenGeometry?.rowTops,
        rowHeights: frozenGeometry?.rowHeights,
      });
    }
    if (fr > 0) {
      panes.push({
        view: this.store.getVisibleWindow(this.activeSheet, frozenWin, bodyCols),
        clip: { x: xSplit, y: 0, w: bodyW, h: ySplit },
        scrollTop: 0,
        scrollLeft,
        rowTops: frozenGeometry?.rowTops,
        rowHeights: frozenGeometry?.rowHeights,
      });
    }
    if (fc > 0) {
      panes.push({
        view: this.store.getVisibleWindow(this.activeSheet, bodyWin, frozenCols),
        clip: { x: 0, y: ySplit, w: xSplit, h: bodyH },
        scrollTop: contentTop,
        scrollLeft: 0,
        rowTops: bodyGeometry?.rowTops,
        rowHeights: bodyGeometry?.rowHeights,
      });
    }
    const bodyView = this.store.getVisibleWindow(this.activeSheet, bodyWin, bodyCols);
    panes.push({
      view: bodyView,
      clip: { x: xSplit, y: ySplit, w: bodyW, h: bodyH },
      scrollTop: contentTop,
      scrollLeft,
      rowTops: bodyGeometry?.rowTops,
      rowHeights: bodyGeometry?.rowHeights,
    });

    this.renderer.paintPanes?.(panes, {
      x: fc > 0 ? xSplit - 0.5 : null,
      y: fr > 0 ? ySplit - 0.5 : null,
    });
    return bodyView;
  }

  /** Fresh row geometry for the (tiny) frozen band — never aliases the body scratch. */
  private frozenRowGeometry(
    fr: number,
  ): { rowTops: Float64Array; rowHeights: Float64Array } | null {
    const rowHeights = this.sheet().rowHeights;
    if (!rowHeights || rowHeights.size === 0) return null;

    const tops = new Float64Array(fr);
    const heights = new Float64Array(fr);
    let top = 0;
    for (let i = 0; i < fr; i++) {
      const height = this.index.heightOf(i);
      tops[i] = top;
      heights[i] = height;
      top += height;
    }
    return { rowTops: tops, rowHeights: heights };
  }

  private rowGeometryForWindow(win: {
    start: number;
    end: number;
  }): { rowTops: Float64Array; rowHeights: Float64Array } | null {
    const rowHeights = this.sheet().rowHeights;
    if (!rowHeights || rowHeights.size === 0) return null;

    const count = Math.max(0, win.end - win.start);
    if (this.rowTopsScratch.length < count) {
      this.rowTopsScratch = new Float64Array(count);
      this.rowHeightsScratch = new Float64Array(count);
    }

    if (this.rowGeometryLength !== count) {
      this.rowTopsView = this.rowTopsScratch.subarray(0, count);
      this.rowHeightsView = this.rowHeightsScratch.subarray(0, count);
      this.rowGeometryLength = count;
    }

    // Consecutive tops differ by exactly the previous row's height, so one
    // O(log n) offset lookup seeds a running sum instead of one per row.
    let top = this.index.offsetOf(win.start);
    for (let i = 0; i < count; i++) {
      const height = this.index.heightOf(win.start + i);
      this.rowTopsScratch[i] = top;
      this.rowHeightsScratch[i] = height;
      top += height;
    }

    return { rowTops: this.rowTopsView, rowHeights: this.rowHeightsView };
  }

  private clearInFlight(a: number, b: number): void {
    for (let r = a; r < b; r++) this.inFlight.delete(r);
  }

  private ensureLoaded(start: number, end: number): void {
    let lo = -1;
    let hi = -1;
    for (let r = start; r < end; r++) {
      if (this.loaded[r] === 0 && !this.inFlight.has(r)) {
        if (lo === -1) lo = r;
        hi = r;
      }
    }
    const datasource = this.datasource;
    const loadable = this.loadable;
    if (lo === -1 || !datasource || !loadable) return;

    const a = lo;
    const b = hi + 1;
    for (let r = a; r < b; r++) this.inFlight.add(r);

    const sheetId = this.activeSheet;
    const generation = this.loadGeneration;
    let pending: ReturnType<NonNullable<GridOptions["datasource"]>["getRows"]>;

    try {
      pending = datasource.getRows(sheetId, a, b);
    } catch {
      this.clearInFlight(a, b);
      return;
    }

    Promise.resolve(pending)
      .then((rows) => {
        if (this.destroyed || generation !== this.loadGeneration) return;

        loadable.loadRows(sheetId, a, rows);
        for (let r = a; r < b; r++) this.loaded[r] = 1;
        this.clearInFlight(a, b);
        this.scheduleRender();
      })
      .catch(() => {
        if (this.destroyed || generation !== this.loadGeneration) return;
        this.clearInFlight(a, b);
      });
  }

  private repositionEditor(contentTop: number, scrollLeft: number): void {
    if (!this.editor.isEditing) return;
    const cell = this.editor.editingCell;
    if (!cell) return;
    this.editor.position(this.screenRect(cell.row, cell.col, contentTop, scrollLeft));
  }

  // ── editing ──────────────────────────────────────────────────────────────--

  beginEdit(row: number, col: number, initial?: string, selectAll = false): void {
    if (this.readOnly) return;

    const editCell = this.anchorCell(row, col);
    const sheet = this.sheet();
    const column = sheet.columns[editCell.col];
    if (!column) return;

    const dataAddr = {
      sheet: this.activeSheet,
      row: this.toDataRow(editCell.row),
      col: editCell.col,
    };
    const formula = this.loadable?.getFormula(dataAddr) ?? null;
    const current = this.store.getCell(dataAddr).resolved;
    const text = initial ?? formula ?? (current === null ? "" : String(current));
    const contentTop = this.scaled.toContent(this.scroller.scrollTop);

    this.selection.selectCell(editCell.row, editCell.col);
    this.scheduleRender();

    for (const fn of this.listeners["edit-begin"]) {
      fn({ addr: { sheet: this.activeSheet, row: editCell.row, col: editCell.col } });
    }

    this.editor.begin({
      row: editCell.row,
      col: editCell.col,
      type: column.type,
      initial: text,
      selectAll: selectAll || initial === undefined,
      rect: this.screenRect(editCell.row, editCell.col, contentTop, this.scroller.scrollLeft),
      theme: this.theme,
      onCommit: (value, navigate) => this.commitEdit(editCell.row, editCell.col, value, navigate),
      onCancel: () => {
        this.host.focus();
        this.scheduleRender();
      },
    });
  }

  private commitEdit(row: number, col: number, raw: string, navigate: EditNavigate): void {
    const column = this.sheet().columns[col];
    const value = parseCellInput(raw, column?.type ?? "text");
    const dataRow = this.toDataRow(row);

    this.commit([
      {
        op: "set",
        addr: { sheet: this.activeSheet, row: dataRow, col },
        value,
      },
    ]);

    for (const fn of this.listeners["edit-commit"]) {
      fn({ addr: { sheet: this.activeSheet, row, col }, value });
    }

    this.host.focus();
    this.moveAfterCommit(row, col, navigate);
    this.scheduleRender();
  }

  private commit(patches: Patch[]): void {
    if (this.readOnly) return;
    if (patches.length === 0) return;

    if (this.applyingHistory) {
      this.store.applyTransaction({ patches });
      return;
    }

    const inverse: Patch[] = [];
    for (const patch of patches) inverse.push(...this.inversePatch(patch));

    this.store.applyTransaction({ patches });
    for (const patch of patches) this.rebaseHistoryFor(patch);
    this.history.push(inverse, patches);
  }

  private inversePatch(patch: Patch): Patch[] {
    switch (patch.op) {
      case "set":
        return [this.inverseSetPatch(patch)];
      case "addRows":
        return [{ op: "removeRows", sheet: patch.sheet, at: patch.at, count: patch.count }];
      case "removeRows":
        return [
          { op: "addRows", sheet: patch.sheet, at: patch.at, count: patch.count },
          ...this.snapshotRows(patch.sheet, patch.at, patch.count),
        ];
      case "addColumns":
        return [
          {
            op: "removeColumns",
            sheet: patch.sheet,
            at: patch.at,
            count: patch.columns.length,
          },
        ];
      case "removeColumns":
        return [
          {
            op: "addColumns",
            sheet: patch.sheet,
            at: patch.at,
            columns: this.snapshotColumns(patch.sheet, patch.at, patch.count),
          },
          ...this.snapshotColumnCells(patch.sheet, patch.at, patch.count),
        ];
      case "setColumn": {
        const sheet = this.sheetById(patch.sheet);
        const column = sheet?.columns[patch.col];
        return column
          ? [{ op: "setColumn", sheet: patch.sheet, col: patch.col, patch: { ...column } }]
          : [];
      }
    }
  }

  private inverseSetPatch(patch: Extract<Patch, { op: "set" }>): Patch {
    const formula = this.loadable?.getFormula(patch.addr) ?? this.store.getFormula(patch.addr);
    const refTarget = this.store.getRefTarget(patch.addr);
    const cell = this.store.getCell(patch.addr);
    const value: CellValue = formula
      ? { kind: "formula", src: formula }
      : refTarget
        ? { kind: "ref", target: refTarget }
        : { kind: "literal", value: cell.resolved };

    return {
      op: "set",
      addr: patch.addr,
      value,
      style: cell.style,
    };
  }

  private snapshotRows(sheetId: SheetId, at: number, count: number): Patch[] {
    const sheet = this.sheetById(sheetId);
    if (!sheet) return [];

    const patches: Patch[] = [];
    const end = Math.min(sheet.rowCount, at + count);
    for (let row = at; row < end; row++) {
      for (let col = 0; col < sheet.columns.length; col++) {
        patches.push(this.snapshotCell({ sheet: sheetId, row, col }));
      }
    }
    return patches;
  }

  private snapshotColumns(sheetId: SheetId, at: number, count: number): Column[] {
    const sheet = this.sheetById(sheetId);
    if (!sheet) return [];
    return sheet.columns.slice(at, at + count).map((col) => ({ ...col }));
  }

  private snapshotColumnCells(sheetId: SheetId, at: number, count: number): Patch[] {
    const sheet = this.sheetById(sheetId);
    if (!sheet) return [];

    const patches: Patch[] = [];
    const end = Math.min(sheet.columns.length, at + count);
    for (let row = 0; row < sheet.rowCount; row++) {
      for (let col = at; col < end; col++) {
        patches.push(this.snapshotCell({ sheet: sheetId, row, col }));
      }
    }
    return patches;
  }

  private snapshotCell(addr: CellAddress): Patch {
    const formula = this.store.getFormula(addr);
    const refTarget = this.store.getRefTarget(addr);
    const cell = this.store.getCell(addr);
    const value: CellValue = formula
      ? { kind: "formula", src: formula }
      : refTarget
        ? { kind: "ref", target: refTarget }
        : { kind: "literal", value: cell.resolved };
    return { op: "set", addr, value, style: cell.style };
  }

  private rebaseHistoryFor(patch: Patch): void {
    switch (patch.op) {
      case "addRows":
        this.history.rebaseRows(patch.sheet, patch.at, patch.count);
        break;
      case "removeRows":
        this.history.rebaseRows(patch.sheet, patch.at, -patch.count);
        break;
      case "addColumns":
        this.history.rebaseCols(patch.sheet, patch.at, patch.columns.length);
        break;
      case "removeColumns":
        this.history.rebaseCols(patch.sheet, patch.at, -patch.count);
        break;
    }
  }

  private sheetById(id: SheetId): Sheet | null {
    return this.store.getWorkbook().sheets.find((sheet) => sheet.id === id) ?? null;
  }

  private applyHistoryPatches(patches: Patch[]): void {
    if (patches.length === 0) return;

    this.applyingHistory = true;
    try {
      this.store.applyTransaction({ patches });
    } finally {
      this.applyingHistory = false;
    }
    for (const patch of patches) this.rebaseHistoryFor(patch);

    this.emitSelection();
    if (this.frame) {
      (globalThis.cancelAnimationFrame ?? clearTimeout)(this.frame);
      this.frame = 0;
    }
    this.render();
  }

  private moveAfterCommit(row: number, col: number, navigate: EditNavigate): void {
    const sheet = this.sheet();
    if (navigate === "down") this.selection.selectCell(Math.min(sheet.rowCount - 1, row + 1), col);
    else if (navigate === "right") this.selection.selectCell(row, this.nextVisibleCol(col, 1));
    else if (navigate === "left") this.selection.selectCell(row, this.nextVisibleCol(col, -1));
    else this.selection.selectCell(row, col);
    this.emitSelection();
    const f = this.selection.focusCell;
    if (f) this.scrollToCell({ sheet: this.activeSheet, row: f.row, col: f.col });
  }

  private clearSelection(): void {
    if (this.readOnly || this.selection.isEmpty) return;

    const sheet = this.sheet();
    const seen = new Set<number>();
    const patches: Patch[] = [];
    const nullValue: CellValue = { kind: "literal", value: null };

    this.selection.forEachRect((rect) => {
      for (let r = rect.r0; r <= rect.r1; r++) {
        for (let c = rect.c0; c <= rect.c1; c++) {
          const cell = this.anchorCell(r, c);
          const key = cell.row * sheet.columns.length + cell.col;
          if (seen.has(key)) continue;
          seen.add(key);

          patches.push({
            op: "set",
            addr: { sheet: this.activeSheet, row: this.toDataRow(cell.row), col: cell.col },
            value: nullValue,
          });
        }
      }
    });

    this.commit(patches);
  }

  private emitSelection(): void {
    const sel = this.getSelection();
    for (const fn of this.listeners.selection) fn({ selection: sel });
  }

  search(query: string, opts: SearchOptions = {}): SearchResult {
    return this.searchController.search(query, opts);
  }

  findNext(): SearchResult {
    return this.searchController.findNext();
  }

  findPrev(): SearchResult {
    return this.searchController.findPrev();
  }

  clearSearch(): void {
    this.searchController.clearSearch();
  }

  replaceCurrent(replacement: string): SearchResult {
    return this.searchController.replaceCurrent(replacement);
  }

  replaceAll(replacement: string): ReplaceResult {
    return this.searchController.replaceAll(replacement);
  }

  highlightCells(ranges: readonly HighlightRange[] | null, color?: string): void {
    this.overlayPainter.highlightCells(ranges, color);
  }

  styleRange(range: Range, style: Partial<CellStyle> | null): void {
    if (this.readOnly) return;

    const r0 = Math.min(range.start.row, range.end.row);
    const r1 = Math.max(range.start.row, range.end.row);
    const c0 = Math.min(range.start.col, range.end.col);
    const c1 = Math.max(range.start.col, range.end.col);

    const patches: Patch[] = [];
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const addr = { sheet: range.sheet, row, col };
        const formula = this.loadable?.getFormula(addr) ?? null;
        const cell = this.store.getCell(addr);
        const value: CellValue = formula
          ? { kind: "formula", src: formula }
          : { kind: "literal", value: cell.resolved };
        patches.push({
          op: "set",
          addr,
          value,
          style: style ? { ...cell.style, ...style } : undefined,
        });
      }
    }
    this.commit(patches);
  }

  dataEdge(row: number, col: number, dRow: number, dCol: number): number | null {
    // View-aware in the store: with an active sort/filter view, `row` is a
    // view position and vertical moves return view positions.
    if (!this.loadable) return null;
    return this.loadable.dataEdge(this.activeSheet, row, col, dRow, dCol);
  }

  setRowHeight(row: number, height: number): void {
    const sheet = this.sheet();
    if (!sheet.rowHeights) sheet.rowHeights = new Map();
    // `row` is a VIEW row; overrides persist in base units keyed by DATA row
    // (identity without an active view). The offset index is view-indexed and
    // zoomed.
    sheet.rowHeights.set(this.toDataRow(row), height);
    this.index.setHeight(row, height * this.zoom);
    // Row geometry feeds the painted frame but lives outside the store, so it
    // must invalidate the paint signature itself or the resize stays invisible
    // until some other input changes the signature.
    this.paintEpoch += 1;
    this.syncSizer();
    this.scheduleRender();
  }

  setColumnWidth(col: number, width: number): void {
    this.commit([
      { op: "setColumn", sheet: this.activeSheet, col, patch: { width: Math.max(1, width) } },
    ]);
  }

  // ── public API ─────────────────────────────────────────────────────────────

  setActiveSheet(id: SheetId): void {
    if (id === this.activeSheet) return;
    if (!this.store.getWorkbook().sheets.some((sheet) => sheet.id === id)) return;

    this.loadGeneration += 1;
    this.editor.cancel();
    this.activeSheet = id;
    this.activeSheetCache = null;
    const sheet = this.sheet();

    this.rebuildColumnIndex();
    this.index = new OffsetIndex(sheet.rowCount, this.theme.rowHeight);
    this.applyRowHeights(sheet);
    this.selection = new SelectionModel(sheet.rowCount, this.firstCol(), this.lastCol());
    this.loaded = new Uint8Array(sheet.rowCount);
    this.inFlight.clear();
    this.scroller.scrollTop = 0;
    this.scroller.scrollLeft = 0;

    this.applyLayout();
    this.renderTabs();
    for (const fn of this.listeners["active-sheet"]) fn({ sheet: id });
    this.emitSelection();
    this.render();
  }

  getActiveSheet(): SheetId {
    return this.activeSheet;
  }

  /**
   * View-aware editable snapshot of a cell: `(row, col)` are active-sheet view
   * coordinates; the returned address is the translated data address, so a
   * formula-bar commit through `applyTransaction` targets the correct row even
   * under an active sort/filter view.
   */
  getCellInput(row: number, col: number): CellInputSnapshot | null {
    const sheet = this.sheet();
    const column = sheet.columns[col];
    if (!column || row < 0 || row >= this.index.count) return null;

    const cell = this.anchorCell(row, col);
    const address = {
      sheet: this.activeSheet,
      row: this.toDataRow(cell.row),
      col: cell.col,
    };
    const formula = this.loadable?.getFormula(address) ?? this.store.getFormula(address);
    const resolved = this.store.getCell(address).resolved;
    const text = formula ?? (resolved === null ? "" : String(resolved));

    return { address, text, format: column.type };
  }

  scrollToCell(addr: CellAddress): void {
    if (addr.sheet !== this.activeSheet) this.setActiveSheet(addr.sheet);

    // Cells inside the frozen bands are always visible on their pinned axis.
    const fr = this.frozenRowCount();
    const frozenH = this.frozenHeight();
    if (addr.row >= fr) {
      const top = this.index.offsetOf(addr.row);
      const bottom = top + this.index.heightOf(addr.row);
      const bodyHeight = Math.max(0, this.viewportH() - this.theme.headerHeight);
      const contentTop = this.scaled.toContent(this.scroller.scrollTop);

      // Visible body band in content space: [contentTop + frozenH, contentTop + bodyHeight).
      let target = contentTop;
      if (top < contentTop + frozenH) target = top - frozenH;
      else if (bottom > contentTop + bodyHeight) target = bottom - bodyHeight;
      if (target !== contentTop) {
        this.scroller.scrollTop = this.scaled.toScroll(Math.max(0, target));
      }
    }

    this.ensureColumnVisible(addr.col);
    this.scheduleRender();
  }

  private ensureColumnVisible(col: number): void {
    if (this.frozenColCount() > 0 && col < this.firstBodyCol()) return;

    const left = this.colLeftOf(col);
    const width = (this.sheet().columns[col]?.width ?? 0) * this.zoom;
    const frozenW = this.frozenWidth();
    const viewLeft = this.scroller.scrollLeft + frozenW;
    const cellWidth = Math.max(
      0,
      this.viewportEl.clientWidth - this.theme.rowHeaderWidth - frozenW,
    );
    const viewRight = viewLeft + cellWidth;
    if (left < viewLeft) this.scroller.scrollLeft = Math.max(0, left - frozenW);
    else if (left + width > viewRight)
      this.scroller.scrollLeft = Math.max(0, left + width - cellWidth - frozenW);
  }

  getSelection(): Selection | null {
    return this.selection.toSelection(this.activeSheet);
  }

  setSelection(sel: Selection | null): void {
    this.selection.set(sel);
    this.emitSelection();
    this.scheduleRender();
  }

  setTheme(theme: Partial<Theme>): void {
    this.baseTheme = { ...this.baseTheme, ...theme };
    this.applyZoomedTheme();
  }

  setReadOnly(readOnly: boolean): void {
    if (readOnly === this.readOnly) return;

    this.readOnly = readOnly;
    if (readOnly) this.editor.cancel();
    if (readOnly) this.host.setAttribute("aria-readonly", "true");
    else this.host.removeAttribute("aria-readonly");

    this.findBar?.destroy();
    this.findBar =
      this.config?.find === false
        ? null
        : new FindBar(this.host, this.baseTheme, this, this.readOnly);
  }

  setConfig(config: GridConfig | undefined): void {
    // Declarative hosts re-create option objects per render (`config={{...}}`).
    // A shallowly-equal config is the same configuration: adopt the new
    // reference but skip the chrome rebuild — rebuilding would drop widget
    // focus and, through layout-driven scroll events, could re-trigger the
    // host render that produced the object in the first place.
    if (shallowEqualConfig(config, this.config)) {
      this.config = config;
      return;
    }
    this.config = config;

    const keyboard = config?.keyboard ?? true;
    this.keyboardPolicy =
      typeof keyboard === "function" ? (event: KeyboardEvent) => keyboard(event, this) : keyboard;

    this.toolbar?.destroy();
    this.toolbar = null;
    this.toolbarHeight = 0;
    if (config && config.toolbar !== false) {
      this.toolbar = new Toolbar(this.host, config, this.baseTheme, this);
      this.toolbarHeight = Toolbar.height;
    }

    this.contextMenu?.destroy();
    this.contextMenu =
      config?.contextMenu === false
        ? null
        : new ContextMenu(this.host, config ?? {}, this.baseTheme, this.actions, this);

    this.findBar?.destroy();
    this.findBar =
      config?.find === false ? null : new FindBar(this.host, this.baseTheme, this, this.readOnly);

    this.sheetTabs?.destroy();
    this.sheetTabs = null;
    this.tabBar?.remove();
    this.tabBar = null;
    this.tabBarHeight =
      config?.tabs !== false && this.store.getWorkbook().sheets.length > 1 ? 28 : 0;
    if (this.tabBarHeight > 0) this.buildTabBar();

    this.viewportEl.style.top = `${this.toolbarHeight}px`;
    this.viewportEl.style.bottom = `${this.tabBarHeight}px`;
    this.applyLayout();
    this.render();
  }

  applyTransaction(transaction: GridTransaction): void {
    this.commit(transaction.patches.slice());
  }

  setZoom(zoom: number): void {
    const next = Math.min(2, Math.max(0.5, zoom));
    if (next === this.zoom) return;
    this.zoom = next;
    this.applyZoomedTheme();
  }

  getZoom(): number {
    return this.zoom;
  }

  /**
   * Re-derive the effective (zoom-scaled) theme from the base theme, then
   * rebuild every geometry consumer. Widgets (toolbar/find/menu) keep the base
   * theme: zoom scales grid content only, like Sheets.
   */
  private applyZoomedTheme(): void {
    const base = this.baseTheme;
    const z = this.zoom;
    this.theme =
      z === 1
        ? base
        : {
            ...base,
            rowHeight: base.rowHeight * z,
            headerHeight: base.headerHeight * z,
            rowHeaderWidth: base.rowHeaderWidth * z,
            font: scaleFontPx(base.font, z),
          };
    this.renderer.setTheme(this.theme);
    this.syncTabBarTheme();
    this.rebuildIndex();
    this.rebuildColumnIndex();
    this.applyLayout();
    this.render();
  }

  setFrozen(rows: number, cols = 0): void {
    const sheet = this.sheet();
    sheet.frozenRows = Math.max(0, Math.floor(rows));
    sheet.frozenCols = Math.max(0, Math.floor(cols));
    this.paintEpoch += 1;
    this.syncSizer();
    this.render();
  }

  defineCellRenderer(name: string, renderer: CellRenderer): void {
    this.customRenderers.set(name, renderer);
    this.renderer.setRenderers(this.customRenderers);
    this.scheduleRender();
  }

  insertRows(at: number, count = 1): void {
    if (count <= 0) return;
    this.commit([{ op: "addRows", sheet: this.activeSheet, at: Math.max(0, at), count }]);
  }

  removeRows(at: number, count = 1): void {
    const sheet = this.sheet();
    if (count <= 0 || at >= sheet.rowCount) return;
    this.commit([
      {
        op: "removeRows",
        sheet: this.activeSheet,
        at: Math.max(0, at),
        count: Math.min(count, sheet.rowCount - Math.max(0, at)),
      },
    ]);
  }

  insertColumns(at: number, count = 1): void {
    if (count <= 0) return;
    const insertAt = Math.max(0, Math.min(at, this.sheet().columns.length));
    this.commit([
      {
        op: "addColumns",
        sheet: this.activeSheet,
        at: insertAt,
        columns: this.makeBlankColumns(insertAt, count),
      },
    ]);
  }

  removeColumns(at: number, count = 1): void {
    const sheet = this.sheet();
    if (count <= 0 || at >= sheet.columns.length || sheet.columns.length <= 1) return;
    const removeAt = Math.max(0, at);
    this.commit([
      {
        op: "removeColumns",
        sheet: this.activeSheet,
        at: removeAt,
        count: Math.min(count, sheet.columns.length - removeAt, sheet.columns.length - 1),
      },
    ]);
  }

  private makeBlankColumns(at: number, count: number): Column[] {
    const used = new Set(this.sheet().columns.map((column) => column.key));
    const columns: Column[] = [];
    for (let i = 0; i < count; i++) {
      const col = at + i;
      const base = `col_${col}`;
      let key = base;
      let suffix = 1;
      while (used.has(key)) key = `${base}_${suffix++}`;
      used.add(key);
      columns.push({ key, header: colToA1(col), width: DEFAULT_COL_WIDTH, type: "text" });
    }
    return columns;
  }

  // ── toolbar actions (operate on the current selection) ──────────────────────

  private buildActions(): GridActions {
    return {
      toggleBold: () => this.styleActions.toggleStyle("bold"),
      toggleItalic: () => this.styleActions.toggleStyle("italic"),
      toggleUnderline: () => this.styleActions.toggleStyle("underline"),
      toggleStrikethrough: () => this.styleActions.toggleStyle("strikethrough"),
      setAlign: (align) => this.styleActions.applyStyle({ align }),
      setTextColor: (color) => this.styleActions.applyStyle({ color }),
      setFillColor: (color) => this.styleActions.applyStyle({ backgroundColor: color }),
      toggleBorder: () => this.styleActions.toggleBorder(),
      clearFormat: () => this.styleActions.applyStyle(null),
      merge: () => this.styleActions.mergeSelection(),
      unmerge: () => this.styleActions.unmergeSelection(),
      sort: (ascending) => {
        const f = this.selection.focusCell;
        if (f) this.sortBy(f.col, ascending);
      },
      insertRowAbove: () => {
        const f = this.selection.focusCell;
        if (f) this.insertRows(this.toDataRow(f.row));
      },
      insertRowBelow: () => {
        const f = this.selection.focusCell;
        if (f) this.insertRows(this.toDataRow(f.row) + 1);
      },
      deleteRow: () => {
        const f = this.selection.focusCell;
        if (f) this.removeRows(this.toDataRow(f.row));
      },
      insertColumnLeft: () => {
        const f = this.selection.focusCell;
        if (f) this.insertColumns(f.col);
      },
      insertColumnRight: () => {
        const f = this.selection.focusCell;
        if (f) this.insertColumns(f.col + 1);
      },
      deleteColumn: () => {
        const f = this.selection.focusCell;
        if (f) this.removeColumns(f.col);
      },
      copy: () => void this.clipboard.copy(),
      cut: () => void this.clipboard.cut(),
      paste: () => void this.clipboard.paste(),
      pasteValues: () => void this.clipboard.pasteValues(),
      clearContents: () => this.clearSelection(),
      exportCsv: (filename) => this.exportCsv(filename ?? "sheetwrite.csv"),
      exportXlsx: (filename) => void this.exportXlsx(filename ?? "sheetwrite.xlsx"),
      undo: () => this.undo(),
      redo: () => this.redo(),
    };
  }

  on<E extends keyof GridEvents>(evt: E, fn: (e: GridEvents[E]) => void): () => void {
    this.listeners[evt].add(fn);
    return () => this.listeners[evt].delete(fn);
  }

  refresh(): void {
    this.render();
  }

  aggregate(col: number, op: AggregateOp): number {
    return this.loadable ? this.loadable.aggregate(this.activeSheet, col, op) : 0;
  }

  sortBy(col: number, ascending = true): void {
    this.loadable?.sortBy(this.activeSheet, col, ascending);
    this.applyView();
  }

  filterBy(col: number, needle: string): void {
    this.loadable?.filterBy(this.activeSheet, col, needle);
    this.applyView();
  }

  clearView(): void {
    this.loadable?.clearView(this.activeSheet);
    this.applyView();
  }

  sortByMulti(keys: readonly SortKey[]): void {
    this.loadable?.sortByMulti(this.activeSheet, keys);
    this.applyView();
  }

  setColumnFilter(col: number, filter: ColumnFilter | null): void {
    this.loadable?.setColumnFilter(this.activeSheet, col, filter);
    this.applyView();
  }

  getColumnFilters(): ReadonlyMap<number, ColumnFilter> {
    return this.loadable?.columnFilters(this.activeSheet) ?? new Map();
  }

  distinctValues(col: number, limit = 1000): CellScalar[] {
    return this.loadable?.distinctValues(this.activeSheet, col, limit) ?? [];
  }

  hideRows(rows: readonly number[]): void {
    this.loadable?.hideRows(this.activeSheet, rows);
    this.applyView();
  }

  showRows(rows?: readonly number[]): void {
    this.loadable?.showRows(this.activeSheet, rows);
    this.applyView();
  }

  hiddenRows(): readonly number[] {
    return this.loadable?.hiddenRows(this.activeSheet) ?? [];
  }

  groupRows(start: number, end: number): void {
    this.loadable?.groupRows(this.activeSheet, start, end);
    this.applyView();
  }

  ungroupRows(start: number, end: number): void {
    this.loadable?.ungroupRows(this.activeSheet, start, end);
    this.applyView();
  }

  setGroupCollapsed(start: number, collapsed: boolean): void {
    this.loadable?.setGroupCollapsed(this.activeSheet, start, collapsed);
    this.applyView();
  }

  rowGroups(): readonly RowGroup[] {
    return this.loadable?.rowGroups(this.activeSheet) ?? [];
  }

  undo(): void {
    if (this.readOnly) return;
    const patches = this.history.undo();
    if (!patches) return;

    this.applyHistoryPatches(patches);
  }

  redo(): void {
    if (this.readOnly) return;
    const patches = this.history.redo();
    if (!patches) return;

    this.applyHistoryPatches(patches);
  }

  exportCsv(filename: string): void {
    downloadBytes(toCsv(this.sheet(), this.store), filename, "text/csv;charset=utf-8");
  }

  async exportXlsx(filename: string): Promise<void> {
    const bytes = await toXlsx(this.store.getWorkbook(), this.store);
    downloadBytes(
      bytes,
      filename,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  }

  private applyView(): void {
    const count = this.loadable
      ? this.loadable.viewRowCount(this.activeSheet)
      : this.sheet().rowCount;
    this.index = new OffsetIndex(count, this.theme.rowHeight);
    this.applyRowHeights(this.sheet());
    this.selection.clear();
    this.selection.setBounds(count, this.firstCol(), this.lastCol());
    this.scroller.scrollTop = 0;
    // The view permutation lives outside the store, so it must invalidate the
    // paint signature itself — a view change with an identical window/scroll
    // (e.g. sorting while already at the top) would otherwise paint stale.
    this.paintEpoch += 1;
    this.syncSizer();
    this.render();
  }

  private onResize(): void {
    this.syncSizer();
    this.render();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.loadGeneration += 1;
    this.inFlight.clear();
    if (this.frame) (globalThis.cancelAnimationFrame ?? clearTimeout)(this.frame);
    this.editor.destroy();
    this.input.destroy();
    this.scroller.removeEventListener("scroll", this.onScroll);
    this.scroller.removeEventListener("contextmenu", this.onContextMenu);
    this.resizeObserver?.disconnect();
    this.disposeStore();
    // Free the WASM CellStore only when we constructed it. A caller-provided
    // store is owned by the caller and must stay usable after the grid is gone.
    if (this.ownsStore) this.loadable?.dispose();
    this.renderer.destroy();
    this.scroller.remove();
    this.overlayPainter.destroy();
    this.sheetTabs?.destroy();
    this.tabBar?.remove();
    this.toolbar?.destroy();
    this.contextMenu?.destroy();
    this.findBar?.destroy();
    this.viewportEl.remove();
    this.ariaMirror.destroy();
    this.host.classList.remove("sheetwrite");
  }
}

function visibleColumns(columns: readonly Column[]): number[] {
  const out: number[] = [];
  for (let c = 0; c < columns.length; c++) {
    if (columns[c]!.visible !== false) out.push(c);
  }
  return out;
}

function buildColumnIndex(sheet: Sheet, colIndices: readonly number[], zoom: number): ColumnIndex {
  const widths = new Array<number>(colIndices.length);
  for (let i = 0; i < colIndices.length; i++) {
    const col = colIndices[i]!;
    // Display geometry is zoomed; `Column.width` itself stays in base units.
    widths[i] = (sheet.columns[col]?.width ?? 0) * zoom;
  }

  return new ColumnIndex(colIndices, widths);
}

function padColumns(workbook: Workbook, opts: GridOptions, host: HTMLElement): Workbook {
  const fillWidth = host.clientWidth - DEFAULT_THEME.rowHeaderWidth;
  const fillCols = fillWidth > 0 ? Math.ceil(fillWidth / DEFAULT_COL_WIDTH) + 1 : 0;
  const target = Math.max(opts.minColumns ?? 0, fillCols);
  if (target <= 0) return workbook;

  let changed = false;
  const sheets = workbook.sheets.map((sheet) => {
    if (sheet.columns.length >= target) return sheet;

    changed = true;
    const columns = sheet.columns.slice();
    for (let c = columns.length; c < target; c++) {
      columns.push({ key: `__pad_${c}`, header: "", width: DEFAULT_COL_WIDTH, type: "text" });
    }

    return { ...sheet, columns };
  });

  return changed ? { ...workbook, sheets } : workbook;
}

/**
 * Same configuration by shallow own-property comparison. Fresh-but-identical
 * flag objects from declarative hosts compare equal; arrays, functions, and
 * nested objects recreated inline compare different (conservatively rebuilding).
 */
function shallowEqualConfig(a: GridConfig | undefined, b: GridConfig | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  const aKeys = Object.keys(a) as Array<keyof GridConfig>;
  const bKeys = Object.keys(b) as Array<keyof GridConfig>;
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}
