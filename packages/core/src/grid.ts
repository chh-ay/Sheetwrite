import { load } from "@sheetwrite/wasm";
import { CanvasRenderer } from "./canvas-renderer";
import { OffsetIndex, ScaledScroll } from "./fenwick";
import { SheetwriteStore } from "./store";
import type {
  CellRenderer,
  Column,
  Grid,
  GridEvents,
  GridOptions,
  Selection,
  Sheet,
  SheetId,
  Store,
  Theme,
} from "./types";
import { computeWindow } from "./virtualization";

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
  selection: "#2563eb33",
  selectionBorder: "#2563eb",
  rowHeight: 28,
  headerHeight: 32,
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

interface CellRef {
  row: number;
  col: number;
}

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
  private readonly renderer: CanvasRenderer;
  private readonly overscan: number;
  private readonly datasource: GridOptions["datasource"];
  private readonly customRenderers = new Map<string, CellRenderer>();
  private readonly listeners: { [K in keyof GridEvents]: Set<(e: GridEvents[K]) => void> } = {
    change: new Set(),
    selection: new Set(),
    scroll: new Set(),
  };

  private theme: Theme;
  private activeSheet: SheetId;
  private index: OffsetIndex;
  private scaled: ScaledScroll;
  private colIndices: number[];
  private loaded: Uint8Array;
  private inFlight = new Set<number>();
  private anchor: CellRef | null = null;
  private focus: CellRef | null = null;
  private frame = 0;
  private resizeObserver: ResizeObserver | null = null;
  private readonly onScroll = () => this.scheduleRender();
  private readonly disposeStore: () => void;

  constructor(host: HTMLElement, opts: GridOptions, store?: Store) {
    this.host = host;
    this.store = store ?? new SheetwriteStore(opts.workbook, opts.data);
    this.loadable = this.store instanceof SheetwriteStore ? this.store : null;
    this.datasource = opts.datasource;
    this.overscan = opts.overscan ?? DEFAULT_OVERSCAN;
    this.theme = { ...DEFAULT_THEME, ...resolveThemeFromCss(host), ...opts.theme };
    this.activeSheet = opts.workbook.activeSheet;

    for (const [name, r] of Object.entries(opts.renderers ?? {})) {
      this.customRenderers.set(name, r);
    }

    const sheet = this.sheet();
    this.colIndices = visibleColumns(sheet.columns);
    this.index = new OffsetIndex(sheet.rowCount, this.theme.rowHeight);
    this.scaled = new ScaledScroll(
      this.index.totalHeight + this.theme.headerHeight,
      host.clientHeight,
      MAX_ELEMENT_HEIGHT,
    );
    this.loaded = new Uint8Array(sheet.rowCount);

    // DOM layers: scroller+sizer (L0), canvas (L1, via renderer), overlay (L2).
    host.classList.add("sheetwrite");
    host.style.position = host.style.position || "relative";
    host.style.overflow = "hidden";
    if (!host.hasAttribute("tabindex")) host.tabIndex = 0;

    this.scroller = document.createElement("div");
    this.scroller.className = "sheetwrite-scroller";
    this.scroller.style.cssText = "position:absolute;inset:0;overflow:auto;will-change:transform;";
    this.sizer = document.createElement("div");
    this.sizer.className = "sheetwrite-sizer";
    this.scroller.appendChild(this.sizer);
    host.appendChild(this.scroller);

    this.renderer = new CanvasRenderer();
    this.renderer.mount(host, this.theme);
    this.renderer.setRenderers(this.customRenderers);

    this.overlay = document.createElement("div");
    this.overlay.className = "sheetwrite-overlay";
    this.overlay.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;";
    host.appendChild(this.overlay);

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
    host.addEventListener("keydown", this.onKeyDown);
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.onResize());
      this.resizeObserver.observe(host);
    }
    this.render();
  }

  private sheet(id: SheetId = this.activeSheet): Sheet {
    const s = this.store.getWorkbook().sheets.find((sh) => sh.id === id);
    if (!s) throw new Error(`Sheetwrite: unknown sheet ${id}`);
    return s;
  }

  private applyLayout(): void {
    const sheet = this.sheet();
    this.renderer.setLayout({
      columns: this.colIndices.map((c) => sheet.columns[c]!),
      rowHeight: this.theme.rowHeight,
      headerHeight: this.theme.headerHeight,
      totalRows: sheet.rowCount,
    });
    this.syncSizer();
  }

  private syncSizer(): void {
    this.scaled.update(this.index.totalHeight + this.theme.headerHeight, this.host.clientHeight);
    const sheet = this.sheet();
    let width = 0;
    for (const c of this.colIndices) width += sheet.columns[c]!.width;
    this.sizer.style.width = `${width}px`;
    this.sizer.style.height = `${this.scaled.sizerHeight}px`;
  }

  private rebuildIndex(): void {
    const sheet = this.sheet();
    this.index = new OffsetIndex(sheet.rowCount, this.theme.rowHeight);
    if (this.loaded.length !== sheet.rowCount) this.loaded = new Uint8Array(sheet.rowCount);
    this.syncSizer();
  }

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
    const clientH = this.host.clientHeight;
    const clientW = this.host.clientWidth;
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

    for (const fn of this.listeners.scroll) {
      fn({ scrollTop: contentTop, firstRow: win.start, lastRow: Math.max(win.start, win.end - 1) });
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

  private paintSelection(
    contentTop: number,
    scrollLeft: number,
    clientW: number,
    clientH: number,
  ): void {
    this.overlay.replaceChildren();
    if (!this.anchor || !this.focus) return;
    const sheet = this.sheet();
    const r0 = Math.min(this.anchor.row, this.focus.row);
    const r1 = Math.max(this.anchor.row, this.focus.row);
    const c0 = Math.min(this.anchor.col, this.focus.col);
    const c1 = Math.max(this.anchor.col, this.focus.col);

    const colX = (c: number): number => {
      let x = 0;
      for (let i = 0; i < c; i++) x += sheet.columns[this.colIndices[i]!]!.width;
      return x;
    };
    const left = colX(c0) - scrollLeft;
    const right = colX(c1 + 1) - scrollLeft;
    const top = this.theme.headerHeight + this.index.offsetOf(r0) - contentTop;
    const bottom = this.theme.headerHeight + this.index.offsetOf(r1 + 1) - contentTop;
    if (bottom <= this.theme.headerHeight || top >= clientH || right <= 0 || left >= clientW)
      return;

    const ring = document.createElement("div");
    ring.style.cssText = [
      "position:absolute",
      `left:${left}px`,
      `top:${Math.max(this.theme.headerHeight, top)}px`,
      `width:${Math.max(0, right - left)}px`,
      `height:${Math.max(0, bottom - Math.max(this.theme.headerHeight, top))}px`,
      `background:${this.theme.selection}`,
      `outline:1.5px solid ${this.theme.selectionBorder}`,
      "outline-offset:-1px",
      "box-sizing:border-box",
    ].join(";");
    this.overlay.appendChild(ring);
  }

  private readonly onMouseDown = (e: MouseEvent): void => {
    const cell = this.cellAtPointer(e.clientX, e.clientY);
    if (!cell) return;
    this.anchor = cell;
    this.focus = cell;
    this.emitSelection();
    this.scheduleRender();

    const move = (ev: MouseEvent): void => {
      const c = this.cellAtPointer(ev.clientX, ev.clientY);
      if (!c) return;
      this.focus = c;
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

  private cellAtPointer(clientX: number, clientY: number): CellRef | null {
    const rect = this.host.getBoundingClientRect();
    const py = clientY - rect.top;
    if (py < this.theme.headerHeight) return null;
    const contentTop = this.scaled.toContent(this.scroller.scrollTop);
    const px = clientX - rect.left + this.scroller.scrollLeft;
    const contentY = contentTop + (py - this.theme.headerHeight);
    const sheet = this.sheet();
    const row = this.index.rowAtOffset(contentY).row;
    let x = 0;
    let col = -1;
    for (let i = 0; i < this.colIndices.length; i++) {
      const w = sheet.columns[this.colIndices[i]!]!.width;
      if (px >= x && px < x + w) {
        col = this.colIndices[i]!;
        break;
      }
      x += w;
    }
    if (col === -1 || row < 0 || row >= sheet.rowCount) return null;
    return { row, col };
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!this.focus) return;
    const sheet = this.sheet();
    let { row, col } = this.focus;
    const lastCol = this.colIndices[this.colIndices.length - 1] ?? 0;
    switch (e.key) {
      case "ArrowDown":
        row = Math.min(sheet.rowCount - 1, row + 1);
        break;
      case "ArrowUp":
        row = Math.max(0, row - 1);
        break;
      case "ArrowRight":
        col = Math.min(lastCol, col + 1);
        break;
      case "ArrowLeft":
        col = Math.max(this.colIndices[0] ?? 0, col - 1);
        break;
      case "Home":
        col = this.colIndices[0] ?? 0;
        break;
      case "End":
        col = lastCol;
        break;
      default:
        return;
    }
    e.preventDefault();
    this.focus = { row, col };
    if (!e.shiftKey) this.anchor = this.focus;
    this.emitSelection();
    this.scrollToCell({ sheet: this.activeSheet, row, col });
    this.scheduleRender();
  };

  private emitSelection(): void {
    const sel = this.getSelection();
    for (const fn of this.listeners.selection) fn({ selection: sel });
  }

  setActiveSheet(id: SheetId): void {
    this.activeSheet = id;
    const sheet = this.sheet();
    this.colIndices = visibleColumns(sheet.columns);
    this.index = new OffsetIndex(sheet.rowCount, this.theme.rowHeight);
    this.loaded = new Uint8Array(sheet.rowCount);
    this.inFlight.clear();
    this.anchor = null;
    this.focus = null;
    this.scroller.scrollTop = 0;
    this.scroller.scrollLeft = 0;
    this.applyLayout();
    this.render();
  }

  scrollToCell(addr: { sheet: SheetId; row: number; col: number }): void {
    if (addr.sheet !== this.activeSheet) this.setActiveSheet(addr.sheet);
    const top = this.index.offsetOf(addr.row);
    const bottom = top + this.index.heightOf(addr.row);
    const bodyHeight = Math.max(0, this.host.clientHeight - this.theme.headerHeight);
    const contentTop = this.scaled.toContent(this.scroller.scrollTop);
    let target = contentTop;
    if (top < contentTop) target = top;
    else if (bottom > contentTop + bodyHeight) target = bottom - bodyHeight;
    if (target !== contentTop) this.scroller.scrollTop = this.scaled.toScroll(target);
    this.scheduleRender();
  }

  getSelection(): Selection | null {
    if (!this.anchor || !this.focus) return null;
    if (this.anchor.row === this.focus.row && this.anchor.col === this.focus.col) {
      return { kind: "cell", addr: { sheet: this.activeSheet, ...this.focus } };
    }
    return {
      kind: "range",
      range: {
        sheet: this.activeSheet,
        start: {
          row: Math.min(this.anchor.row, this.focus.row),
          col: Math.min(this.anchor.col, this.focus.col),
        },
        end: {
          row: Math.max(this.anchor.row, this.focus.row),
          col: Math.max(this.anchor.col, this.focus.col),
        },
      },
    };
  }

  setSelection(sel: Selection | null): void {
    if (!sel) {
      this.anchor = null;
      this.focus = null;
    } else if (sel.kind === "cell") {
      this.anchor = { row: sel.addr.row, col: sel.addr.col };
      this.focus = this.anchor;
    } else if (sel.kind === "range") {
      this.anchor = { row: sel.range.start.row, col: sel.range.start.col };
      this.focus = { row: sel.range.end.row, col: sel.range.end.col };
    } else if (sel.kind === "row") {
      this.anchor = { row: sel.row, col: this.colIndices[0] ?? 0 };
      this.focus = { row: sel.row, col: this.colIndices[this.colIndices.length - 1] ?? 0 };
    } else if (sel.kind === "column") {
      this.anchor = { row: 0, col: sel.col };
      this.focus = { row: Math.max(0, this.sheet().rowCount - 1), col: sel.col };
    }
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

  on<E extends keyof GridEvents>(evt: E, fn: (e: GridEvents[E]) => void): () => void {
    this.listeners[evt].add(fn);
    return () => this.listeners[evt].delete(fn);
  }

  refresh(): void {
    this.render();
  }

  private onResize(): void {
    this.syncSizer();
    this.render();
  }

  destroy(): void {
    if (this.frame) (globalThis.cancelAnimationFrame ?? clearTimeout)(this.frame);
    this.scroller.removeEventListener("scroll", this.onScroll);
    this.scroller.removeEventListener("mousedown", this.onMouseDown);
    this.host.removeEventListener("keydown", this.onKeyDown);
    this.resizeObserver?.disconnect();
    this.disposeStore();
    this.renderer.destroy();
    this.scroller.remove();
    this.overlay.remove();
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
