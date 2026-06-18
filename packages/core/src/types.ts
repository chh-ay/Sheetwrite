// Public data model and API contract for @sheetwrite/core.
// Renderer-agnostic, framework-agnostic. No runtime values live here.

// ── Cell model ──────────────────────────────────────────────────────────────

export type CellAlign = "left" | "center" | "right";

export interface CellBorder {
  /** hex color, e.g. "#111111" */
  color?: string;
  width?: number;
  style?: "solid" | "dashed" | "dotted";
}

/** Per-side borders; `all` applies to any side not given its own border. */
export interface CellBorders {
  all?: CellBorder;
  top?: CellBorder;
  right?: CellBorder;
  bottom?: CellBorder;
  left?: CellBorder;
}

export interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  fontSize?: number;
  /** hex color, e.g. "#111111" */
  color?: string;
  /** hex color, e.g. "#ffffff" */
  backgroundColor?: string;
  align?: CellAlign;
  wrap?: boolean;
  border?: CellBorders;
}

export type CellFormat = "text" | "number" | "date";

/** A scalar that can be displayed directly. */
export type CellScalar = string | number | null;

/**
 * A cell's value is a literal, a cross-reference, or a formula.
 * Only `literal` resolves in M0; `ref`/`formula` are reserved for later tiers.
 */
export type CellValue =
  | { kind: "literal"; value: CellScalar }
  | { kind: "ref"; target: CellAddress }
  | { kind: "formula"; src: string };

export interface CellAddress {
  sheet: SheetId;
  row: number;
  col: number;
}

export interface Cell {
  value: CellValue;
  style?: CellStyle;
  merge?: { rows: number; cols: number };
  covered?: boolean;
}

export interface Column {
  key: string;
  header: string;
  width: number;
  type: CellFormat;
  /** Excel number-format code, e.g. "#,##0.00" */
  numberFormat?: string;
  headerStyle?: CellStyle;
  cellStyle?: CellStyle;
  visible?: boolean;
  /** Name of a registered custom cell renderer (see `Grid.defineCellRenderer`). */
  renderer?: string;
}

export type SheetId = string;

export interface Sheet {
  id: SheetId;
  name: string;
  columns: Column[];
  /** Row count for both in-memory and datasource-backed sheets. */
  rowCount: number;
  /** Sparse per-row height overrides; default comes from the theme. */
  rowHeights?: Map<number, number>;
}

export interface Workbook {
  sheets: Sheet[];
  activeSheet: SheetId;
}

// ── Transactions & change events ─────────────────────────────────────────────

export type Patch =
  | { op: "set"; addr: CellAddress; value: CellValue; style?: CellStyle }
  | { op: "addRows"; sheet: SheetId; at: number; count: number }
  | { op: "removeRows"; sheet: SheetId; at: number; count: number }
  | { op: "setColumn"; sheet: SheetId; col: number; patch: Partial<Column> };

export interface Transaction {
  patches: Patch[];
  epoch?: number;
}

/** One committed cell edit, carrying enough to roll back. */
export interface CellChange {
  addr: CellAddress;
  oldValue: CellValue;
  newValue: CellValue;
  oldStyle?: CellStyle;
  newStyle?: CellStyle;
}

/** Payload of the `change` event; flows OUT for API submission/reconcile. */
export interface ChangeEvent {
  transaction: Transaction;
  changes: CellChange[];
  dirty: Patch[];
  epoch?: number;
}

// ── Bulk render-window view (the render hot-path contract) ───────────────────

/**
 * One rectangular window of resolved cells, returned by `Store.getVisibleWindow`
 * in a single call. The renderer paints from this view and MUST NOT call
 * `Store.getCell` per cell. Backed by typed arrays so it is worker-transferable.
 *
 * Lifetime: valid until the next store mutation or window refresh.
 */
export interface VisibleWindowView {
  sheet: SheetId;
  /** end-exclusive row range */
  rows: { start: number; end: number };
  /** visible column indices, in paint order */
  cols: readonly number[];
  /** row-major resolved values, length `(end-start) * cols.length` */
  values: ArrayLike<CellScalar>;
  /** row-major style-dictionary ids, same length as `values` */
  styleIds: Uint32Array;
  /** style dictionary indexed by `styleIds` */
  styles: readonly CellStyle[];
}

// ── Store ─────────────────────────────────────────────────────────────────--

export interface ResolvedCell {
  resolved: CellScalar;
  style: CellStyle;
}

export interface Store {
  getWorkbook(): Workbook;
  /**
   * Single-cell read for interactions, API reads, and tests.
   * NOT for the render hot path — renderers use `getVisibleWindow`.
   */
  getCell(addr: CellAddress): ResolvedCell;
  /** Bulk read of a visible window; the only read a renderer should use per frame. */
  getVisibleWindow(
    sheet: SheetId,
    rows: { start: number; end: number },
    cols: readonly number[],
  ): VisibleWindowView;
  /** Queued and flushed at a barrier — never reentrant. */
  applyTransaction(tx: Transaction): void;
  on(evt: "change", fn: (event: ChangeEvent) => void): () => void;
  /** Pending unsynced edits. */
  getDirty(): Patch[];
  /** Clear dirty flags after the API confirms. */
  markClean(patches: Patch[]): void;
}

