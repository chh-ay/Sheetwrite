import { isLoaded, load } from "@sheetwrite/wasm";
import { colToA1 } from "./a1.js";
import { AriaMirror } from "./aria-mirror.js";
import {
  fontFor,
  intersectingMerges,
  layoutTextLines,
  mergeAnchorAt,
  prepareMergeIndex,
} from "./canvas-paint.js";
import { CanvasRenderer } from "./canvas-renderer.js";
import { cellScalarToText, parseCellInput } from "./cell-input.js";
import { ClipboardController } from "./clipboard-controller.js";
import { ContextMenu } from "./context-menu.js";
import { DatasourceController } from "./datasource-controller.js";
import { DocumentController } from "./document-controller.js";
import { EditController, type EditNavigate } from "./editor.js";
import { downloadBytes, toCsv, toXlsxTable } from "./export.js";
import { FindBar } from "./find-bar.js";
import { GeometryLayoutController } from "./geometry-layout-controller.js";
import { InputController } from "./input-controller.js";
import { MutationRevisionIndex, type MutationRevisionStats } from "./mutation-revision-index.js";
import { OverlayPainter } from "./overlay-painter.js";
import { RenderCoordinator } from "./render-coordinator.js";
import { SearchController } from "./search-controller.js";
import { type CellRef, SelectionModel, type SelRect } from "./selection.js";
import { SheetTabs } from "./sheet-tabs.js";
import { IncompleteDataError, SheetwriteStore } from "./store.js";
import { StyleActions } from "./style-actions.js";
import { Toolbar } from "./toolbar.js";
import type {
  CellScalar,
  CellStyle,
  CellValue,
  Column,
  ConditionalFormatRule,
} from "./types/cell.js";
import type {
  CellAddress,
  HighlightRange,
  PresenceOverlay,
  Range,
  Selection,
  SheetId,
} from "./types/coordinates.js";
import type { AggregateOp } from "./types/data.js";
import type {
  AddSheetInput,
  ColumnFilter,
  CommitReason,
  DataValidationRule,
  DocumentOp,
  MutationPolicyMode,
  ProtectedRange,
  ProtectionResolver,
  RowGroup,
  Sheet,
  SheetSnapshot,
  SortKey,
  WorkbookSnapshot,
} from "./types/document.js";
import type {
  CellInputSnapshot,
  Grid,
  GridActions,
  GridConfig,
  GridEvents,
  GridOptions,
  ReplaceResult,
  SearchOptions,
  SearchResult,
} from "./types/grid.js";
import type { CellRenderer, Renderer, Theme } from "./types/render.js";
import type { Store, VisibleWindowView } from "./types/store.js";
import type {
  ApplyTransactionResult,
  GridTransaction,
  RemoteOperationOptions,
} from "./types/transaction.js";
import { ValidationEditor } from "./validation-editor.js";
import { WorkerRenderer } from "./worker-renderer.js";

/** Conservative sizer ceiling when the real layout clamp cannot be measured. */
const MAX_ELEMENT_HEIGHT_FALLBACK = 15_000_000;
/** Keep the sizer safely under the measured clamp so rounding never truncates it. */
const MAX_ELEMENT_HEIGHT_MARGIN = 4_096;

/**
 * Browsers clamp both element heights and scroll offsets at engine-specific
 * ceilings that SHRINK with browser zoom / `devicePixelRatio` (Chromium:
 * ~33.5M CSS px at 100% zoom, /1.25 at 125%). The two clamps are not the
 * same and neither is a constant, so the achievable scroll range is measured
 * end to end with a real scroller probe: force `scrollTop` past any limit and
 * read back what the engine actually kept. Re-measured on zoom changes.
 */
export function measureMaxElementHeight(
  doc: Document | null | undefined = typeof document === "undefined" ? undefined : document,
): number {
  if (!doc?.body) return MAX_ELEMENT_HEIGHT_FALLBACK;
  const scroller = doc.createElement("div");
  scroller.style.cssText =
    "position:absolute;visibility:hidden;left:-9999px;width:32px;height:32px;overflow:scroll;";
  const sizer = doc.createElement("div");
  sizer.style.cssText = "width:1px;height:1000000000000px;";
  scroller.append(sizer);
  doc.body.append(scroller);
  const layoutClamp = sizer.getBoundingClientRect().height;
  scroller.scrollTop = 1_000_000_000_000;
  const scrollClamp = scroller.scrollTop > 0 ? scroller.scrollTop + scroller.clientHeight : 0;
  scroller.remove();
  const measured = Math.min(
    Number.isFinite(layoutClamp) && layoutClamp > 0 ? layoutClamp : Number.POSITIVE_INFINITY,
    Number.isFinite(scrollClamp) && scrollClamp > 0 ? scrollClamp : Number.POSITIVE_INFINITY,
  );
  if (!Number.isFinite(measured) || measured < 1_000_000) return MAX_ELEMENT_HEIGHT_FALLBACK;
  return Math.floor(measured) - MAX_ELEMENT_HEIGHT_MARGIN;
}
const DEFAULT_OVERSCAN = 6;
const DEFAULT_COL_WIDTH = 100;

/** Hard ceiling for one auto-fit bulk read. */
export const AUTO_FIT_CHUNK_CELLS = 16_384;

export interface AutoFitResourceStats {
  readonly chunkCellLimit: number;
  readonly windowRequests: number;
  readonly maxWindowCells: number;
  readonly scheduledChunks: number;
  readonly completedJobs: number;
  readonly cancelledJobs: number;
  readonly committedPatches: number;
}

/** Scale every `<n>px` occurrence in a CSS font shorthand by `zoom`. */
function scaleFontPx(font: string, zoom: number): string {
  return font.replace(
    /(\d+(?:\.\d+)?)px/g,
    (_, px: string) => `${Math.round(Number.parseFloat(px) * zoom * 10) / 10}px`,
  );
}

/** Default canvas theme used before CSS and explicit theme overrides. */
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

/**
 * Widen the row-number gutter to fit the largest row label; a fixed width
 * clips at 6-7 digit row counts. An explicit `rowHeaderWidth: 0` still hides
 * the gutter entirely.
 */
function adaptiveRowHeaderWidth(theme: Theme, dataRowCount: number): number {
  if (theme.rowHeaderWidth <= 0) return theme.rowHeaderWidth;
  const digits = String(Math.max(1, dataRowCount)).length;
  const fontMatch = /(\d+(?:\.\d+)?)px/.exec(theme.font);
  const fontPx = fontMatch ? Number(fontMatch[1]) : 12;
  return Math.max(theme.rowHeaderWidth, Math.ceil(digits * fontPx * 0.6 + 12));
}

/** Load the WASM data engine once. Must be awaited before `createGrid`. */
export async function initSheetwrite(
  source?: BufferSource | URL | string | Request | WebAssembly.Module,
): Promise<void> {
  await load(source);
}

