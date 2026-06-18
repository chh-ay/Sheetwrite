import { load } from "@sheetwrite/wasm";
import { cellA1, rangeA1, shiftA1Refs } from "./a1";
import { CanvasRenderer } from "./canvas-renderer";
import { neutralizeInjection, parseTsv, toTsv } from "./clipboard";
import { EditController, type EditNavigate } from "./editor";
import { downloadBytes, toCsv, toXlsx } from "./export";
import { OffsetIndex, ScaledScroll } from "./fenwick";
import { type CellRef, SelectionModel, type SelRect } from "./selection";
import { SheetwriteStore } from "./store";
import { Toolbar, type ToolbarActions } from "./toolbar";
import type {
  AggregateOp,
  CellAddress,
  CellRenderer,
  CellScalar,
  CellStyle,
  CellValue,
  Column,
  Grid,
  GridEvents,
  GridOptions,
  Patch,
  Renderer,
  Selection,
  Sheet,
  SheetId,
  Store,
  Theme,
} from "./types";
import { computeWindow } from "./virtualization";
import { WorkerRenderer } from "./worker-renderer";

/** Chrome caps element height near here; beyond it the sizer is scaled. */
const MAX_ELEMENT_HEIGHT = 33_000_000;
const DEFAULT_OVERSCAN = 6;

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
  ];
  for (const [key, prop] of map) {
    const value = read(prop);
    if (value) (theme[key] as string) = value;
  }

  const rh = read("--sheetwrite-row-height");
  if (rh) theme.rowHeight = Number.parseFloat(rh);
  return theme;
}

const PRINTABLE = /^.$/u;

export function createGrid(host: HTMLElement, opts: GridOptions): Grid {
  if (!wasmReady) {
    throw new Error("Sheetwrite: await initSheetwrite() before createGrid()");
  }
  return new GridImpl(host, opts);
}

export class GridImpl implements Grid {
  readonly store: Store;
  private readonly loadable: SheetwriteStore | null;
  private readonly host: HTMLElement;
  private readonly scroller: HTMLDivElement;
  private readonly sizer: HTMLDivElement;
  private readonly overlay: HTMLDivElement;
  private readonly renderer: Renderer;
  private readonly editor: EditController;
  private readonly overscan: number;
  private readonly datasource: GridOptions["datasource"];
  private readonly readOnly: boolean;
  private tabBar: HTMLDivElement | null = null;
  private tabBarHeight = 0;
  private toolbar: Toolbar | null = null;
  private toolbarHeight = 0;
  private readonly viewportEl: HTMLDivElement;
  private readonly merges = new Map<SheetId, SelRect[]>();
  private fillTarget: SelRect | null = null;
  private readonly customRenderers = new Map<string, CellRenderer>();
  private readonly listeners: { [K in keyof GridEvents]: Set<(e: GridEvents[K]) => void> } = {
    change: new Set(),
    selection: new Set(),
    scroll: new Set(),
    "edit-begin": new Set(),
    "edit-commit": new Set(),
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
    this.store = store ?? new SheetwriteStore(opts.workbook, opts.data);
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

    // host chrome: optional toolbar (top) + viewport (cells) + optional tab bar.
    host.classList.add("sheetwrite");
    host.style.position = host.style.position || "relative";
    host.style.overflow = "hidden";
    if (!host.hasAttribute("tabindex")) host.tabIndex = 0;

    const config = opts.config;
    if (config && config.toolbar !== false) {
      this.toolbar = new Toolbar(host, config, this.theme, this.toolbarActions());
      this.toolbarHeight = Toolbar.height;
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

    this.overlay = document.createElement("div");
    this.overlay.className = "sheetwrite-overlay";
    this.overlay.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;";
    this.viewportEl.appendChild(this.overlay);

    if (this.tabBarHeight > 0) this.buildTabBar();

    this.editor = new EditController(this.viewportEl);

    this.disposeStore = this.store.on("change", (event) => {
      for (const patch of event.transaction.patches) {
        if (patch.op === "addRows" || patch.op === "removeRows") this.rebuildIndex();
      }
      this.scheduleRender();
      for (const fn of this.listeners.change) fn(event);
    });

    this.applyLayout();
    this.scroller.addEventListener("scroll", this.onScroll, { passive: true });
    this.scroller.addEventListener("mousedown", this.onMouseDown);
    this.scroller.addEventListener("dblclick", this.onDblClick);
    host.addEventListener("keydown", this.onKeyDown);
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
      "align-items:stretch",
      `border-top:1px solid ${this.theme.gridLine}`,
      `background:${this.theme.headerBg}`,
      "overflow-x:auto",
    ].join(";");
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
      tab.className = "sheetwrite-tab";
      tab.textContent = sheet.name;
      tab.style.cssText = [
        "border:none",
        "padding:0 14px",
        "cursor:pointer",
        "white-space:nowrap",
        `font:${this.theme.font}`,
        `background:${active ? this.theme.bg : "transparent"}`,
        `color:${active ? this.theme.fg : this.theme.headerFg}`,
        `border-right:1px solid ${this.theme.gridLine}`,
        active ? `box-shadow:inset 0 2px 0 ${this.theme.selectionBorder}` : "",
      ].join(";");
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
      columns: this.colIndices.map((c) => sheet.columns[c]!),
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
    if (this.datasource) this.ensureLoaded(win.start, win.end);

    const view = this.store.getVisibleWindow(this.activeSheet, win, this.colIndices);
    this.renderer.setViewport({
      scrollTop: contentTop,
      scrollLeft,
      width: clientW,
      height: clientH,
    });
    this.renderer.paint(view);

    this.paintSelection(contentTop, scrollLeft, clientW, clientH);
    this.repositionEditor(contentTop, scrollLeft);

    for (const fn of this.listeners.scroll) {
      fn({
        scrollTop: contentTop,
        firstRow: win.start,
        lastRow: Math.max(win.start, win.end - 1),
      });
    }
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
    if (lo === -1 || !this.datasource || !this.loadable) return;

    const a = lo;
    const b = hi + 1;
    for (let r = a; r < b; r++) this.inFlight.add(r);

    const sheetId = this.activeSheet;
    Promise.resolve(this.datasource.getRows(sheetId, a, b)).then((rows) => {
      if (sheetId !== this.activeSheet) return;
      this.loadable!.loadRows(sheetId, a, rows);
      for (let r = a; r < b; r++) {
        this.loaded[r] = 1;
        this.inFlight.delete(r);
      }
      this.scheduleRender();
    });
  }

