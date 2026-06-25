import { load } from "@sheetwrite/wasm";
import { colToA1 } from "./a1";
import { AriaMirror } from "./aria-mirror";
import { CanvasRenderer } from "./canvas-renderer";
import { parseCellInput } from "./cell-input";
import { ClipboardController } from "./clipboard-controller";
import { ContextMenu } from "./context-menu";
import { EditController, type EditNavigate } from "./editor";
import { downloadBytes, toCsv, toXlsx } from "./export";
import { OffsetIndex, ScaledScroll } from "./fenwick";
import { FindBar } from "./find-bar";
import { UndoManager } from "./history";
import { InputController } from "./input-controller";
import { OverlayPainter } from "./overlay-painter";
import { SearchController } from "./search-controller";
import { type CellRef, SelectionModel, type SelRect } from "./selection";
import { SheetwriteStore } from "./store";
import { StyleActions } from "./style-actions";
import { Toolbar } from "./toolbar";
import type {
  AggregateOp,
  CellAddress,
  CellRenderer,
  CellValue,
  Column,
  Grid,
  GridActions,
  GridEvents,
  GridOptions,
  Patch,
  Range,
  Renderer,
  SearchOptions,
  SearchResult,
  Selection,
  Sheet,
  SheetId,
  Store,
  Theme,
  Viewport,
  Workbook,
} from "./types";
import { computeWindow } from "./virtualization";
import { WorkerRenderer } from "./worker-renderer";