// ── Theme ─────────────────────────────────────────────────────────────────--

export interface Theme {
  font: string;
  bg: string;
  fg: string;
  gridLine: string;
  headerBg: string;
  headerFg: string;
  selection: string;
  selectionBorder: string;
  rowHeight: number;
  headerHeight: number;
}

// ── Custom cell renderers ────────────────────────────────────────────────────

export interface CellPaintContext {
  value: CellScalar;
  x: number;
  y: number;
  w: number;
  h: number;
  theme: Theme;
  style: CellStyle;
}

export interface CellRenderer {
  canvas?(ctx: CanvasRenderingContext2D, c: CellPaintContext): void;
  dom?(c: CellPaintContext): HTMLElement;
}

// ── Selection ────────────────────────────────────────────────────────────────

export interface Range {
  sheet: SheetId;
  start: { row: number; col: number };
  end: { row: number; col: number };
}

export type Selection =
  | { kind: "cell"; addr: CellAddress }
  | { kind: "range"; range: Range }
  | { kind: "row"; sheet: SheetId; row: number }
  | { kind: "column"; sheet: SheetId; col: number }
  | { kind: "multi"; ranges: Range[] };

/** Column aggregate operation for `Grid.aggregate` / `Store` data ops. */
export type AggregateOp = "sum" | "avg" | "min" | "max" | "count";

// ── Data input ───────────────────────────────────────────────────────────────

export type RowData = Record<string, CellScalar | CellValue>;

export interface ColumnarData {
  rowCount: number;
  columns: Record<string, ArrayLike<CellScalar | CellValue>>;
}

export interface DataSource {
  rowCount(sheet: SheetId): number | Promise<number>;
  /** Rows in `[start, end)`. Placeholders are shown until this resolves. */
  getRows(sheet: SheetId, start: number, end: number): Promise<RowData[]>;
}

// ── Grid options, events, instance ───────────────────────────────────────────

export interface GridOptions {
  workbook: Workbook;
  data?: ColumnarData;
  datasource?: DataSource;
  renderer?: "canvas" | "worker";
  /**
   * Bundler-resolved URL for the worker renderer (`renderer: "worker"`). Provide
   * it the way your bundler expects (e.g. `new URL("@sheetwrite/core/worker", import.meta.url)`).
   * If omitted or the worker can't be constructed, the grid falls back to the
   * main-thread canvas renderer.
   */
  workerUrl?: string | URL;
  theme?: Partial<Theme>;
  readOnly?: boolean;
  /** Custom cell renderers registered up front; also see `Grid.defineCellRenderer`. */
  renderers?: Record<string, CellRenderer>;
  /** Rows rendered above/below the viewport to absorb fast scrolls. */
  overscan?: number;
}

export interface GridEvents {
  change: ChangeEvent;
  selection: { selection: Selection | null };
  scroll: { scrollTop: number; firstRow: number; lastRow: number };
  "edit-begin": { addr: CellAddress };
  "edit-commit": { addr: CellAddress; value: CellValue };
}

export interface Grid {
  readonly store: Store;
  setActiveSheet(id: SheetId): void;
  scrollToCell(addr: CellAddress): void;
  getSelection(): Selection | null;
  setSelection(sel: Selection | null): void;
  setTheme(theme: Partial<Theme>): void;
  defineCellRenderer(name: string, renderer: CellRenderer): void;
  /** Column aggregate over the active sheet's data. */
  aggregate(col: number, op: AggregateOp): number;
  /** Sort the displayed rows by a column (does not mutate stored data). */
  sortBy(col: number, ascending?: boolean): void;
  /** Filter the displayed rows to those whose column text contains `needle`. */
  filterBy(col: number, needle: string): void;
  /** Clear any active sort/filter view. */
  clearView(): void;
  exportCsv(filename: string): void;
  exportXlsx(filename: string): Promise<void>;
  on<E extends keyof GridEvents>(evt: E, fn: (e: GridEvents[E]) => void): () => void;
  refresh(): void;
  destroy(): void;
}

// ── Renderer backend interface ───────────────────────────────────────────────

export interface RenderLayout {
  columns: readonly Column[];
  rowHeight: number;
  headerHeight: number;
  totalRows: number;
}

export interface Viewport {
  scrollTop: number;
  scrollLeft: number;
  width: number;
  height: number;
}

export interface Renderer {
  mount(host: HTMLElement, theme: Theme): void;
  setLayout(layout: RenderLayout): void;
  setViewport(viewport: Viewport): void;
  /** Paint a window. The renderer never touches the store. */
  paint(view: VisibleWindowView): void;
  setTheme(theme: Theme): void;
  setRenderers(renderers: ReadonlyMap<string, CellRenderer>): void;
  destroy(): void;
}