  // ── selection overlay (Layer 2) ────────────────────────────────────────────

  private paintSelection(
    contentTop: number,
    scrollLeft: number,
    clientW: number,
    clientH: number,
  ): void {
    this.overlay.replaceChildren();
    if (this.selection.isEmpty) return;

    const headerHeight = this.theme.headerHeight;
    const colRight = (col: number): number =>
      this.colLeftOf(col) + (this.sheet().columns[col]?.width ?? 0);

    this.selection.forEachRect((rect) => {
      const left = this.colLeftOf(rect.c0) - scrollLeft + this.theme.rowHeaderWidth;
      const right = colRight(rect.c1) - scrollLeft + this.theme.rowHeaderWidth;
      const top = headerHeight + this.index.offsetOf(rect.r0) - contentTop;
      const bottom = headerHeight + this.index.offsetOf(rect.r1 + 1) - contentTop;
      const clippedTop = Math.max(headerHeight, top);
      if (bottom <= headerHeight || top >= clientH || right <= 0 || left >= clientW) return;

      this.overlay.appendChild(
        rectDiv(
          left,
          clippedTop,
          right - left,
          bottom - clippedTop,
          this.theme.selection,
          this.theme.selectionBorder,
        ),
      );
    });

    // distinct ring on the focus cell
    const focus = this.selection.focusCell;
    if (focus && !this.editor.isEditing) {
      const r = this.screenRect(focus.row, focus.col, contentTop, scrollLeft);
      if (r.y + r.h > headerHeight && r.y < clientH && r.x + r.w > 0 && r.x < clientW) {
        const ring = rectDiv(
          r.x,
          Math.max(headerHeight, r.y),
          r.w,
          r.h,
          "transparent",
          this.theme.selectionBorder,
        );
        ring.style.outlineWidth = "2px";
        this.overlay.appendChild(ring);
      }
    }

    if (this.fillTarget) {
      const fLeft = this.colLeftOf(this.fillTarget.c0) - scrollLeft + this.theme.rowHeaderWidth;
      const fRight = colRight(this.fillTarget.c1) - scrollLeft + this.theme.rowHeaderWidth;
      const fTop = headerHeight + this.index.offsetOf(this.fillTarget.r0) - contentTop;
      const fBottom = headerHeight + this.index.offsetOf(this.fillTarget.r1 + 1) - contentTop;
      const clipTop = Math.max(headerHeight, fTop);
      const preview = rectDiv(
        fLeft,
        clipTop,
        fRight - fLeft,
        fBottom - clipTop,
        "transparent",
        this.theme.selectionBorder,
      );
      preview.style.outlineStyle = "dashed";
      this.overlay.appendChild(preview);
    }

    const fillHandle = this.fillHandleScreen(contentTop, scrollLeft);
    if (fillHandle && !this.editor.isEditing) {
      const sq = rectDiv(
        fillHandle.x - 3,
        fillHandle.y - 3,
        6,
        6,
        this.theme.selectionBorder,
        this.theme.selectionBorder,
      );
      sq.style.cursor = "crosshair";
      this.overlay.appendChild(sq);
    }
  }