/** Chrome caps element height near here; beyond it the sizer is scaled. */
const MAX_ELEMENT_HEIGHT = 33_000_000;
const DEFAULT_OVERSCAN = 6;
const DEFAULT_COL_WIDTH = 100;

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
  private readonly readOnly: boolean;
  private tabBar: HTMLDivElement | null = null;
  private tabBarHeight = 0;
  private toolbar: Toolbar | null = null;
  private contextMenu: ContextMenu | null = null;
  private findBar: FindBar | null = null;
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
  };

  private theme: Theme;
  private activeSheet: SheetId;
  private index: OffsetIndex;
  private scaled: ScaledScroll;
  private colIndices: number[];
  private selection: SelectionModel;
  private loaded: Uint8Array;
  private inFlight = new Set<number>();
  private frame = 0;
  private resizeObserver: ResizeObserver | null = null;
  private readonly onScroll = () => this.scheduleRender();
  private readonly disposeStore: () => void;

  constructor(host: HTMLElement, opts: GridOptions, store?: Store) {
    this.host = host;
    const workbook = store ? opts.workbook : padColumns(opts.workbook, opts, host);
    this.store = store ?? new SheetwriteStore(workbook, opts.data);
    this.loadable = this.store instanceof SheetwriteStore ? this.store : null;
    this.datasource = opts.datasource;
    this.readOnly = opts.readOnly ?? false;
    this.overscan = opts.overscan ?? DEFAULT_OVERSCAN;
    this.theme = { ...DEFAULT_THEME, ...resolveThemeFromCss(host), ...opts.theme };
    this.activeSheet = opts.workbook.activeSheet;
    this.tabBarHeight = opts.workbook.sheets.length > 1 ? 28 : 0;

    for (const [name, r] of Object.entries(opts.renderers ?? {})) {
      this.customRenderers.set(name, r);
    }

    const sheet = this.sheet();
    this.colIndices = visibleColumns(sheet.columns);
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
      clearSelection: () => this.clearSelection(),
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

    const config = opts.config;
    if (config && config.toolbar !== false) {
      this.toolbar = new Toolbar(host, config, this.theme, this.actions, this);
      this.toolbarHeight = Toolbar.height;
    }

    if (config?.contextMenu !== false) {
      this.contextMenu = new ContextMenu(host, config ?? {}, this.theme, this.actions, this);
    }

    if (config?.find !== false) {
      this.findBar = new FindBar(host, this.theme, this);
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

    this.editor = new EditController(this.viewportEl);
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
      commit: (patches) => this.commit(patches),
      readOnly: () => this.readOnly,
    });

    this.overlayPainter = new OverlayPainter(this.viewportEl, {
      theme: () => this.theme,
      activeSheet: () => this.activeSheet,
      sheet: () => this.sheet(),
      selection: () => this.selection,
      rowOffsetOf: (row) => this.index.offsetOf(row),
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
      for (const patch of event.transaction.patches) {
        if (patch.op === "addRows" || patch.op === "removeRows") this.rebuildIndex();
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
    const s = this.store.getWorkbook().sheets.find((sh) => sh.id === id);
    if (!s) throw new Error(`Sheetwrite: unknown sheet ${id}`);
    return s;
  }

  private viewportH(): number {
    return this.viewportEl.clientHeight;
  }

  private buildTabBar(): void {
    const bar = document.createElement("div");
    bar.className = "sheetwrite-tabbar";
    bar.style.cssText = [
      "position:absolute",
      "left:0",
      "right:0",
      "bottom:0",
      `height:${this.tabBarHeight}px`,
      "display:flex",
      "align-items:center",
      "gap:4px",
      "padding:0 8px",
      "box-sizing:border-box",
      `border-top:1px solid ${this.theme.gridLine}`,
      `background:${this.theme.bg}`,
      "overflow-x:auto",
    ].join(";");
    bar.setAttribute("role", "tablist");
    bar.setAttribute("aria-label", "Sheets");
    this.host.appendChild(bar);
    this.tabBar = bar;
    this.renderTabs();
  }

  private renderTabs(): void {
    const bar = this.tabBar;
    if (!bar) return;
    bar.replaceChildren();
    for (const sheet of this.store.getWorkbook().sheets) {
      const active = sheet.id === this.activeSheet;
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = active ? "sheetwrite-tab sheetwrite-tab-active" : "sheetwrite-tab";
      tab.textContent = sheet.name;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.style.cssText = [
        "height:100%",
        "border:none",
        "padding:0 16px",
        "cursor:pointer",
        "white-space:nowrap",
        "border-radius:4px 4px 0 0",
        `font:${this.theme.font}`,
        `background:${active ? this.theme.selection : "transparent"}`,
        `color:${active ? this.theme.selectionBorder : this.theme.headerFg}`,
        active ? `box-shadow:inset 0 -2px 0 ${this.theme.selectionBorder}` : "",
      ].join(";");
      tab.addEventListener("mouseenter", () => {
        if (sheet.id !== this.activeSheet) tab.style.background = this.theme.headerBg;
      });
      tab.addEventListener("mouseleave", () => {
        if (sheet.id !== this.activeSheet) tab.style.background = "transparent";
      });
      tab.addEventListener("click", () => this.setActiveSheet(sheet.id));
      bar.appendChild(tab);
    }
  }

  private firstCol(): number {
    return this.colIndices[0] ?? 0;
  }

  private lastCol(): number {
    return this.colIndices[this.colIndices.length - 1] ?? 0;
  }

  private colLeftOf(col: number): number {
    const sheet = this.sheet();
    let x = 0;
    for (const ci of this.colIndices) {
      if (ci === col) return x;
      x += sheet.columns[ci]!.width;
    }
    return x;
  }

  private colAtX(contentX: number): number {
    const sheet = this.sheet();
    let x = 0;
    for (const ci of this.colIndices) {
      const w = sheet.columns[ci]!.width;
      if (contentX >= x && contentX < x + w) return ci;
      x += w;
    }
    return -1;
  }

  private nextVisibleCol(col: number, dir: 1 | -1): number {
    const pos = this.colIndices.indexOf(col);
    if (pos === -1) return col;
    const next = pos + dir;
    if (next < 0 || next >= this.colIndices.length) return col;
    return this.colIndices[next]!;
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
      x: this.colLeftOf(col) - scrollLeft + this.theme.rowHeaderWidth,
      y: this.theme.headerHeight + this.index.offsetOf(row) - contentTop,
      w: sheet.columns[col]?.width ?? 0,
      h: this.index.heightOf(row),
    };
  }

  private applyLayout(): void {
    const sheet = this.sheet();
    this.renderer.setLayout({
      columns: this.colIndices.map((c) => ({ ...sheet.columns[c]!, header: colToA1(c) })),
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
    const sheet = this.sheet();

    let width = 0;
    for (const c of this.colIndices) width += sheet.columns[c]!.width;

    this.sizer.style.width = `${width + this.theme.rowHeaderWidth}px`;
    this.sizer.style.height = `${this.scaled.sizerHeight}px`;
  }

  private rebuildIndex(): void {
    const sheet = this.sheet();
    this.index = new OffsetIndex(sheet.rowCount, this.theme.rowHeight);
    this.applyRowHeights(sheet);
    if (this.loaded.length !== sheet.rowCount) this.loaded = new Uint8Array(sheet.rowCount);
    this.syncSizer();
  }

  private applyRowHeights(sheet: Sheet): void {
    if (!sheet.rowHeights) return;
    for (const [row, h] of sheet.rowHeights) this.index.setHeight(row, h);
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

    const win = computeWindow(this.index, contentTop, bodyHeight, this.overscan);
    const rowGeometry = this.rowGeometryForWindow(win);
    if (this.datasource) this.ensureLoaded(win.start, win.end);

    const view = this.store.getVisibleWindow(this.activeSheet, win, this.colIndices);
    const viewport: Viewport = {
      scrollTop: contentTop,
      scrollLeft,
      width: clientW,
      height: clientH,
    };

    if (rowGeometry) {
      viewport.rowTops = rowGeometry.rowTops;
      viewport.rowHeights = rowGeometry.rowHeights;
    }

    this.renderer.setViewport(viewport);
    this.renderer.paint(view);
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

    for (let i = 0; i < count; i++) {
      const row = win.start + i;
      this.rowTopsScratch[i] = this.index.offsetOf(row);
      this.rowHeightsScratch[i] = this.index.heightOf(row);
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
    let pending: ReturnType<NonNullable<GridOptions["datasource"]>["getRows"]>;

    try {
      pending = datasource.getRows(sheetId, a, b);
    } catch {
      this.clearInFlight(a, b);
      return;
    }

    Promise.resolve(pending)
      .then((rows) => {
        if (sheetId !== this.activeSheet) {
          this.clearInFlight(a, b);
          return;
        }

        loadable.loadRows(sheetId, a, rows);
        for (let r = a; r < b; r++) this.loaded[r] = 1;
        this.clearInFlight(a, b);
        this.scheduleRender();
      })
      .catch(() => {
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

  private beginEdit(
    row: number,
    col: number,
    initial: string | undefined,
    selectAll: boolean,
  ): void {
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
    if (patches.length === 0) return;

    if (this.applyingHistory) {
      this.store.applyTransaction({ patches });
      return;
    }

    const inverse: Patch[] = [];
    for (const patch of patches) {
      // Grid-originated mutations are cell writes; structural changes are not recorded here.
      if (patch.op === "set") inverse.push(this.inverseSetPatch(patch));
    }

    this.store.applyTransaction({ patches });
    this.history.push(inverse, patches);
  }

  private inverseSetPatch(patch: Extract<Patch, { op: "set" }>): Patch {
    const formula = this.loadable?.getFormula(patch.addr) ?? this.store.getFormula(patch.addr);
    const cell = this.store.getCell(patch.addr);
    const value: CellValue = formula
      ? { kind: "formula", src: formula }
      : { kind: "literal", value: cell.resolved };

    return {
      op: "set",
      addr: patch.addr,
      value,
      style: cell.style,
    };
  }

  private applyHistoryPatches(patches: Patch[]): void {
    if (patches.length === 0) return;

    this.applyingHistory = true;
    try {
      this.store.applyTransaction({ patches });
    } finally {
      this.applyingHistory = false;
    }

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

  highlightCells(ranges: Range[] | null, color?: string): void {
    this.overlayPainter.highlightCells(ranges, color);
  }

  // ── public API ─────────────────────────────────────────────────────────────

  setActiveSheet(id: SheetId): void {
    this.editor.cancel();
    this.activeSheet = id;
    const sheet = this.sheet();

    this.colIndices = visibleColumns(sheet.columns);
    this.index = new OffsetIndex(sheet.rowCount, this.theme.rowHeight);
    this.applyRowHeights(sheet);
    this.selection = new SelectionModel(sheet.rowCount, this.firstCol(), this.lastCol());
    this.loaded = new Uint8Array(sheet.rowCount);
    this.inFlight.clear();
    this.scroller.scrollTop = 0;
    this.scroller.scrollLeft = 0;

    this.applyLayout();
    this.renderTabs();
    this.emitSelection();
    this.render();
  }

  scrollToCell(addr: CellAddress): void {
    if (addr.sheet !== this.activeSheet) this.setActiveSheet(addr.sheet);

    const top = this.index.offsetOf(addr.row);
    const bottom = top + this.index.heightOf(addr.row);
    const bodyHeight = Math.max(0, this.viewportH() - this.theme.headerHeight);
    const contentTop = this.scaled.toContent(this.scroller.scrollTop);

    let target = contentTop;
    if (top < contentTop) target = top;
    else if (bottom > contentTop + bodyHeight) target = bottom - bodyHeight;
    if (target !== contentTop) this.scroller.scrollTop = this.scaled.toScroll(target);

    this.ensureColumnVisible(addr.col);
    this.scheduleRender();
  }

  private ensureColumnVisible(col: number): void {
    const left = this.colLeftOf(col);
    const width = this.sheet().columns[col]?.width ?? 0;
    const viewLeft = this.scroller.scrollLeft;
    const cellWidth = Math.max(0, this.viewportEl.clientWidth - this.theme.rowHeaderWidth);
    const viewRight = viewLeft + cellWidth;
    if (left < viewLeft) this.scroller.scrollLeft = left;
    else if (left + width > viewRight) this.scroller.scrollLeft = left + width - cellWidth;
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
    const prevRowHeight = this.theme.rowHeight;
    this.theme = { ...this.theme, ...theme };
    this.renderer.setTheme(this.theme);
    if (this.theme.rowHeight !== prevRowHeight) this.rebuildIndex();
    this.applyLayout();
    this.render();
  }

  defineCellRenderer(name: string, renderer: CellRenderer): void {
    this.customRenderers.set(name, renderer);
    this.renderer.setRenderers(this.customRenderers);
    this.scheduleRender();
  }

  // ── toolbar actions (operate on the current selection) ──────────────────────

  private buildActions(): GridActions {
    return {
      toggleBold: () => this.styleActions.toggleStyle("bold"),
      toggleItalic: () => this.styleActions.toggleStyle("italic"),
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
      copy: () => void this.clipboard.copy(),
      cut: () => void this.clipboard.cut(),
      paste: () => void this.clipboard.paste(),
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

  undo(): void {
    const patches = this.history.undo();
    if (!patches) return;

    this.applyHistoryPatches(patches);
  }

  redo(): void {
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
    this.selection.clear();
    this.selection.setBounds(count, this.firstCol(), this.lastCol());
    this.scroller.scrollTop = 0;
    this.syncSizer();
    this.render();
  }

  private onResize(): void {
    this.syncSizer();
    this.render();
  }

  destroy(): void {
    if (this.frame) (globalThis.cancelAnimationFrame ?? clearTimeout)(this.frame);
    this.editor.destroy();
    this.input.destroy();
    this.scroller.removeEventListener("scroll", this.onScroll);
    this.scroller.removeEventListener("contextmenu", this.onContextMenu);
    this.resizeObserver?.disconnect();
    this.disposeStore();
    this.renderer.destroy();
    this.scroller.remove();
    this.overlayPainter.destroy();
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