/** Whether `initSheetwrite` has completed — the single readiness source. */
export function isSheetwriteReady(): boolean {
  return isLoaded();
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

  // `--sheetwrite-font` may be a full CSS font shorthand including a
  // line-height (`13px / 1.4 system-ui`); canvas `ctx.font` and the px
  // parsers reject that segment, so strip it before mapping.
  const font = read("--sheetwrite-font");
  if (font)
    theme.font = font
      .replace(/\/\s*[\d.]+/, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  return theme;
}

/** Creates and mounts an imperative Grid in the supplied host element. */
export function createGrid(host: HTMLElement, opts: GridOptions): Grid {
  if (!isLoaded()) {
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
  private renderer: Renderer;
  private readonly editor: EditController;
  private readonly validationEditor: ValidationEditor;
  private readonly input: InputController;
  private readonly ariaMirror: AriaMirror;
  private readonly searchController: SearchController;
  private readonly clipboard: ClipboardController;
  private readonly styleActions: StyleActions;
  private readonly document: DocumentController;
  private readonly datasourceController: DatasourceController;
  private readonly geometry: GeometryLayoutController;
  private readonly overlayPainter: OverlayPainter;
  private readonly renderCoordinator: RenderCoordinator;
  private overscan: number;
  private readOnly: boolean;
  private maxElementHeight = MAX_ELEMENT_HEIGHT_FALLBACK;
  private lastDevicePixelRatio = 1;
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
  private readonly onContextMenu = (e: MouseEvent): void => {
    if (!this.contextMenu) return;
    e.preventDefault();

    const addr = this.getCellAtPoint(e.clientX, e.clientY);
    if (addr && !this.selection.contains(addr.row, addr.col)) {
      this.selection.selectCell(addr.row, addr.col);
      this.emitSelection();
      this.scheduleRender();
    }

    this.contextMenu.open({
      cell: addr,
      clientX: e.clientX,
      clientY: e.clientY,
    });
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
    "renderer-fallback": new Set(),
    "datasource-error": new Set(),
    "mutation-rejected": new Set(),
    "export-error": new Set(),
  };

  /** Which renderer actually constructed; set by `createRenderer`. */
  private activeRendererKind: "canvas" | "worker" = "canvas";

  private theme: Theme;
  private activeSheet: SheetId;
  /** Memoized active `Sheet` object; invalidated on store change / tab switch. */
  private activeSheetCache: Sheet | null = null;
  private readonly virtualColumnTargets = new Map<SheetId, number>();
  private selection: SelectionModel;
  private readonly mutationRevisions = new MutationRevisionIndex();
  private destroyed = false;
  private storeEpoch = 0;
  private autoFitGeneration = 0;
  private autoFitFrame = 0;
  private autoFitActive = false;
  private readonly autoFitStats = {
    windowRequests: 0,
    maxWindowCells: 0,
    scheduledChunks: 0,
    completedJobs: 0,
    cancelledJobs: 0,
    committedPatches: 0,
  };
  private resizeObserver: ResizeObserver | null = null;
  private readonly onScroll = () => this.scheduleRender();
  private readonly disposeStore: () => void;

  constructor(
    host: HTMLElement,
    opts: GridOptions,
    store?: Store,
    ownsStore = store === undefined,
  ) {
    this.host = host;
    const workbook = opts.workbook;
    this.store =
      store ??
      new SheetwriteStore(workbook, opts.data, {
        storage: opts.datasourceStorage?.mode ?? "dense",
        chunkRows: opts.datasourceStorage?.chunkRows,
        cacheBytes: opts.datasourceStorage?.cacheBytes,
        protectionResolver: opts.protectionResolver,
        mutationPolicy: opts.mutationPolicy,
      });
    this.loadable = this.store instanceof SheetwriteStore ? this.store : null;
    this.store.setProtectionResolver?.(opts.protectionResolver, opts.mutationPolicy);
    this.ownsStore = ownsStore;
    const virtualTarget = padTarget(host, opts.minColumns);
    for (const sheet of workbook.sheets) {
      this.virtualColumnTargets.set(sheet.id, Math.max(sheet.columns.length, virtualTarget));
    }
    const datasource = opts.datasource?.getRows;
    this.readOnly = opts.readOnly ?? false;
    this.config = opts.config;
    this.overscan = opts.overscan ?? DEFAULT_OVERSCAN;
    this.baseTheme = { ...DEFAULT_THEME, ...resolveThemeFromCss(host), ...opts.theme };
    this.activeSheet = opts.workbook.activeSheet;
    this.theme = this.withAdaptiveGutter(
      this.baseTheme,
      workbook.sheets.find((sheet) => sheet.id === this.activeSheet)?.rowCount ?? 0,
    );
    this.tabBarHeight = opts.config?.tabs !== false && opts.workbook.sheets.length > 1 ? 28 : 0;
    this.document = new DocumentController({
      store: this.store,
      loadable: this.loadable,
      readOnly: () => this.readOnly,
      epoch: () => this.storeEpoch,
      materializeVirtualColumns: (patches) => this.materializeVirtualColumns(patches),
      onMutationRejected: (issues) => {
        for (const fn of this.listeners["mutation-rejected"]) fn({ issues });
      },
      onHistoryApplied: () => {
        this.emitSelection();
        this.render();
      },
    });

    // Headless hosts opt out of (or intercept) the stock key bindings once at
    // construction; the input controller consults this on every keydown.
    const keyboardOpt = opts.config?.keyboard ?? true;
    this.keyboardPolicy =
      typeof keyboardOpt === "function" ? (e: KeyboardEvent) => keyboardOpt(e, this) : keyboardOpt;

    for (const [name, r] of Object.entries(opts.renderers ?? {})) {
      this.customRenderers.set(name, r);
    }

    const sheet = this.sheet();
    this.maxElementHeight = measureMaxElementHeight();
    this.lastDevicePixelRatio = globalThis.devicePixelRatio ?? 1;
    this.geometry = new GeometryLayoutController(
      {
        sheet: () => this.sheet(),
        activeSheet: () => this.activeSheet,
        loadable: this.loadable,
        theme: () => this.theme,
        zoom: () => this.zoom,
        maxElementHeight: () => this.maxElementHeight,
      },
      host.clientHeight - this.tabBarHeight,
    );
    this.selection = new SelectionModel(sheet.rowCount, this.firstCol(), this.lastCol());
    this.datasourceController = new DatasourceController(
      {
        datasource,
        loadable: this.loadable,
        activeSheet: () => this.activeSheet,
        rowCount: (sheetId) => this.sheet(sheetId).rowCount,
        revision: () => this.storeEpoch,
        isCellNewerThan: (address, revision) =>
          this.mutationRevisions.isNewerThan(address, revision),
        retainRevision: (revision) => this.mutationRevisions.retainRevision(revision),
        onRowsLoaded: () => {
          this.storeEpoch += 1;
          this.scheduleRender();
        },
        onError: (request, error) => {
          for (const fn of this.listeners["datasource-error"]) fn({ request, error });
        },
      },
      sheet.rowCount,
    );
    this.searchController = new SearchController({
      store: this.store,
      loadable: this.loadable,
      activeSheet: () => this.activeSheet,
      sheet: (id) => this.sheet(id),
      toViewRow: (dataRow) => this.toViewRow(dataRow),
      viewportAnchor: () =>
        this.geometry.viewportAnchor(
          this.geometry.toContent(this.scroller.scrollTop),
          this.scroller.scrollLeft,
        ),
      scrollToCell: (addr) => this.scrollToCell(addr),
      scheduleRender: () => this.scheduleRender(),
      emit: (result) => {
        for (const fn of this.listeners.search) fn(result);
      },
      readOnly: () => this.readOnly,
      commit: (patches) => this.document.commit(patches, "replace"),
    });
    this.clipboard = new ClipboardController({
      store: this.store,
      selection: () => this.selection,
      activeSheet: () => this.activeSheet,
      sheet: () => this.sheet(),
      colIndices: () => this.geometry.columnIndices,
      readOnly: () => this.readOnly,
      mergeAnchorAt: (row, col) => this.mergeAnchorAt(row, col),
      toDataRow: (viewRow) => this.toDataRow(viewRow),
      commit: (patches, reason) => this.document.commit(patches, reason),
    });
    this.styleActions = new StyleActions({
      store: this.store,
      loadable: this.loadable,
      selection: () => this.selection,
      activeSheet: () => this.activeSheet,
      sheet: () => this.sheet(),
      readOnly: () => this.readOnly,
      theme: () => this.theme,
      merges: () => this.sheet().merges ?? [],
      anchorCell: (row, col) => this.anchorCell(row, col),
      toDataRow: (viewRow) => this.toDataRow(viewRow),
      commit: (patches) => this.document.commit(patches, "style"),
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
    this.validationEditor = new ValidationEditor(this.viewportEl);
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
      colIndices: () => this.geometry.columnIndices,
      firstCol: () => this.firstCol(),
      lastCol: () => this.lastCol(),
      nextVisibleCol: (col, dir) => this.nextVisibleCol(col, dir),
      colAtX: (contentX) => this.colAtX(contentX),
      rowAtOffset: (contentY) => this.geometry.rowAtOffset(contentY),
      rowCount: () => this.geometry.rowCount,
      contentTop: () => this.geometry.toContent(this.scroller.scrollTop),
      viewportH: () => this.viewportH(),
      colLeftOf: (col) => this.colLeftOf(col),
      rowTop: (row) => this.geometry.rowOffset(row),
      rowHeight: (row) => this.geometry.rowHeight(row),
      visibleRowWindow: () =>
        this.geometry.visibleRowWindow(
          this.geometry.toContent(this.scroller.scrollTop),
          this.viewportH(),
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
      commit: (patches, reason) => this.document.commit(patches, reason),
      readOnly: () => this.readOnly,
    });

    this.overlayPainter = new OverlayPainter(this.viewportEl, {
      theme: () => this.theme,
      activeSheet: () => this.activeSheet,
      sheet: () => this.sheet(),
      selection: () => this.selection,
      rowOffsetOf: (row) => this.geometry.rowOffset(row),
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
      isEditing: () => this.editor.isEditing || this.validationEditor.isEditing,
      fillTarget: () => this.input.fillPreview,
      fillHandleScreen: (contentTop, scrollLeft) =>
        this.input.fillHandleScreen(contentTop, scrollLeft),
      searchMatches: () => this.searchController.matches,
      searchActive: () => this.searchController.active,
      searchVersion: () => this.searchController.version,
      geometryVersion: () => this.renderCoordinator.geometryVersion,
      scheduleRender: () => this.scheduleRender(),
    });

    this.ariaMirror = new AriaMirror({
      host,
      scroller: this.scroller,
      overlay: this.overlayPainter.element,
      viewport: this.viewportEl,
      rowCount: sheet.rowCount,
      colCount: this.geometry.columnIndices.length,
      readOnly: this.readOnly,
      focusCell: () => this.selection.focusCell,
      noteAt: (row, col) =>
        this.getNote({ sheet: this.activeSheet, row: this.toDataRow(row), col }),
      selection: () => this.selection.toSelection(this.activeSheet),
    });

    this.renderCoordinator = new RenderCoordinator({
      renderer: () => this.renderer,
      overlayPainter: this.overlayPainter,
      ariaMirror: this.ariaMirror,
      geometry: this.geometry,
      datasource: this.datasourceController,
      store: this.store,
      activeSheet: () => this.activeSheet,
      theme: () => this.theme,
      overscan: () => this.overscan,
      zoom: () => this.zoom,
      storeEpoch: () => this.storeEpoch,
      viewportHeight: () => this.viewportH(),
      viewportWidth: () => this.viewportEl.clientWidth,
      scrollTop: () => this.scroller.scrollTop,
      scrollLeft: () => this.scroller.scrollLeft,
      repositionEditor: (contentTop, scrollLeft) => this.repositionEditor(contentTop, scrollLeft),
      emitScroll: (event) => {
        for (const fn of this.listeners.scroll) fn(event);
      },
    });

    if (this.tabBarHeight > 0) this.buildTabBar();

    this.disposeStore = this.store.on("change", (event) => {
      this.storeEpoch += 1;
      if (this.autoFitActive) this.cancelAutoFit();
      this.mutationRevisions.record(event.transaction.patches, this.storeEpoch);
      this.activeSheetCache = null;
      let shouldRebuildRows = false;
      let shouldRebuildColumns = false;
      let shouldApplyLayout = false;
      let sheetsChanged = false;
      let shouldResetDatasource = false;
      for (const patch of event.transaction.patches) {
        if (
          (patch.op === "addRows" ||
            patch.op === "removeRows" ||
            patch.op === "moveRows" ||
            patch.op === "addColumns" ||
            patch.op === "removeColumns" ||
            patch.op === "moveColumns") &&
          patch.sheet === this.activeSheet
        ) {
          shouldResetDatasource = true;
        }
        if (
          patch.op === "addRows" ||
          patch.op === "removeRows" ||
          patch.op === "moveRows" ||
          (patch.op === "setRowMeta" && patch.sheet === this.activeSheet) ||
          (patch.op === "setSheetMeta" && patch.patch.rowGroups !== undefined)
        ) {
          shouldRebuildRows = true;
        } else if (
          patch.op === "addColumns" ||
          patch.op === "removeColumns" ||
          patch.op === "moveColumns" ||
          (patch.op === "setColumn" &&
            patch.sheet === this.activeSheet &&
            ("width" in patch.patch || "visible" in patch.patch))
        ) {
          shouldRebuildColumns = true;
        }
        if (patch.op === "addMerge" || patch.op === "removeMerge" || patch.op === "setSheetMeta") {
          shouldApplyLayout = true;
        }
        if (
          patch.op === "addSheet" ||
          patch.op === "removeSheet" ||
          patch.op === "renameSheet" ||
          patch.op === "moveSheet"
        ) {
          sheetsChanged = true;
        }
      }
      if (shouldResetDatasource) {
        this.datasourceController.reset(this.sheet().rowCount);
        this.mutationRevisions.clear();
      }
      if (!this.sheetById(this.activeSheet)) {
        this.setActiveSheet(this.store.getWorkbook().activeSheet);
      }
      if (shouldRebuildRows) this.rebuildIndex();
      if (shouldRebuildColumns) this.rebuildColumnIndex();
      if (shouldRebuildColumns || shouldApplyLayout) this.applyLayout();
      if (sheetsChanged) this.renderTabs();
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
        let worker: WorkerRenderer;
        worker = new WorkerRenderer(opts.workerUrl, {}, (error) => {
          this.fallbackWorkerRenderer(worker, error);
        });
        worker.mount(host, this.theme);
        this.activeRendererKind = "worker";
        return worker;
      } catch (error) {
        // Worker unavailable (no OffscreenCanvas / construction blocked) —
        // fall back observably after post-construction subscribers can attach.
        this.emitRendererFallback(error);
      }
    }
    const canvas = new CanvasRenderer();
    canvas.mount(host, this.theme);
    this.activeRendererKind = "canvas";
    return canvas;
  }

  private fallbackWorkerRenderer(worker: WorkerRenderer, error: unknown): void {
    if (this.destroyed || this.renderer !== worker || this.activeRendererKind !== "worker") return;

    worker.destroy();
    const canvas = new CanvasRenderer();
    canvas.mount(this.viewportEl, this.theme);
    canvas.setRenderers(this.customRenderers);
    this.renderer = canvas;
    this.activeRendererKind = "canvas";
    this.applyLayout();
    this.scheduleRender();
    this.emitRendererFallback(error);
  }

  private emitRendererFallback(error: unknown): void {
    queueMicrotask(() => {
      if (this.destroyed) return;
      for (const fn of this.listeners["renderer-fallback"]) {
        fn({ requested: "worker", error });
      }
    });
  }

  rendererKind(): "canvas" | "worker" {
    return this.activeRendererKind;
  }

  // ── sheet / layout geometry ────────────────────────────────────────────────

  private sheet(id: SheetId = this.activeSheet): Sheet {
    if (id === this.activeSheet && this.activeSheetCache) return this.activeSheetCache;

    const stored = this.store.getWorkbook().sheets.find((sheet) => sheet.id === id);
    if (!stored) throw new Error(`Sheetwrite: unknown sheet ${id}`);
    const target = this.virtualColumnTargets.get(id) ?? stored.columns.length;
    const sheet =
      target > stored.columns.length ? { ...stored, columns: [...stored.columns] } : stored;
    if (sheet !== stored) appendPadColumns(sheet.columns, target);
    if (id === this.activeSheet) this.activeSheetCache = sheet;
    return sheet;
  }

  private sheetById(id: SheetId): Sheet | null {
    return this.store.getWorkbook().sheets.find((sheet) => sheet.id === id) ?? null;
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
    this.sheetTabs = new SheetTabs(bar, {
      onActivate: (id) => this.setActiveSheet(id),
      onAdd: () => {
        const id = this.addSheet({ name: `Sheet ${this.store.getWorkbook().sheets.length + 1}` });
        if (this.sheetById(id)) this.setActiveSheet(id);
      },
      onRemove: (id) => this.removeSheet(id),
      onRename: (id) => {
        const sheet = this.sheetById(id);
        if (!sheet) return;
        const name = globalThis.prompt?.("Rename sheet", sheet.name)?.trim();
        if (name) this.renameSheet(id, name);
      },
      onMove: (id, toIndex) => this.moveSheet(id, toIndex),
    });
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
    return this.geometry.firstColumn();
  }

  private lastCol(): number {
    return this.geometry.lastColumn();
  }

  private colLeftOf(col: number): number {
    return this.geometry.columnLeft(col);
  }

  private colAtX(contentX: number): number {
    return this.geometry.columnAtX(contentX);
  }

  private nextVisibleCol(col: number, dir: 1 | -1): number {
    return this.geometry.nextVisibleColumn(col, dir);
  }

  private frozenRowCount(): number {
    return this.geometry.frozenRowCount();
  }

  private frozenColCount(): number {
    return this.geometry.frozenColumnCount();
  }

  private frozenHeight(): number {
    return this.geometry.frozenHeight();
  }

  private frozenWidth(): number {
    return this.geometry.frozenWidth();
  }

  private firstBodyCol(): number {
    return this.geometry.firstBodyColumn();
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
    const merge = this.mergeAnchorAt(row, col);
    return this.geometry.rangeRect(
      {
        sheet: this.activeSheet,
        start: { row: merge?.r0 ?? row, col: merge?.c0 ?? col },
        end: { row: merge?.r1 ?? row, col: merge?.c1 ?? col },
      },
      contentTop,
      scrollLeft,
    );
  }

  private contentXAt(viewportX: number): number {
    const contentX = viewportX - this.theme.rowHeaderWidth;
    const frozen = this.frozenColCount() > 0 && contentX < this.frozenWidth();
    return frozen ? contentX : contentX + this.scroller.scrollLeft;
  }

  private contentYAt(viewportY: number): number {
    return this.geometry.pointerContentY(viewportY, this.scroller.scrollTop);
  }

  private applyLayout(): void {
    this.renderCoordinator.invalidate();
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
      zoom: this.zoom,
      merges: this.loadable?.hasView(this.activeSheet) ? [] : (sheet.merges ?? []),
    });
    this.selection.setBounds(sheet.rowCount, this.firstCol(), this.lastCol());
    this.syncSizer();
  }

  private syncSizer(): void {
    // Browser zoom moves the layout clamp; a stale cap truncates tall documents.
    const devicePixelRatio = globalThis.devicePixelRatio ?? 1;
    if (devicePixelRatio !== this.lastDevicePixelRatio) {
      this.lastDevicePixelRatio = devicePixelRatio;
      this.maxElementHeight = measureMaxElementHeight();
    }
    const size = this.geometry.layoutSize(this.viewportH());
    this.sizer.style.width = `${size.width}px`;
    this.sizer.style.height = `${size.height}px`;
  }

  /** The gutter tracks the active sheet's digit count; identity when unchanged. */
  private withAdaptiveGutter(theme: Theme, rowCount: number): Theme {
    const rowHeaderWidth = adaptiveRowHeaderWidth(theme, rowCount);
    return rowHeaderWidth === theme.rowHeaderWidth ? theme : { ...theme, rowHeaderWidth };
  }

  private rebuildIndex(): void {
    this.geometry.rebuildRows();
    this.datasourceController.resize(this.geometry.rowCount);
    // Row-count changes can grow the row-number gutter (e.g. crossing 1M rows).
    const adjusted = this.withAdaptiveGutter(this.theme, this.sheet().rowCount);
    if (adjusted !== this.theme) {
      this.theme = adjusted;
      this.renderer.setTheme(this.theme);
    }
    this.syncSizer();
  }

  private rebuildColumnIndex(): void {
    this.geometry.rebuildColumns();
    this.renderCoordinator.invalidateColumns();
    this.ariaMirror?.setColumnCount(this.geometry.columnIndices.length);
  }

  private toDataRow(viewRow: number): number {
    return this.geometry.toDataRow(viewRow);
  }

  private toViewRow(dataRow: number): number | null {
    return this.geometry.toViewRow(dataRow);
  }

  private mergeAnchorAt(row: number, col: number): SelRect | null {
    if (this.loadable?.hasView(this.activeSheet)) return null;

    const merges = this.sheet().merges;
    if (!merges) return null;

    return mergeAnchorAt(prepareMergeIndex(merges), row, col);
  }

  private anchorCell(row: number, col: number): CellRef {
    const merge = this.mergeAnchorAt(row, col);
    return merge ? { row: merge.r0, col: merge.c0 } : { row, col };
  }

  private scheduleRender(): void {
    this.renderCoordinator.schedule();
  }

  private render(): void {
    this.renderCoordinator.renderNow();
  }

  private repositionEditor(contentTop: number, scrollLeft: number): void {
    const editorCell = this.editor.editingCell;
    if (editorCell) {
      this.editor.position(this.screenRect(editorCell.row, editorCell.col, contentTop, scrollLeft));
    }
    const validationCell = this.validationEditor.editingCell;
    if (validationCell) {
      this.validationEditor.position(
        this.screenRect(validationCell.row, validationCell.col, contentTop, scrollLeft),
      );
    }
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
    const contentTop = this.geometry.toContent(this.scroller.scrollTop);

    this.selection.selectCell(editCell.row, editCell.col);
    this.scheduleRender();

    for (const fn of this.listeners["edit-begin"]) {
      fn({ addr: { sheet: this.activeSheet, row: editCell.row, col: editCell.col } });
    }

    const validationRule = sheet.validationRules?.find(
      (rule) =>
        rule.range.sheet === dataAddr.sheet &&
        dataAddr.row >= Math.min(rule.range.start.row, rule.range.end.row) &&
        dataAddr.row <= Math.max(rule.range.start.row, rule.range.end.row) &&
        dataAddr.col >= Math.min(rule.range.start.col, rule.range.end.col) &&
        dataAddr.col <= Math.max(rule.range.start.col, rule.range.end.col) &&
        (rule.condition.kind === "list" || rule.condition.kind === "checkbox"),
    );
    if (initial === undefined && validationRule) {
      this.editor.cancel();
      this.validationEditor.begin({
        row: editCell.row,
        col: editCell.col,
        rule: validationRule,
        current,
        rect: this.screenRect(editCell.row, editCell.col, contentTop, this.scroller.scrollLeft),
        theme: this.theme,
        onCommit: (value, navigate) =>
          this.commitCellEdit(editCell.row, editCell.col, { kind: "literal", value }, navigate),
        onCancel: () => {
          this.host.focus();
          this.scheduleRender();
        },
      });
      return;
    }
    this.validationEditor.cancel(false);
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
    this.commitCellEdit(row, col, parseCellInput(raw, column?.type ?? "text"), navigate);
  }

  private commitCellEdit(row: number, col: number, value: CellValue, navigate: EditNavigate): void {
    const dataRow = this.toDataRow(row);
    const reason: CommitReason =
      navigate === "down" ? "edit-enter" : navigate === "none" ? "edit-blur" : "edit-tab";
    const outcome = this.document.commit(
      [
        {
          op: "set",
          addr: { sheet: this.activeSheet, row: dataRow, col },
          value,
        },
      ],
      reason,
    );

    if (outcome.status === "applied") {
      for (const fn of this.listeners["edit-commit"]) {
        fn({ addr: { sheet: this.activeSheet, row, col }, value });
      }
      this.moveAfterCommit(row, col, navigate);
    }
    this.host.focus();
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

    const sheet = this.sheet();
    const patches: DocumentOp[] = [];
    const rects: SelRect[] = [];
    this.selection.forEachRect((rect) => rects.push(rect));
    const merges = sheet.merges;
    const mergeIndex = merges ? prepareMergeIndex(merges) : null;
    const intersectsMerge =
      mergeIndex !== null &&
      rects.some(
        (rect) =>
          intersectingMerges(mergeIndex, rect.r0, rect.r1 + 1, [rect.c0, rect.c1]).length > 0,
      );
    if (!intersectsMerge) {
      for (const rect of rects) {
        let runStart = this.toDataRow(rect.r0);
        let previous = runStart;
        for (let viewRow = rect.r0 + 1; viewRow <= rect.r1 + 1; viewRow++) {
          const dataRow = viewRow <= rect.r1 ? this.toDataRow(viewRow) : -1;
          if (viewRow <= rect.r1 && Math.abs(dataRow - previous) === 1) {
            previous = dataRow;
            continue;
          }
          patches.push({
            op: "clearRange",
            range: {
              sheet: this.activeSheet,
              start: { row: runStart, col: rect.c0 },
              end: { row: previous, col: rect.c1 },
            },
          });
          runStart = dataRow;
          previous = dataRow;
        }
      }
    } else {
      const seen = new Set<number>();
      const nullValue: CellValue = { kind: "literal", value: null };
      for (const rect of rects) {
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
      }
    }

    this.document.commit(patches, "clear");
  }

  private emitSelection(): void {
    this.ariaMirror.bumpVersion();
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

  setPresenceOverlays(overlays: readonly PresenceOverlay[] | null): void {
    this.overlayPainter.setPresenceOverlays(overlays);
  }

  styleRange(range: Range, style: Partial<CellStyle> | null): void {
    if (this.readOnly) return;

    this.document.commit(
      [
        {
          op: "setRangeStyle",
          range: {
            sheet: range.sheet,
            start: {
              row: Math.min(range.start.row, range.end.row),
              col: Math.min(range.start.col, range.end.col),
            },
            end: {
              row: Math.max(range.start.row, range.end.row),
              col: Math.max(range.start.col, range.end.col),
            },
          },
          style,
        },
      ],
      "style",
    );
  }

  dataEdge(row: number, col: number, dRow: number, dCol: number): number | null {
    // View-aware in the store: with an active sort/filter view, `row` is a
    // view position and vertical moves return view positions.
    if (!this.loadable) return null;
    return this.loadable.dataEdge(this.activeSheet, row, col, dRow, dCol);
  }
  private measurementContext(): CanvasRenderingContext2D | null {
    const canvas = document.createElement("canvas");
    return canvas.getContext("2d");
  }

  private requireAutoFitRangeLoaded(range: Range): void {
    if (!this.loadable || this.loadable.isRangeFullyLoaded(range)) return;
    const capability = this.loadable.queryCapability(range.sheet);
    if (capability.status === "incomplete") throw new IncompleteDataError(range.sheet, capability);
  }

  private noteAutoFitWindow(rows: number, columns: number): void {
    const cells = rows * columns;
    this.autoFitStats.windowRequests += 1;
    this.autoFitStats.maxWindowCells = Math.max(this.autoFitStats.maxWindowCells, cells);
  }

  private scheduleAutoFitChunk(step: () => void): void {
    this.autoFitStats.scheduledChunks += 1;
    const requestFrame =
      globalThis.requestAnimationFrame ??
      ((callback: FrameRequestCallback): number =>
        setTimeout(() => callback(performance.now()), 0) as unknown as number);
    let invokedSynchronously = false;
    const frame = requestFrame(() => {
      invokedSynchronously = true;
      this.autoFitFrame = 0;
      step();
    });
    if (!invokedSynchronously) this.autoFitFrame = frame;
  }

  private cancelAutoFit(): void {
    this.autoFitGeneration += 1;
    if (this.autoFitActive) {
      this.autoFitActive = false;
      this.autoFitStats.cancelledJobs += 1;
    }
    if (this.autoFitFrame !== 0) {
      (globalThis.cancelAnimationFrame ?? clearTimeout)(this.autoFitFrame);
      this.autoFitFrame = 0;
    }
  }

  private measureAutoFitRowWindow(
    context: CanvasRenderingContext2D,
    sheet: Sheet,
    view: VisibleWindowView,
    columns: readonly number[],
    bandStart: number,
    requiredHeights: Float64Array,
    mergeWidths: ReadonlyMap<number, number>,
  ): void {
    const fallbackFontSize =
      Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(this.baseTheme.font)?.[1] ?? "") || 12;
    for (let row = view.rows.start; row < view.rows.end; row++) {
      const requiredIndex = row - bandStart;
      let required = requiredHeights[requiredIndex] ?? this.baseTheme.rowHeight;
      for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
        const col = columns[columnIndex]!;
        const valueIndex = (row - view.rows.start) * columns.length + columnIndex;
        const value = view.values[valueIndex];
        if (value === null || value === undefined || value === "") continue;
        const column = sheet.columns[col]!;
        const cellStyle = view.styles[view.styleIds[valueIndex]!] ?? {};
        const style = column.cellStyle ? { ...column.cellStyle, ...cellStyle } : cellStyle;
        const text = cellScalarToText(value);
        if (!style.wrap && !text.includes("\n")) continue;
        const width =
          mergeWidths.get(row * sheet.columns.length + col) ?? sheet.columns[col]!.width;
        const fontSize = style.fontSize ?? fallbackFontSize;
        context.font = fontFor(this.baseTheme, style);
        const lineCount = layoutTextLines(context, text, Math.max(0, width - 12)).length;
        required = Math.max(required, Math.ceil(lineCount * fontSize * 1.2 + 8));
      }
      requiredHeights[requiredIndex] = required;
    }
  }

  private measureAutoFitColumnWindow(
    context: CanvasRenderingContext2D,
    sheet: Sheet,
    view: VisibleWindowView,
    columns: readonly number[],
    targetOffset: number,
    widths: Float64Array,
  ): void {
    for (let row = view.rows.start; row < view.rows.end; row++) {
      for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
        const col = columns[columnIndex]!;
        const valueIndex = (row - view.rows.start) * columns.length + columnIndex;
        const value = view.values[valueIndex];
        if (value === null || value === undefined || value === "") continue;
        const column = sheet.columns[col]!;
        const cellStyle = view.styles[view.styleIds[valueIndex]!] ?? {};
        const style = column.cellStyle ? { ...column.cellStyle, ...cellStyle } : cellStyle;
        context.font = fontFor(this.baseTheme, style);
        let width = widths[targetOffset + columnIndex]!;
        for (const line of cellScalarToText(value).split("\n")) {
          width = Math.max(width, context.measureText(line).width + 12);
        }
        widths[targetOffset + columnIndex] = width;
      }
    }
  }

  autoFitRows(range?: Range): void {
    if (this.readOnly || (range && range.sheet !== this.activeSheet)) return;
    this.cancelAutoFit();
    const sheetId = this.activeSheet;
    const sheet = this.sheet();
    const r0 = Math.max(0, Math.min(range?.start.row ?? 0, range?.end.row ?? sheet.rowCount - 1));
    const r1 = Math.min(
      sheet.rowCount - 1,
      Math.max(range?.start.row ?? 0, range?.end.row ?? sheet.rowCount - 1),
    );
    const c0 = Math.max(
      0,
      Math.min(range?.start.col ?? 0, range?.end.col ?? sheet.columns.length - 1),
    );
    const c1 = Math.min(
      sheet.columns.length - 1,
      Math.max(range?.start.col ?? 0, range?.end.col ?? sheet.columns.length - 1),
    );
    if (r1 < r0 || c1 < c0) return;
    const measuredRange: Range = {
      sheet: sheetId,
      start: { row: r0, col: c0 },
      end: { row: r1, col: c1 },
    };
    this.requireAutoFitRangeLoaded(measuredRange);
    const context = this.measurementContext();
    if (!context) return;

    const mergeWidths = new Map<number, number>();
    for (const merge of sheet.merges ?? []) {
      let width = 0;
      for (let col = merge.c0; col <= merge.c1; col++) width += sheet.columns[col]?.width ?? 0;
      mergeWidths.set(merge.r0 * sheet.columns.length + merge.c0, width);
    }
    const rowCount = r1 - r0 + 1;
    const columnCount = c1 - c0 + 1;
    const patches: DocumentOp[] = [];
    const appendRowPatches = (bandStart: number, required: Float64Array): void => {
      for (let offset = 0; offset < required.length; offset++) {
        const viewRow = bandStart + offset;
        const dataRow = this.toDataRow(viewRow);
        const height = required[offset]!;
        if ((sheet.rowHeights?.get(dataRow) ?? this.baseTheme.rowHeight) === height) continue;
        patches.push({
          op: "setRowMeta",
          sheet: sheetId,
          row: dataRow,
          meta: { height },
        });
      }
    };

    if (rowCount * columnCount <= AUTO_FIT_CHUNK_CELLS) {
      const columns = Array.from({ length: columnCount }, (_, index) => c0 + index);
      const view = this.store.getVisibleWindow(sheetId, { start: r0, end: r1 + 1 }, columns);
      this.noteAutoFitWindow(rowCount, columnCount);
      const required = new Float64Array(rowCount);
      required.fill(this.baseTheme.rowHeight);
      this.measureAutoFitRowWindow(context, sheet, view, columns, r0, required, mergeWidths);
      appendRowPatches(r0, required);
      this.autoFitStats.completedJobs += 1;
      this.autoFitStats.committedPatches += patches.length;
      this.document.commit(patches, "structure");
      return;
    }

    const columnsPerWindow = Math.min(columnCount, AUTO_FIT_CHUNK_CELLS);
    const rowsPerBand = Math.max(1, Math.floor(AUTO_FIT_CHUNK_CELLS / columnsPerWindow));
    let bandStart = r0;
    let bandEnd = Math.min(r1 + 1, bandStart + rowsPerBand);
    let columnStart = c0;
    let required = new Float64Array(bandEnd - bandStart);
    required.fill(this.baseTheme.rowHeight);
    const generation = this.autoFitGeneration;
    this.autoFitActive = true;

    const step = (): void => {
      if (
        !this.autoFitActive ||
        generation !== this.autoFitGeneration ||
        this.destroyed ||
        this.activeSheet !== sheetId
      ) {
        return;
      }
      const count = Math.min(columnsPerWindow, c1 - columnStart + 1);
      const columns = Array.from({ length: count }, (_, index) => columnStart + index);
      const view = this.store.getVisibleWindow(
        sheetId,
        { start: bandStart, end: bandEnd },
        columns,
      );
      this.noteAutoFitWindow(bandEnd - bandStart, columns.length);
      this.measureAutoFitRowWindow(context, sheet, view, columns, bandStart, required, mergeWidths);
      columnStart += count;
      if (columnStart > c1) {
        appendRowPatches(bandStart, required);
        bandStart = bandEnd;
        if (bandStart > r1) {
          this.autoFitActive = false;
          this.autoFitStats.completedJobs += 1;
          this.autoFitStats.committedPatches += patches.length;
          this.document.commit(patches, "structure");
          return;
        }
        bandEnd = Math.min(r1 + 1, bandStart + rowsPerBand);
        columnStart = c0;
        required = new Float64Array(bandEnd - bandStart);
        required.fill(this.baseTheme.rowHeight);
      }
      this.scheduleAutoFitChunk(step);
    };
    this.scheduleAutoFitChunk(step);
  }

  autoFitColumns(cols?: readonly number[]): void {
    if (this.readOnly) return;
    this.cancelAutoFit();
    const sheetId = this.activeSheet;
    const sheet = this.sheet();
    const targets = cols
      ? [...new Set(cols)].filter((col) => col >= 0 && col < sheet.columns.length)
      : sheet.columns.map((_, col) => col);
    if (targets.length === 0) return;
    for (const col of targets) {
      this.requireAutoFitRangeLoaded({
        sheet: sheetId,
        start: { row: 0, col },
        end: { row: Math.max(0, sheet.rowCount - 1), col },
      });
    }
    const context = this.measurementContext();
    if (!context) return;
    const widths = new Float64Array(targets.length);
    for (let index = 0; index < targets.length; index++) {
      const column = sheet.columns[targets[index]!]!;
      context.font = fontFor(this.baseTheme, {
        ...column.headerStyle,
        bold: column.headerStyle?.bold ?? true,
      });
      widths[index] = context.measureText(column.header).width + 12;
    }
    const patches: DocumentOp[] = [];
    const commitWidths = (): void => {
      for (let index = 0; index < targets.length; index++) {
        const col = targets[index]!;
        const width = Math.max(1, Math.ceil(widths[index]!));
        if (sheet.columns[col]!.width === width) continue;
        patches.push({ op: "setColumn", sheet: sheetId, col, patch: { width } });
      }
      this.autoFitStats.completedJobs += 1;
      this.autoFitStats.committedPatches += patches.length;
      this.document.commit(patches, "structure");
    };

    const totalCells = sheet.rowCount * targets.length;
    if (totalCells <= AUTO_FIT_CHUNK_CELLS) {
      const view = this.store.getVisibleWindow(sheetId, { start: 0, end: sheet.rowCount }, targets);
      this.noteAutoFitWindow(sheet.rowCount, targets.length);
      this.measureAutoFitColumnWindow(context, sheet, view, targets, 0, widths);
      commitWidths();
      return;
    }

    const columnsPerWindow = Math.min(targets.length, AUTO_FIT_CHUNK_CELLS);
    const rowsPerWindow = Math.max(1, Math.floor(AUTO_FIT_CHUNK_CELLS / columnsPerWindow));
    let targetOffset = 0;
    let columns = targets.slice(targetOffset, targetOffset + columnsPerWindow);
    let rowStart = 0;
    const generation = this.autoFitGeneration;
    this.autoFitActive = true;

    const step = (): void => {
      if (
        !this.autoFitActive ||
        generation !== this.autoFitGeneration ||
        this.destroyed ||
        this.activeSheet !== sheetId
      ) {
        return;
      }
      const rowEnd = Math.min(sheet.rowCount, rowStart + rowsPerWindow);
      const view = this.store.getVisibleWindow(sheetId, { start: rowStart, end: rowEnd }, columns);
      this.noteAutoFitWindow(rowEnd - rowStart, columns.length);
      this.measureAutoFitColumnWindow(context, sheet, view, columns, targetOffset, widths);
      rowStart = rowEnd;
      if (rowStart >= sheet.rowCount) {
        targetOffset += columns.length;
        if (targetOffset >= targets.length) {
          this.autoFitActive = false;
          commitWidths();
          return;
        }
        columns = targets.slice(targetOffset, targetOffset + columnsPerWindow);
        rowStart = 0;
      }
      this.scheduleAutoFitChunk(step);
    };
    this.scheduleAutoFitChunk(step);
  }

  setRowHeight(row: number, height: number): void {
    this.document.commit(
      [
        {
          op: "setRowMeta",
          sheet: this.activeSheet,
          row: this.toDataRow(row),
          meta: { height: Math.max(1, height) },
        },
      ],
      "structure",
    );
  }

  setColumnWidth(col: number, width: number): void {
    this.document.commit(
      [{ op: "setColumn", sheet: this.activeSheet, col, patch: { width: Math.max(1, width) } }],
      "structure",
    );
  }

  setMinColumns(minColumns?: number): void {
    const stored = this.store.getWorkbook().sheets.find((sheet) => sheet.id === this.activeSheet);
    if (!stored) return;
    const target = Math.max(stored.columns.length, padTarget(this.host, minColumns));
    if (target === this.virtualColumnTargets.get(this.activeSheet)) return;
    this.virtualColumnTargets.set(this.activeSheet, target);
    this.activeSheetCache = null;
    this.rebuildColumnIndex();
    this.applyLayout();
    this.scheduleRender();
  }
  setOverscan(overscan?: number): void {
    const next = overscan === undefined ? DEFAULT_OVERSCAN : Math.max(0, Math.floor(overscan));
    if (next === this.overscan) return;
    this.overscan = next;
    // Read per frame by the window calculations; a repaint picks it up.
    this.renderCoordinator.invalidate();
    this.scheduleRender();
  }

  // ── public API ─────────────────────────────────────────────────────────────

  /** Internal structural counters used by allocation regression tests and range benchmarks. */
  getMutationRevisionStats(): MutationRevisionStats {
    return this.mutationRevisions.stats();
  }
  getAutoFitResourceStats(): AutoFitResourceStats {
    return { ...this.autoFitStats, chunkCellLimit: AUTO_FIT_CHUNK_CELLS };
  }

  resetAutoFitResourceStats(): void {
    this.autoFitStats.windowRequests = 0;
    this.autoFitStats.maxWindowCells = 0;
    this.autoFitStats.scheduledChunks = 0;
    this.autoFitStats.completedJobs = 0;
    this.autoFitStats.cancelledJobs = 0;
    this.autoFitStats.committedPatches = 0;
  }

  setActiveSheet(id: SheetId): void {
    if (id === this.activeSheet) return;
    if (!this.store.getWorkbook().sheets.some((sheet) => sheet.id === id)) return;

    this.editor.cancel();
    this.validationEditor.cancel();
    this.cancelAutoFit();
    this.mutationRevisions.clear();
    this.activeSheet = id;
    this.activeSheetCache = null;
    const sheet = this.sheet();

    this.rebuildColumnIndex();
    this.geometry.rebuildRows();
    this.selection = new SelectionModel(sheet.rowCount, this.firstCol(), this.lastCol());
    this.datasourceController.reset(sheet.rowCount);
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

  getCellAtPoint(clientX: number, clientY: number): CellAddress | null {
    const cell = this.input.cellAtPointer(clientX, clientY);
    return cell ? { sheet: this.activeSheet, row: cell.row, col: cell.col } : null;
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
    if (!column || row < 0 || row >= this.geometry.rowCount) return null;

    const cell = this.anchorCell(row, col);
    const address = {
      sheet: this.activeSheet,
      row: this.toDataRow(cell.row),
      col: cell.col,
    };
    const formula = this.loadable?.getFormula(address) ?? this.store.getFormula(address);
    const resolved = this.store.getCell(address).resolved;
    const text = formula ?? cellScalarToText(resolved);

    return { address, text, format: column.type };
  }

  scrollToCell(addr: CellAddress): void {
    if (addr.sheet !== this.activeSheet) this.setActiveSheet(addr.sheet);

    // Cells inside the frozen bands are always visible on their pinned axis.
    const fr = this.frozenRowCount();
    const frozenH = this.frozenHeight();
    if (addr.row >= fr) {
      const top = this.geometry.rowOffset(addr.row);
      const bottom = top + this.geometry.rowHeight(addr.row);
      const bodyHeight = Math.max(0, this.viewportH() - this.theme.headerHeight);
      const contentTop = this.geometry.toContent(this.scroller.scrollTop);

      // Visible body band in content space: [contentTop + frozenH, contentTop + bodyHeight).
      let target = contentTop;
      if (top < contentTop + frozenH) target = top - frozenH;
      else if (bottom > contentTop + bodyHeight) target = bottom - bodyHeight;
      if (target !== contentTop) {
        this.scroller.scrollTop = this.geometry.toScroll(Math.max(0, target));
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

  replaceTheme(theme: Partial<Theme> | undefined): void {
    // Re-run construction-time resolution (grid.ts constructor): defaults,
    // then host CSS custom properties, then the new option value.
    this.baseTheme = { ...DEFAULT_THEME, ...resolveThemeFromCss(this.host), ...(theme ?? {}) };
    this.applyZoomedTheme();
  }

  getEffectiveTheme(): Theme {
    return this.theme;
  }

  setReadOnly(readOnly: boolean): void {
    if (readOnly === this.readOnly) return;

    this.readOnly = readOnly;
    if (readOnly) {
      this.cancelAutoFit();
      this.editor.cancel();
      this.validationEditor.cancel();
    }
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

  applyTransaction(transaction: GridTransaction): ApplyTransactionResult {
    return this.document.commit(transaction.patches.slice(), "api");
  }

  exportSnapshot(): WorkbookSnapshot {
    const snapshot = this.store.exportSnapshot?.();
    if (!snapshot) {
      throw new Error("Sheetwrite: the injected Store does not support snapshot export");
    }
    return snapshot;
  }

  applyRemoteOperations(
    operations: readonly DocumentOp[],
    options: RemoteOperationOptions = {},
  ): ApplyTransactionResult {
    return this.document.applyRemoteOperations(operations, options);
  }

  setZoom(zoom: number): void {
    if (!Number.isFinite(zoom)) return;
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
    const scaled =
      z === 1
        ? base
        : {
            ...base,
            rowHeight: base.rowHeight * z,
            headerHeight: base.headerHeight * z,
            rowHeaderWidth: base.rowHeaderWidth * z,
            font: scaleFontPx(base.font, z),
          };
    this.theme = this.withAdaptiveGutter(scaled, this.sheet().rowCount);
    this.renderer.setTheme(this.theme);
    this.syncTabBarTheme();
    this.rebuildIndex();
    this.rebuildColumnIndex();
    this.applyLayout();
    this.render();
  }

  setFrozen(rows: number, cols = 0): void {
    this.document.commit(
      [
        {
          op: "setSheetMeta",
          sheet: this.activeSheet,
          patch: {
            frozenRows: Math.max(0, Math.floor(rows)),
            frozenCols: Math.max(0, Math.floor(cols)),
          },
        },
      ],
      "structure",
    );
  }

  defineCellRenderer(name: string, renderer: CellRenderer): void {
    this.customRenderers.set(name, renderer);
    this.renderer.setRenderers(this.customRenderers);
    this.scheduleRender();
  }

  insertRows(at: number, count = 1): void {
    if (count <= 0) return;
    this.document.commit(
      [{ op: "addRows", sheet: this.activeSheet, at: Math.max(0, at), count }],
      "structure",
    );
  }

  removeRows(at: number, count = 1): void {
    const sheet = this.sheet();
    if (count <= 0 || at >= sheet.rowCount) return;
    this.document.commit(
      [
        {
          op: "removeRows",
          sheet: this.activeSheet,
          at: Math.max(0, at),
          count: Math.min(count, sheet.rowCount - Math.max(0, at)),
        },
      ],
      "structure",
    );
  }

  insertColumns(at: number, count = 1): void {
    if (count <= 0) return;
    const insertAt = Math.max(0, Math.min(at, this.sheet().columns.length));
    this.document.commit(
      [
        {
          op: "addColumns",
          sheet: this.activeSheet,
          at: insertAt,
          columns: this.makeBlankColumns(insertAt, count),
        },
      ],
      "structure",
    );
  }

  removeColumns(at: number, count = 1): void {
    const sheet = this.sheet();
    if (count <= 0 || at >= sheet.columns.length || sheet.columns.length <= 1) return;
    const removeAt = Math.max(0, at);
    this.document.commit(
      [
        {
          op: "removeColumns",
          sheet: this.activeSheet,
          at: removeAt,
          count: Math.min(count, sheet.columns.length - removeAt, sheet.columns.length - 1),
        },
      ],
      "structure",
    );
  }

  addSheet(input: AddSheetInput): SheetId {
    if (this.readOnly) return this.activeSheet;
    const used = new Set(this.store.getWorkbook().sheets.map((sheet) => sheet.id));
    let id = input.id?.trim() || "sheet";
    let suffix = 2;
    while (used.has(id)) id = `${input.id?.trim() || "sheet"}-${suffix++}`;
    const columns = input.columns?.map((column) => ({ ...column })) ?? [
      { key: "a", header: "A", width: DEFAULT_COL_WIDTH, type: "text" as const },
    ];
    const snapshot: SheetSnapshot = {
      id,
      name: input.name,
      order: this.store.getWorkbook().sheets.length,
      rowCount: input.rowCount ?? 100,
      columns,
      cells: [],
    };
    this.document.commit([{ op: "addSheet", sheet: snapshot }], "structure");
    return id;
  }

  removeSheet(id: SheetId): void {
    this.document.commit([{ op: "removeSheet", sheet: id }], "structure");
  }

  renameSheet(id: SheetId, name: string): void {
    this.document.commit([{ op: "renameSheet", sheet: id, name }], "structure");
  }

  moveSheet(id: SheetId, toIndex: number): void {
    this.document.commit([{ op: "moveSheet", sheet: id, to: toIndex }], "structure");
  }

  setConditionalFormats(rules: readonly ConditionalFormatRule[]): void {
    this.document.commit(
      [
        {
          op: "setSheetMeta",
          sheet: this.activeSheet,
          patch: { conditionalFormats: rules.map((rule) => ({ ...rule })) },
        },
      ],
      "style",
    );
  }

  setValidationRule(rule: DataValidationRule): ApplyTransactionResult {
    return this.document.commit(
      [{ op: "setValidationRule", sheet: this.activeSheet, rule: structuredClone(rule) }],
      "api",
    );
  }

  removeValidationRule(id: string): ApplyTransactionResult {
    return this.document.commit(
      [{ op: "removeValidationRule", sheet: this.activeSheet, id }],
      "api",
    );
  }

  setProtectedRange(protectedRange: ProtectedRange): ApplyTransactionResult {
    return this.document.commit(
      [
        {
          op: "setProtectedRange",
          sheet: this.activeSheet,
          protectedRange: structuredClone(protectedRange),
        },
      ],
      "api",
    );
  }

  removeProtectedRange(id: string): ApplyTransactionResult {
    return this.document.commit(
      [{ op: "removeProtectedRange", sheet: this.activeSheet, id }],
      "api",
    );
  }

  setProtectionResolver(resolver: ProtectionResolver | undefined, mode?: MutationPolicyMode): void {
    this.store.setProtectionResolver?.(resolver, mode);
  }

  setNote(addr: CellAddress, text: string | null): ApplyTransactionResult {
    return this.document.commit([{ op: "setNote", addr: { ...addr }, text: text || null }], "api");
  }

  getNote(addr: CellAddress): string | null {
    return (
      this.sheetById(addr.sheet)?.notes?.find(
        (note) => note.addr.row === addr.row && note.addr.col === addr.col,
      )?.text ?? null
    );
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

  private materializeVirtualColumns(patches: DocumentOp[]): DocumentOp[] {
    const maxColumnBySheet = new Map<SheetId, number>();
    for (const patch of patches) {
      let sheet: SheetId | null = null;
      let col = -1;
      if (patch.op === "set") {
        sheet = patch.addr.sheet;
        col = patch.addr.col;
      } else if (
        patch.op === "setRange" ||
        patch.op === "setBlock" ||
        patch.op === "setRangeStyle" ||
        patch.op === "clearRange"
      ) {
        sheet = patch.range.sheet;
        col = Math.max(patch.range.start.col, patch.range.end.col);
      } else if (patch.op === "setColumn") {
        sheet = patch.sheet;
        col = patch.col;
      } else if (patch.op === "addMerge" || patch.op === "removeMerge") {
        sheet = patch.sheet;
        col = Math.max(patch.merge.c0, patch.merge.c1);
      }
      if (sheet !== null) {
        maxColumnBySheet.set(sheet, Math.max(maxColumnBySheet.get(sheet) ?? -1, col));
      }
    }

    const additions: DocumentOp[] = [];
    for (const [sheetId, maxColumn] of maxColumnBySheet) {
      const stored = this.store.getWorkbook().sheets.find((sheet) => sheet.id === sheetId);
      if (!stored || maxColumn < stored.columns.length) continue;
      const used = new Set(stored.columns.map((column) => column.key));
      const columns: Column[] = [];
      for (let col = stored.columns.length; col <= maxColumn; col++) {
        const base = `col_${col}`;
        let key = base;
        let suffix = 1;
        while (used.has(key)) key = `${base}_${suffix++}`;
        used.add(key);
        columns.push({ key, header: colToA1(col), width: DEFAULT_COL_WIDTH, type: "text" });
      }
      additions.push({ op: "addColumns", sheet: sheetId, at: stored.columns.length, columns });
    }
    return additions.length > 0 ? [...additions, ...patches] : patches;
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
      hideRows: (rows) => {
        const focus = this.selection.focusCell;
        const targets = rows ?? (focus ? [this.toDataRow(focus.row)] : []);
        this.hideRows(targets);
      },
      showRows: (rows) => this.showRows(rows),
      autoFitRows: () => {
        const focus = this.selection.focusCell;
        if (!focus) return;
        const row = this.toDataRow(focus.row);
        this.autoFitRows({
          sheet: this.activeSheet,
          start: { row, col: 0 },
          end: { row, col: Math.max(0, this.sheet().columns.length - 1) },
        });
      },
      hideColumns: (cols) => this.hideColumns(cols),
      showColumns: (cols) => this.showColumns(cols),
      autoFitColumns: (cols) => this.autoFitColumns(cols),
      clearFilter: (col) => {
        const target = col ?? this.selection.focusCell?.col;
        if (target !== undefined) this.setColumnFilter(target, null);
      },
      copy: () => this.clipboard.copy(),
      cut: () => this.clipboard.cut(),
      paste: () => this.clipboard.paste(),
      pasteValues: () => this.clipboard.pasteValues(),
      clearContents: () => this.clearSelection(),
      exportCsv: (filename) => this.exportCsv(filename ?? "sheetwrite.csv"),
      exportXlsx: (filename) => {
        void this.exportXlsx(filename ?? "sheetwrite.xlsx").catch((error: unknown) => {
          this.emitExportError(error);
        });
      },
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
    void this.setSort([{ col, ascending }]);
  }

  filterBy(col: number, needle: string): void {
    this.setColumnFilter(col, { kind: "contains", text: needle });
  }

  clearView(): void {
    const outcome = this.document.commit(
      [
        {
          op: "setSheetMeta",
          sheet: this.activeSheet,
          patch: { sortKeys: [], filters: [] },
        },
      ],
      "structure",
    );
    if (outcome.status === "applied") this.applyView();
  }

  sortByMulti(keys: readonly SortKey[]): void {
    void this.setSort(keys);
  }

  setSort(keys: readonly SortKey[]): ApplyTransactionResult {
    const outcome = this.document.commit(
      [
        {
          op: "setSheetMeta",
          sheet: this.activeSheet,
          patch: { sortKeys: keys.map((key) => ({ ...key })) },
        },
      ],
      "structure",
    );
    if (outcome.status === "applied") this.applyView();
    return outcome;
  }

  setColumnFilter(col: number, filter: ColumnFilter | null): void {
    const filters = new Map(this.sheet().filters ?? []);
    if (filter === null) filters.delete(col);
    else filters.set(col, structuredClone(filter));
    const outcome = this.document.commit(
      [
        {
          op: "setSheetMeta",
          sheet: this.activeSheet,
          patch: { filters: [...filters] },
        },
      ],
      "structure",
    );
    if (outcome.status === "applied") this.applyView();
  }

  getColumnFilters(): ReadonlyMap<number, ColumnFilter> {
    return new Map(this.sheet().filters ?? this.loadable?.columnFilters(this.activeSheet) ?? []);
  }

  distinctValues(col: number, limit = 1000): CellScalar[] {
    return this.loadable?.distinctValues(this.activeSheet, col, limit) ?? [];
  }

  hideRows(rows: readonly number[]): void {
    const sheet = this.sheet();
    const patches: DocumentOp[] = [];
    for (const row of new Set(rows)) {
      if (row < 0 || row >= sheet.rowCount) continue;
      patches.push({
        op: "setRowMeta",
        sheet: this.activeSheet,
        row,
        meta: { height: sheet.rowHeights?.get(row), hidden: true },
      });
    }
    this.document.commit(patches, "structure");
    this.applyView();
  }

  showRows(rows?: readonly number[]): void {
    const sheet = this.sheet();
    const targets = rows ?? [...(sheet.hiddenRows ?? [])];
    const patches: DocumentOp[] = [];
    for (const row of new Set(targets)) {
      if (row < 0 || row >= sheet.rowCount) continue;
      patches.push({
        op: "setRowMeta",
        sheet: this.activeSheet,
        row,
        meta: { height: sheet.rowHeights?.get(row), hidden: false },
      });
    }
    this.document.commit(patches, "structure");
    this.applyView();
  }

  hiddenRows(): readonly number[] {
    return [...(this.sheet().hiddenRows ?? [])].sort((a, b) => a - b);
  }

  hideColumns(cols?: readonly number[]): void {
    const sheet = this.sheet();
    const targets = cols ?? (this.selection.focusCell ? [this.selection.focusCell.col] : []);
    const unique = [...new Set(targets)]
      .filter(
        (col) => col >= 0 && col < sheet.columns.length && sheet.columns[col]?.visible !== false,
      )
      .sort((left, right) => left - right);
    let visibleCount = sheet.columns.reduce(
      (count, column) => count + (column.visible === false ? 0 : 1),
      0,
    );
    const patches: DocumentOp[] = [];
    for (const col of unique) {
      if (visibleCount <= 1) break;
      patches.push({ op: "setColumn", sheet: this.activeSheet, col, patch: { visible: false } });
      visibleCount--;
    }
    this.document.commit(patches, "structure");
  }

  showColumns(cols?: readonly number[]): void {
    const sheet = this.sheet();
    const targets =
      cols ?? sheet.columns.flatMap((column, col) => (column.visible === false ? [col] : []));
    const patches: DocumentOp[] = [];
    for (const col of new Set(targets)) {
      if (col < 0 || col >= sheet.columns.length || sheet.columns[col]?.visible !== false) continue;
      patches.push({ op: "setColumn", sheet: this.activeSheet, col, patch: { visible: true } });
    }
    this.document.commit(patches, "structure");
  }

  hiddenColumns(): readonly number[] {
    return this.sheet().columns.flatMap((column, col) => (column.visible === false ? [col] : []));
  }

  groupRows(start: number, end: number): void {
    const sheet = this.sheet();
    const group = { start: Math.min(start, end), end: Math.max(start, end), collapsed: false };
    const groups = (sheet.rowGroups ?? []).filter(
      (existing) => existing.start !== group.start || existing.end !== group.end,
    );
    this.document.commit(
      [{ op: "setSheetMeta", sheet: this.activeSheet, patch: { rowGroups: [...groups, group] } }],
      "structure",
    );
    this.applyView();
  }

  ungroupRows(start: number, end: number): void {
    const r0 = Math.min(start, end);
    const r1 = Math.max(start, end);
    const groups = (this.sheet().rowGroups ?? []).filter(
      (group) => group.start !== r0 || group.end !== r1,
    );
    this.document.commit(
      [{ op: "setSheetMeta", sheet: this.activeSheet, patch: { rowGroups: groups } }],
      "structure",
    );
    this.applyView();
  }

  setGroupCollapsed(start: number, collapsed: boolean): void {
    const groups = (this.sheet().rowGroups ?? []).map((group) =>
      group.start === start ? { ...group, collapsed } : group,
    );
    this.document.commit(
      [{ op: "setSheetMeta", sheet: this.activeSheet, patch: { rowGroups: groups } }],
      "structure",
    );
    this.applyView();
  }

  rowGroups(): readonly RowGroup[] {
    return this.sheet().rowGroups ?? [];
  }

  undo(): void {
    if (!this.readOnly) this.document.undo();
  }

  redo(): void {
    if (!this.readOnly) this.document.redo();
  }

  private emitExportError(error: unknown): void {
    if (this.destroyed) return;
    for (const listener of this.listeners["export-error"]) {
      listener({ format: "xlsx", error });
    }
  }

  private requireCompleteExport(sheets: readonly Sheet[]): void {
    if (!this.loadable) return;
    for (const sheet of sheets) {
      const capability = this.loadable.queryCapability(sheet.id);
      if (capability.status === "incomplete") {
        throw new IncompleteDataError(sheet.id, capability);
      }
    }
  }

  exportCsv(filename: string): void {
    this.requireCompleteExport([this.sheet()]);
    downloadBytes(toCsv(this.sheet(), this.store), filename, "text/csv;charset=utf-8");
  }

  async exportXlsx(filename: string): Promise<void> {
    const storedWorkbook = this.store.getWorkbook();
    const workbook =
      storedWorkbook.activeSheet === this.activeSheet
        ? storedWorkbook
        : { ...storedWorkbook, activeSheet: this.activeSheet };
    const sheet =
      workbook.sheets.find((candidate) => candidate.id === workbook.activeSheet) ??
      workbook.sheets[0];
    if (sheet) this.requireCompleteExport([sheet]);
    const bytes = await toXlsxTable(workbook, this.store);
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
    this.geometry.rebuildRows(count);
    this.selection.clear();
    this.selection.setBounds(count, this.firstCol(), this.lastCol());
    this.scroller.scrollTop = 0;
    // The view permutation lives outside the store, so it must invalidate the
    // data signature itself — a view change with an identical window/scroll
    // (e.g. sorting while already at the top) would otherwise reuse stale rows.
    this.renderCoordinator.invalidateData();
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
    this.cancelAutoFit();
    this.datasourceController.destroy();
    this.mutationRevisions.clear();
    this.renderCoordinator.destroy();
    this.editor.destroy();
    this.validationEditor.destroy();
    this.input.destroy();
    this.scroller.removeEventListener("scroll", this.onScroll);
    this.scroller.removeEventListener("contextmenu", this.onContextMenu);
    this.resizeObserver?.disconnect();
    this.document.destroy();
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

function appendPadColumns(columns: Column[], target: number): void {
  for (let c = columns.length; c < target; c++) {
    columns.push({ key: `__pad_${c}`, header: "", width: DEFAULT_COL_WIDTH, type: "text" });
  }
}

/** Columns needed to satisfy `minColumns` and fill the host width. */
function padTarget(host: HTMLElement, minColumns: number | undefined): number {
  const fillWidth = host.clientWidth - DEFAULT_THEME.rowHeaderWidth;
  const fillCols = fillWidth > 0 ? Math.ceil(fillWidth / DEFAULT_COL_WIDTH) + 1 : 0;
  return Math.max(minColumns ?? 0, fillCols);
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