  private repositionEditor(contentTop: number, scrollLeft: number): void {
    if (!this.editor.isEditing) return;
    const cell = this.editor.editingCell;
    if (!cell) return;
    this.editor.position(this.screenRect(cell.row, cell.col, contentTop, scrollLeft));
  }

  // ── pointer ────────────────────────────────────────────────────────────────

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return;

    // Formula point mode: while editing a "=" formula, clicks/drags pick A1
    // references into the editor instead of moving the grid selection.
    if (this.editor.isEditing && this.editor.value.startsWith("=")) {
      e.preventDefault();
      const start = this.cellAtPointer(e.clientX, e.clientY);
      if (!start) return;
      this.editor.setReference(cellA1(start.row, start.col));
      const move = (ev: MouseEvent): void => {
        const c = this.cellAtPointer(ev.clientX, ev.clientY);
        if (c) this.editor.setReference(rangeA1(start, c));
      };
      const up = (): void => {
        this.editor.endReference();
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
      return;
    }

    const hostRect = this.viewportEl.getBoundingClientRect();
    const fillHandle = this.fillHandleScreen(
      this.scaled.toContent(this.scroller.scrollTop),
      this.scroller.scrollLeft,
    );
    if (fillHandle && !this.editor.isEditing) {
      const hx = e.clientX - hostRect.left;
      const hy = e.clientY - hostRect.top;
      if (Math.abs(hx - fillHandle.x) <= 5 && Math.abs(hy - fillHandle.y) <= 5) {
        e.preventDefault();
        this.startFillDrag();
        return;
      }
    }
    const additive = e.ctrlKey || e.metaKey;
    const rect = this.viewportEl.getBoundingClientRect();
    const py = e.clientY - rect.top;
    const contentX = e.clientX - rect.left + this.scroller.scrollLeft - this.theme.rowHeaderWidth;

    // header row → column selection
    if (py < this.theme.headerHeight) {
      const col = this.colAtX(contentX);
      if (col !== -1) {
        if (e.shiftKey) this.selection.extendTo(0, col);
        else this.selection.selectColumn(col, additive);
        this.emitSelection();
        this.scheduleRender();
      }
      return;
    }

    const cell = this.cellAtPointer(e.clientX, e.clientY);
    if (!cell) return;

    if (e.shiftKey) this.selection.extendTo(cell.row, cell.col);
    else this.selection.selectCell(cell.row, cell.col, additive);
    this.emitSelection();
    this.scheduleRender();

    const move = (ev: MouseEvent): void => {
      const c = this.cellAtPointer(ev.clientX, ev.clientY);
      if (!c) return;
      this.selection.extendTo(c.row, c.col);
      this.emitSelection();
      this.scheduleRender();
    };
    const up = (): void => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  private readonly onDblClick = (e: MouseEvent): void => {
    const cell = this.cellAtPointer(e.clientX, e.clientY);
    if (!cell) return;
    this.beginEdit(cell.row, cell.col, undefined, true);
  };

  private cellAtPointer(clientX: number, clientY: number): CellRef | null {
    const rect = this.viewportEl.getBoundingClientRect();
    const py = clientY - rect.top;
    if (py < this.theme.headerHeight) return null;

    const contentTop = this.scaled.toContent(this.scroller.scrollTop);
    const contentX = clientX - rect.left + this.scroller.scrollLeft - this.theme.rowHeaderWidth;
    const contentY = contentTop + (py - this.theme.headerHeight);

    const row = this.index.rowAtOffset(contentY).row;
    const col = this.colAtX(contentX);
    if (col === -1 || row < 0 || row >= this.sheet().rowCount) return null;
    return { row, col };
  }

  // ── keyboard ───────────────────────────────────────────────────────────────

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (this.editor.isEditing) return;
    const mod = e.ctrlKey || e.metaKey;

    if (mod && (e.key === "c" || e.key === "C")) return void this.copy();
    if (mod && (e.key === "x" || e.key === "X")) return void this.cut();
    if (mod && (e.key === "v" || e.key === "V")) return void this.paste();

    const focus = this.selection.focusCell;
    const sheet = this.sheet();
    const pageRows = Math.max(
      1,
      Math.floor((this.viewportH() - this.theme.headerHeight) / this.theme.rowHeight),
    );

    switch (e.key) {
      case "ArrowDown":
        this.navigate(
          focus,
          mod ? sheet.rowCount - 1 : (focus?.row ?? 0) + 1,
          undefined,
          e.shiftKey,
          "row",
        );
        break;
      case "ArrowUp":
        this.navigate(focus, mod ? 0 : (focus?.row ?? 0) - 1, undefined, e.shiftKey, "row");
        break;
      case "ArrowRight":
        this.navigate(
          focus,
          undefined,
          mod ? this.lastCol() : this.nextVisibleCol(focus?.col ?? this.firstCol(), 1),
          e.shiftKey,
          "col",
        );
        break;
      case "ArrowLeft":
        this.navigate(
          focus,
          undefined,
          mod ? this.firstCol() : this.nextVisibleCol(focus?.col ?? this.firstCol(), -1),
          e.shiftKey,
          "col",
        );
        break;
      case "PageDown":
        this.navigate(focus, (focus?.row ?? 0) + pageRows, undefined, e.shiftKey, "row");
        break;
      case "PageUp":
        this.navigate(focus, (focus?.row ?? 0) - pageRows, undefined, e.shiftKey, "row");
        break;
      case "Home":
        if (mod) this.navigate(focus, 0, this.firstCol(), e.shiftKey, "both");
        else this.navigate(focus, undefined, this.firstCol(), e.shiftKey, "col");
        break;
      case "End":
        if (mod) this.navigate(focus, sheet.rowCount - 1, this.lastCol(), e.shiftKey, "both");
        else this.navigate(focus, undefined, this.lastCol(), e.shiftKey, "col");
        break;
      case "Enter":
      case "F2":
        if (focus) this.beginEdit(focus.row, focus.col, undefined, e.key === "F2");
        break;
      case "Delete":
      case "Backspace":
        this.clearSelection();
        break;
      default:
        if (!mod && !e.altKey && focus && PRINTABLE.test(e.key)) {
          this.beginEdit(focus.row, focus.col, e.key, false);
        } else {
          return;
        }
    }
    e.preventDefault();
  };

  private navigate(
    focus: CellRef | null,
    row: number | undefined,
    col: number | undefined,
    extend: boolean,
    _axis: "row" | "col" | "both",
  ): void {
    const r = clamp(row ?? focus?.row ?? 0, 0, Math.max(0, this.index.count - 1));
    const c = clamp(col ?? focus?.col ?? this.firstCol(), this.firstCol(), this.lastCol());
    if (extend) this.selection.extendTo(r, c);
    else this.selection.selectCell(r, c);
    this.emitSelection();
    this.scrollToCell({ sheet: this.activeSheet, row: r, col: c });
    this.scheduleRender();
  }

  // ── editing ──────────────────────────────────────────────────────────────--

  private beginEdit(
    row: number,
    col: number,
    initial: string | undefined,
    selectAll: boolean,
  ): void {
    if (this.readOnly) return;
    const sheet = this.sheet();
    const column = sheet.columns[col];
    if (!column) return;

    const formula = this.loadable?.getFormula({ sheet: this.activeSheet, row, col }) ?? null;
    const current = this.store.getCell({ sheet: this.activeSheet, row, col }).resolved;
    const text = initial ?? formula ?? (current === null ? "" : String(current));
    const contentTop = this.scaled.toContent(this.scroller.scrollTop);

    this.selection.selectCell(row, col);
    this.scheduleRender();

    for (const fn of this.listeners["edit-begin"]) {
      fn({ addr: { sheet: this.activeSheet, row, col } });
    }

    this.editor.begin({
      row,
      col,
      type: column.type,
      initial: text,
      selectAll: selectAll || initial === undefined,
      rect: this.screenRect(row, col, contentTop, this.scroller.scrollLeft),
      theme: this.theme,
      onCommit: (value, navigate) => this.commitEdit(row, col, value, navigate),
      onCancel: () => {
        this.host.focus();
        this.scheduleRender();
      },
    });
  }

  private commitEdit(row: number, col: number, raw: string, navigate: EditNavigate): void {
    const column = this.sheet().columns[col];
    const value = coerceInput(raw, column?.type ?? "text");

    this.store.applyTransaction({
      patches: [{ op: "set", addr: { sheet: this.activeSheet, row, col }, value }],
    });
    for (const fn of this.listeners["edit-commit"]) {
      fn({ addr: { sheet: this.activeSheet, row, col }, value });
    }

    this.host.focus();
    this.moveAfterCommit(row, col, navigate);
    this.scheduleRender();
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
    const patches: Patch[] = [];
    const nullValue: CellValue = { kind: "literal", value: null };
    this.selection.forEachRect((rect) => {
      for (let r = rect.r0; r <= rect.r1; r++) {
        for (let c = rect.c0; c <= rect.c1; c++) {
          patches.push({
            op: "set",
            addr: { sheet: this.activeSheet, row: r, col: c },
            value: nullValue,
          });
        }
      }
    });
    if (patches.length > 0) this.store.applyTransaction({ patches });
  }

  private fillSourceRect(): SelRect | null {
    const focus = this.selection.focusCell;
    if (!focus) return null;
    let found: SelRect | null = null;
    this.selection.forEachRect((r) => {
      if (r.r0 <= focus.row && focus.row <= r.r1 && r.c0 <= focus.col && focus.col <= r.c1) {
        found = r;
      }
    });
    return found;
  }

  private fillCellAt(clientX: number, clientY: number): CellRef {
    const rect = this.viewportEl.getBoundingClientRect();
    const contentTop = this.scaled.toContent(this.scroller.scrollTop);
    const contentX = clientX - rect.left + this.scroller.scrollLeft - this.theme.rowHeaderWidth;
    const contentY = contentTop + (clientY - rect.top - this.theme.headerHeight);
    const rowCount = this.sheet().rowCount;
    const row = clamp(this.index.rowAtOffset(Math.max(0, contentY)).row, 0, rowCount - 1);
    let col = this.colAtX(contentX);
    if (col === -1) {
      const cols = this.colIndices;
      col = contentX < 0 ? (cols[0] ?? 0) : (cols[cols.length - 1] ?? 0);
    }
    return { row, col };
  }

  private fillHandleScreen(
    contentTop: number,
    scrollLeft: number,
  ): { x: number; y: number } | null {
    if (this.loadable?.hasView(this.activeSheet)) return null;
    const src = this.fillSourceRect();
    if (!src) return null;
    const r = this.screenRect(src.r1, src.c1, contentTop, scrollLeft);
    const y = r.y + r.h;
    if (y < this.theme.headerHeight) return null;
    return { x: r.x + r.w, y };
  }

  private startFillDrag(): void {
    const source = this.fillSourceRect();
    if (!source) return;
    const move = (ev: MouseEvent): void => {
      const c = this.fillCellAt(ev.clientX, ev.clientY);
      this.fillTarget = this.extendFill(source, c);
      this.scheduleRender();
    };
    const up = (): void => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      const target = this.fillTarget;
      this.fillTarget = null;
      if (target) {
        this.commitFill(source, target);
        this.selection.selectCell(target.r0, target.c0);
        this.selection.extendTo(target.r1, target.c1);
        this.emitSelection();
      }
      this.scheduleRender();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  private extendFill(source: SelRect, c: CellRef): SelRect {
    const down = Math.max(c.row - source.r1, 0);
    const up = Math.max(source.r0 - c.row, 0);
    const right = Math.max(c.col - source.c1, 0);
    const left = Math.max(source.c0 - c.col, 0);
    const vert = Math.max(down, up);
    const horiz = Math.max(right, left);
    if (vert === 0 && horiz === 0) return { ...source };
    if (vert >= horiz) {
      if (down >= up) return { r0: source.r0, c0: source.c0, r1: c.row, c1: source.c1 };
      return { r0: c.row, c0: source.c0, r1: source.r1, c1: source.c1 };
    }
    if (right >= left) return { r0: source.r0, c0: source.c0, r1: source.r1, c1: c.col };
    return { r0: source.r0, c0: c.col, r1: source.r1, c1: source.c1 };
  }

  private commitFill(source: SelRect, target: SelRect): void {
    if (this.readOnly) return;
    const srcRows = source.r1 - source.r0 + 1;
    const srcCols = source.c1 - source.c0 + 1;
    const patches: Patch[] = [];
    for (let r = target.r0; r <= target.r1; r++) {
      for (let c = target.c0; c <= target.c1; c++) {
        if (r >= source.r0 && r <= source.r1 && c >= source.c0 && c <= source.c1) continue;
        const sr = source.r0 + ((((r - source.r0) % srcRows) + srcRows) % srcRows);
        const sc = source.c0 + ((((c - source.c0) % srcCols) + srcCols) % srcCols);
        patches.push({
          op: "set",
          addr: { sheet: this.activeSheet, row: r, col: c },
          value: this.fillValueFrom(sr, sc, r - sr, c - sc),
        });
      }
    }
    if (patches.length > 0) this.store.applyTransaction({ patches });
  }

  private fillValueFrom(sr: number, sc: number, dRow: number, dCol: number): CellValue {
    const addr = { sheet: this.activeSheet, row: sr, col: sc };
    const formula = this.loadable?.getFormula(addr) ?? null;
    if (formula) return { kind: "formula", src: shiftA1Refs(formula, dRow, dCol) };
    return { kind: "literal", value: this.store.getCell(addr).resolved };
  }

  // ── clipboard ──────────────────────────────────────────────────────────────

  private selectionMatrix(): { rect: SelRect; values: CellScalar[][] } | null {
    const focus = this.selection.focusCell;
    if (!focus) return null;
    const rects: SelRect[] = [];
    this.selection.forEachRect((r) => rects.push(r));
    const rect = rects.find(
      (r) => r.r0 <= focus.row && focus.row <= r.r1 && r.c0 <= focus.col && focus.col <= r.c1,
    );
    if (!rect) return null;

    const values: CellScalar[][] = [];
    for (let r = rect.r0; r <= rect.r1; r++) {
      const line: CellScalar[] = [];
      for (let c = rect.c0; c <= rect.c1; c++) {
        line.push(this.store.getCell({ sheet: this.activeSheet, row: r, col: c }).resolved);
      }
      values.push(line);
    }
    return { rect, values };
  }

  private copy(): void {
    const m = this.selectionMatrix();
    if (!m || !navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(toTsv(m.values));
  }

  private cut(): void {
    const m = this.selectionMatrix();
    if (!m || !navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(toTsv(m.values));
    this.clearSelection();
  }

  private async paste(): Promise<void> {
    if (this.readOnly) return;
    const focus = this.selection.focusCell;
    if (!focus || !navigator.clipboard?.readText) return;

    const text = await navigator.clipboard.readText();
    const grid = parseTsv(text);
    if (grid.length === 0) return;

    const sheet = this.sheet();
    const startPos = this.colIndices.indexOf(focus.col);
    const patches: Patch[] = [];
    for (let r = 0; r < grid.length; r++) {
      const line = grid[r]!;
      for (let c = 0; c < line.length; c++) {
        const targetRow = focus.row + r;
        const targetCol = this.colIndices[startPos + c];
        if (targetRow >= sheet.rowCount || targetCol === undefined) continue;
        const value = coerceInput(
          neutralizeInjection(line[c]!),
          sheet.columns[targetCol]?.type ?? "text",
        );
        patches.push({
          op: "set",
          addr: { sheet: this.activeSheet, row: targetRow, col: targetCol },
          value,
        });
      }
    }
    if (patches.length > 0) this.store.applyTransaction({ patches });
  }

  private emitSelection(): void {
    const sel = this.getSelection();
    for (const fn of this.listeners.selection) fn({ selection: sel });
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

  private toolbarActions(): ToolbarActions {
    return {
      toggleBold: () => this.toggleStyle("bold"),
      toggleItalic: () => this.toggleStyle("italic"),
      setAlign: (align) => this.applyStyle({ align }),
      setTextColor: (color) => this.applyStyle({ color }),
      setFillColor: (color) => this.applyStyle({ backgroundColor: color }),
      setBorder: () => this.applyStyle({ border: { all: { color: this.theme.fg, width: 1 } } }),
      clearFormat: () => this.applyStyle(null),
      merge: () => this.mergeSelection(),
      unmerge: () => this.unmergeSelection(),
      sort: (ascending) => {
        const f = this.selection.focusCell;
        if (f) this.sortBy(f.col, ascending);
      },
    };
  }

  private toggleStyle(prop: "bold" | "italic"): void {
    const f = this.selection.focusCell;
    const on = f
      ? this.store.getCell({ sheet: this.activeSheet, row: f.row, col: f.col }).style[prop]
      : false;
    this.applyStyle({ [prop]: !on });
  }

  /** Re-set selected cells, preserving each value, with `patch` merged into the
   *  style (cleared when `patch` is null). */
  private applyStyle(patch: Partial<CellStyle> | null): void {
    if (this.readOnly || this.selection.isEmpty) return;
    const rects: SelRect[] = [];
    this.selection.forEachRect((r) => rects.push(r));

    const patches: Patch[] = [];
    for (const rect of rects) {
      for (let r = rect.r0; r <= rect.r1; r++) {
        for (let c = rect.c0; c <= rect.c1; c++) {
          const addr = { sheet: this.activeSheet, row: r, col: c };
          const formula = this.loadable?.getFormula(addr) ?? null;
          const cell = this.store.getCell(addr);
          const value: CellValue = formula
            ? { kind: "formula", src: formula }
            : { kind: "literal", value: cell.resolved };
          patches.push({
            op: "set",
            addr,
            value,
            style: patch ? { ...cell.style, ...patch } : undefined,
          });
        }
      }
    }
    if (patches.length > 0) this.store.applyTransaction({ patches });
  }

  private mergeSelection(): void {
    const sel = this.selection.toSelection(this.activeSheet);
    if (sel?.kind !== "range") return;
    const { start, end } = sel.range;
    const list = this.merges.get(this.activeSheet) ?? [];
    list.push({
      r0: Math.min(start.row, end.row),
      c0: Math.min(start.col, end.col),
      r1: Math.max(start.row, end.row),
      c1: Math.max(start.col, end.col),
    });
    this.merges.set(this.activeSheet, list);
    this.applyLayout();
  }

  private unmergeSelection(): void {
    const f = this.selection.focusCell;
    const list = this.merges.get(this.activeSheet);
    if (!f || !list) return;
    this.merges.set(
      this.activeSheet,
      list.filter((m) => !(f.row >= m.r0 && f.row <= m.r1 && f.col >= m.c0 && f.col <= m.c1)),
    );
    this.applyLayout();
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
    this.scroller.removeEventListener("scroll", this.onScroll);
    this.scroller.removeEventListener("mousedown", this.onMouseDown);
    this.scroller.removeEventListener("dblclick", this.onDblClick);
    this.host.removeEventListener("keydown", this.onKeyDown);
    this.resizeObserver?.disconnect();
    this.disposeStore();
    this.renderer.destroy();
    this.scroller.remove();
    this.overlay.remove();
    this.tabBar?.remove();
    this.toolbar?.destroy();
    this.viewportEl.remove();
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

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function coerceInput(raw: string, type: Column["type"]): CellValue {
  const trimmed = raw.trim();
  if (trimmed === "") return { kind: "literal", value: null };
  if (trimmed.length > 1 && trimmed.startsWith("=")) return { kind: "formula", src: trimmed };
  if (type === "number") {
    const n = Number(trimmed);
    if (Number.isFinite(n)) return { kind: "literal", value: n };
  }
  return { kind: "literal", value: raw };
}

function rectDiv(
  left: number,
  top: number,
  width: number,
  height: number,
  background: string,
  border: string,
): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = [
    "position:absolute",
    `left:${left}px`,
    `top:${top}px`,
    `width:${Math.max(0, width)}px`,
    `height:${Math.max(0, height)}px`,
    `background:${background}`,
    `outline:1.5px solid ${border}`,
    "outline-offset:-1px",
    "box-sizing:border-box",
  ].join(";");
  return el;
}
