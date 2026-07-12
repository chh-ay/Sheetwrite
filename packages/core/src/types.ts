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
  underline?: boolean;
  strikethrough?: boolean;
  fontSize?: number;
  /** hex color, e.g. "#111111" */
  color?: string;
  /** hex color, e.g. "#ffffff" */
  backgroundColor?: string;
  align?: CellAlign;
  wrap?: boolean;
  border?: CellBorders;
}

export type ConditionalFormatPredicate =
  | { kind: "greaterThan"; value: number }
  | { kind: "lessThan"; value: number }
  | { kind: "equal"; value: CellScalar }
  | { kind: "contains"; text: string; matchCase?: boolean };

export interface ConditionalFormatRule {
  range: Range;
  when: ConditionalFormatPredicate;
  style: CellStyle;
}

/**
 * How a column's cells are typed, parsed, and rendered: `text` verbatim, `number`
 * via its `numberFormat`, `date` as an Excel-style serial (see `date-serial.ts`)
 * rendered by a date `numberFormat`, and `currency` as a plain number rendered by
 * a currency `numberFormat` (e.g. `$#,##0.00`).
 */
export type CellFormat = "text" | "number" | "date" | "currency";

/** A scalar that can be displayed directly. */
export type CellScalar = string | number | null;

/**
 * A cell's persisted input: a literal, a cross-reference, or a formula.
 * References resolve through the store's reference graph; formulas resolve in
 * the WASM calculation engine.
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
  /** Conditional styles folded into the bulk render-window style dictionary. */
  conditionalFormats?: ConditionalFormatRule[];
  /** Leading view rows pinned above the scrolling body (0/undefined = none). */
  frozenRows?: number;
  /** Leading columns pinned left of the scrolling body (0/undefined = none). */
  frozenCols?: number;
}

// ── Views: sorting, filtering, hidden rows, grouping ─────────────────────────

/** One key of a multi-column sort, applied in array order (first = primary). */
export interface SortKey {
  col: number;
  ascending: boolean;
}

/**
 * One column's filter predicate. All active column filters AND together;
 * matching is against the cell's resolved value (text or number).
 */
export type ColumnFilter =
  | { kind: "values"; values: readonly CellScalar[] }
  | { kind: "contains"; text: string; matchCase?: boolean }
  | { kind: "compare"; op: "gt" | "gte" | "lt" | "lte" | "eq" | "neq"; value: number }
  | { kind: "empty" }
  | { kind: "nonEmpty" };

/** A collapsible row group (data-row range, end-inclusive), Sheets-style. */
export interface RowGroup {
  start: number;
  end: number;
  collapsed: boolean;
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
  | { op: "addColumns"; sheet: SheetId; at: number; columns: Column[] }
  | { op: "removeColumns"; sheet: SheetId; at: number; count: number }
  | { op: "setColumn"; sheet: SheetId; col: number; patch: Partial<Column> };

/**
 * Low-level Store transaction. `epoch` provides optional optimistic
 * concurrency at the storage boundary.
 *
 * Calling `Store.applyTransaction` bypasses Grid read-only checks and Grid
 * undo/redo history. Host-driven edits should use `Grid.applyTransaction`.
 */
export interface Transaction {
  patches: Patch[];
  epoch?: number;
}

/**
 * An undoable transaction submitted through a Grid.
 *
 * Grid transactions deliberately have no epoch: optimistic reconciliation is
 * a low-level Store concern, while Grid commits are normal host-driven edits
 * that participate in read-only policy and undo/redo history.
 */
export interface GridTransaction {
  patches: Patch[];
}

/** One committed cell edit, carrying enough to roll back. */
export interface CellChange {
  addr: CellAddress;
  oldValue: CellValue;
  newValue: CellValue;
  oldStyle?: CellStyle;
  newStyle?: CellStyle;
}

/**
 * The gesture/operation that produced a committed transaction. Consumers
 * switching on reasons MUST keep a default branch — the union grows with new
 * mutation features.
 */
export type CommitReason =
  | "edit-blur"
  | "edit-enter"
  | "edit-tab"
  | "edit-programmatic"
  | "paste"
  | "cut"
  | "clear"
  | "fill"
  /** Row/column insert/delete/resize. */
  | "structure"
  /** Style, merge, and format actions. */
  | "style"
  /** Find-and-replace. */
  | "replace"
  | "undo"
  | "redo"
  /** `store.applyTransaction` from host code / unclassified. */
  | "api";

/** Payload of the `change` event; flows OUT for API submission/reconcile. */
export interface ChangeEvent {
  transaction: Transaction;
  changes: CellChange[];
  dirty: Patch[];
  /** What produced this commit — see {@link CommitReason}. */
  commitReason: CommitReason;
  epoch?: number;
}

// ── Bulk render-window view (the render hot-path contract) ───────────────────

/**
 * One rectangular window of resolved cells, returned by `Store.getVisibleWindow`
 * in a single call. The renderer paints from this view and MUST NOT call
 * `Store.getCell` per cell. `styleIds` are view-local indices into this view's
 * compact `styles` dictionary; on the worker renderer path, `styleIds.buffer` is
 * transferred during paint, so main-thread code must not read it after `paint`.
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
  /** row-major view-local style ids, same length as `values` */
  styleIds: Uint32Array;
  /** compact window style dictionary indexed by `styleIds` */
  styles: readonly CellStyle[];
  /** Raw cell tags for worker transfer; internal fast path. */
  valueKinds?: Uint8Array;
  /** Raw numeric payloads for worker transfer; internal fast path. */
  numberValues?: Float64Array;
  /** Raw global string-pool ids for worker transfer; `0xffffffff` means none. */
  stringPoolIds?: Uint32Array;
  /** Raw local-string indices for formula errors; `-1` means none. */
  stringLocalIds?: Int32Array;
  /** String-pool ids resolved by this window and safe for worker cache updates. */
  stringPoolUpdateIds?: Uint32Array;
  /** String values parallel to `stringPoolUpdateIds`. */
  stringPoolUpdateValues?: readonly string[];
  /** Local non-pooled strings, currently formula error sentinels. */
  localStrings?: readonly string[];
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
  /** Formula source at `addr`, or null when the cell is not a formula. */
  getFormula(addr: CellAddress): string | null;
  /** Plain-reference target at `addr`, or null when the cell is not a ref. */
  getRefTarget(addr: CellAddress): CellAddress | null;
  /** Bulk read of a visible window; the only read a renderer should use per frame. */
  getVisibleWindow(
    sheet: SheetId,
    rows: { start: number; end: number },
    cols: readonly number[],
  ): VisibleWindowView;
  /**
   * Apply a low-level storage transaction.
   *
   * This bypasses Grid read-only checks and Grid undo/redo history. Use
   * `Grid.applyTransaction` for normal host-driven edits.
   * Queued and flushed at a barrier — never reentrant.
   */
  applyTransaction(tx: Transaction): void;
  on(evt: "change", fn: (event: ChangeEvent) => void): () => void;
  /** Pending unsynced edits. */
  getDirty(): Patch[];
  /** Clear dirty flags after the API confirms. */
  markClean(patches: Patch[]): void;
  /** Displayed row count after any active sort/filter view. */
  viewRowCount(sheet: SheetId): number;
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
  /** Width of the left row-number gutter (0 hides it). */
  rowHeaderWidth: number;
  /** Fill behind a search match. */
  searchMatch: string;
  /** Fill/outline for the active (current) search match. */
  searchActiveMatch: string;
  /** Fill for cells highlighted via Grid.highlightCells. */
  highlight: string;
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

/** A highlight target: a range plus an optional per-range color override. */
export interface HighlightRange extends Range {
  /** Overrides the call-level `color` / theme highlight for this range only. */
  color?: string;
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
  /** Rows in `[start, end)`. Placeholders are shown until this resolves. */
  getRows(sheet: SheetId, start: number, end: number): Promise<RowData[]>;
}

// ── Grid options, events, instance ───────────────────────────────────────────

/**
 * How a clipboard action ended. Permission failures are OUTCOMES, not
 * exceptions: the returned promise never rejects.
 * - `"done"` — the action completed.
 * - `"unsupported"` — the Clipboard API (or the needed method) is absent,
 *   e.g. a non-secure context or Firefox `readText`.
 * - `"blocked"` — the browser rejected the request, typically a permissions
 *   policy or missing user activation.
 * - `"empty"` — nothing to act on (no focused selection, empty clipboard, or
 *   a read-only grid on paste).
 */
export type ClipboardOutcome = "done" | "unsupported" | "blocked" | "empty";

/** Imperative operations the toolbar and context menu bind to; also exposed as `Grid.actions`. */
export interface GridActions {
  toggleBold(): void;
  toggleItalic(): void;
  toggleUnderline(): void;
  toggleStrikethrough(): void;
  setAlign(align: CellAlign): void;
  setTextColor(color: string): void;
  setFillColor(color: string): void;
  toggleBorder(): void;
  clearFormat(): void;
  merge(): void;
  unmerge(): void;
  sort(ascending: boolean): void;
  insertRowAbove(): void;
  insertRowBelow(): void;
  deleteRow(): void;
  insertColumnLeft(): void;
  insertColumnRight(): void;
  deleteColumn(): void;
  /** Copy the focused rectangle to the system clipboard. Never rejects. */
  copy(): Promise<ClipboardOutcome>;
  /** Copy + clear the source (after the clipboard accepted). Never rejects. */
  cut(): Promise<ClipboardOutcome>;
  /** Paste at the focus cell. Never rejects. */
  paste(): Promise<ClipboardOutcome>;
  /** Paste keeping only resolved values — no formulas, no styles (Ctrl+Shift+V). Never rejects. */
  pasteValues(): Promise<ClipboardOutcome>;
  clearContents(): void;
  exportCsv(filename?: string): void;
  exportXlsx(filename?: string): void;
  undo(): void;
  redo(): void;
}

export type ToolbarActionName =
  | "bold"
  | "italic"
  | "underline"
  | "strikethrough"
  | "alignLeft"
  | "alignCenter"
  | "alignRight"
  | "textColor"
  | "fillColor"
  | "border"
  | "clearFormat"
  | "merge"
  | "unmerge"
  | "sortAsc"
  | "sortDesc"
  | "exportCsv"
  | "exportXlsx"
  | "undo"
  | "redo"
  | "separator";

export type ToolbarIcon = string | Node | (() => Node);

export interface ToolbarItem {
  /** Built-in action to bind (or "separator"). Omit when supplying `onClick`. */
  action?: ToolbarActionName;
  /** Custom click handler; receives the grid handle. Overrides `action`. */
  onClick?: (grid: Grid) => void;
  /**
   * Button icon/content. Strings render as plain text; pass a DOM `Node` or a
   * factory returning one for SVG/HTML icons without using `innerHTML`.
   */
  icon?: ToolbarIcon;
  /** Accessible tooltip. */
  title?: string;
}

export type ContextMenuActionName =
  | "cut"
  | "copy"
  | "paste"
  | "clearContents"
  | "merge"
  | "unmerge"
  | "insertRowAbove"
  | "insertRowBelow"
  | "deleteRow"
  | "insertColumnLeft"
  | "insertColumnRight"
  | "deleteColumn"
  | "exportCsv"
  | "exportXlsx"
  | "separator";

export interface ContextMenuItem {
  /** Built-in action to bind (or "separator"). Omit when supplying `onClick`. */
  action?: ContextMenuActionName;
  /** Custom click handler; receives the grid and the right-clicked cell (null if none). */
  onClick?: (grid: Grid, cell: CellAddress | null) => void;
  /** Menu row text. Defaults per action. */
  label?: string;
}

/**
 * Toolbar / feature configuration. When `config` is set the built-in toolbar is
 * shown; each flag toggles one control (all default to `true`).
 */
export interface GridConfig {
  /** Show the built-in toolbar (true), hide it (false), or supply a custom item list. */
  toolbar?: boolean | ToolbarItem[];
  /** Per-control toggles for the built-in toolbar (ignored when `toolbar` is a custom list). */
  bold?: boolean;
  italic?: boolean;
  align?: boolean;
  textColor?: boolean;
  fillColor?: boolean;
  border?: boolean;
  clearFormat?: boolean;
  merge?: boolean;
  sort?: boolean;
  /** Add CSV/XLSX export controls to the built-in toolbar. */
  export?: boolean;
  /** Override built-in toolbar icons by action name. Strings render as plain text; DOM nodes/factories support SVG/HTML icons. */
  icons?: Partial<Record<ToolbarActionName, ToolbarIcon>>;
  /** Right-click cell context menu: enabled (true), disabled (false), or a custom item list. */
  contextMenu?: boolean | ContextMenuItem[];
  /** Show undo/redo controls in the built-in toolbar (default true). */
  undo?: boolean;
  /** Built-in Ctrl+F find widget: enabled (true, default) or disabled (false). */
  find?: boolean;
  /** Bottom sheet-tab bar for multi-sheet workbooks (default true). */
  tabs?: boolean;
  /**
   * Built-in keyboard handling. `true` (default) keeps the stock Sheets-style
   * bindings (navigation, type-to-edit, clipboard, undo/redo, find). `false`
   * disables ALL of them — the host owns key events and drives `grid.actions`,
   * selection, editing, and search primitives itself. A function is consulted
   * first and consumes the event by returning `true`; returning `false` falls
   * through to the stock bindings.
   */
  keyboard?: boolean | ((e: KeyboardEvent, grid: Grid) => boolean);
}

export interface GridOptions {
  workbook: Workbook;
  data?: ColumnarData;
  datasource?: DataSource;
  renderer?: "canvas" | "worker";
  /**
   * URL of the worker renderer module (`renderer: "worker"`), as served to the
   * BROWSER — the platform `Worker` constructor does not consult package
   * exports, so a bare specifier like `new URL("@sheetwrite/core/worker",
   * import.meta.url)` is NOT reliable. Either copy
   * `@sheetwrite/core/dist/worker.js` to your public assets and pass its URL
   * string (works everywhere), or use your bundler's dependency-worker import
   * if it has one (see docs/worker-rendering.md). If omitted or the worker
   * can't be constructed, the grid falls back to the main-thread canvas
   * renderer and emits `renderer-fallback` once.
   */
  workerUrl?: string | URL;
  theme?: Partial<Theme>;
  readOnly?: boolean;
  /** Custom cell renderers registered up front; also see `Grid.defineCellRenderer`. */
  renderers?: Record<string, CellRenderer>;
  /** Rows rendered above/below the viewport to absorb fast scrolls. */
  overscan?: number;
  /** Render at least this many columns (empty padding columns past the data, like a spreadsheet). */
  minColumns?: number;
  config?: GridConfig;
}

export interface SearchOptions {
  /** Case-sensitive match (default false). */
  matchCase?: boolean;
  /** Match only when the whole cell text equals the query (default false: substring). */
  wholeCell?: boolean;
  /** Restrict to a sheet (defaults to the active sheet). */
  sheet?: SheetId;
  /** Restrict to these column indices (defaults to all columns). */
  columns?: number[];
}

export interface SearchResult {
  query: string;
  /** Matching cells in row-major order. */
  matches: CellAddress[];
  /** Index of the active match within `matches`, or -1 when there are none. */
  active: number;
}

export interface ReplaceResult {
  /** How many cells were rewritten. */
  replaced: number;
  /** Search state after the replacement (matches re-scanned against the new data). */
  result: SearchResult;
}

/**
 * View-aware editable snapshot of one cell, for hosts building a detached
 * formula bar or cell inspector. `address` is the translated *data* address —
 * the correct target for `Grid.applyTransaction` even under an active
 * sort/filter view — while the `(row, col)` inputs of
 * {@link Grid.getCellInput} are active-sheet view coordinates.
 */
export interface CellInputSnapshot {
  /** Underlying data address, suitable for a `set` patch. */
  readonly address: CellAddress;
  /** Formula source when the cell is a formula, else the literal display text. */
  readonly text: string;
  /** Column input format, for `parseCellInput`. */
  readonly format: CellFormat;
}

export interface GridEvents {
  change: ChangeEvent;
  selection: { selection: Selection | null };
  scroll: { scrollTop: number; firstRow: number; lastRow: number };
  "edit-begin": { addr: CellAddress };
  "edit-commit": { addr: CellAddress; value: CellValue };
  search: SearchResult;
  /** Emitted after the visible sheet changes (direct call or cross-sheet scroll). */
  "active-sheet": { sheet: SheetId };
  /**
   * Emitted once when the worker renderer could not be constructed and the
   * grid fell back to the main-thread canvas renderer.
   */
  "renderer-fallback": { requested: "worker"; error: unknown };
}

export interface Grid {
  readonly store: Store;
  /** Imperative action surface for binding custom toolbars/menus. */
  readonly actions: GridActions;
  setActiveSheet(id: SheetId): void;
  scrollToCell(addr: CellAddress): void;
  /** Id of the currently visible sheet. */
  getActiveSheet(): SheetId;
  /**
   * Editable snapshot of the cell at a view position on the active sheet, or
   * null when out of bounds. See {@link CellInputSnapshot}.
   */
  getCellInput(row: number, col: number): CellInputSnapshot | null;
  getSelection(): Selection | null;
  setSelection(sel: Selection | null): void;
  /** Imperative patch: merge `theme` into the accumulated base theme. */
  setTheme(theme: Partial<Theme>): void;
  /**
   * Option-level replacement: re-run construction-time resolution
   * (`DEFAULT_THEME < CSS custom properties < theme`) with the new partial.
   * `undefined` restores the CSS-variable/default resolution. Adapters call
   * this for their declarative `theme` prop; imperative patching stays on
   * {@link setTheme}.
   */
  replaceTheme(theme: Partial<Theme> | undefined): void;
  /** The effective (post-zoom) theme the renderer is currently painting with. */
  getEffectiveTheme(): Theme;
  /** Update editability without replacing the Grid or clearing session state. */
  setReadOnly(readOnly: boolean): void;
  /**
   * Reconfigure built-in chrome and keyboard handling without replacing the
   * Grid or clearing selection/history. Construction-bound GridOptions are not
   * accepted here.
   */
  setConfig(config: GridConfig | undefined): void;
  /**
   * Apply arbitrary patches as one undoable Grid commit. No-op when read-only.
   * Use `Store.applyTransaction` only for low-level writes that intentionally
   * bypass Grid history and policy.
   */
  applyTransaction(transaction: GridTransaction): void;
  defineCellRenderer(name: string, renderer: CellRenderer): void;
  /** Column aggregate over the active sheet's data. */
  aggregate(col: number, op: AggregateOp): number;
  /** Sort the displayed rows by a column (does not mutate stored data). */
  sortBy(col: number, ascending?: boolean): void;
  /** Multi-key sort of the displayed rows (first key primary; stable). */
  sortByMulti(keys: readonly SortKey[]): void;
  /** Filter the displayed rows to those whose column text contains `needle`. */
  filterBy(col: number, needle: string): void;
  /**
   * Set or clear (null) one column's filter. All column filters AND together
   * and compose with the active sort and hidden rows.
   */
  setColumnFilter(col: number, filter: ColumnFilter | null): void;
  /** Active column filters on the active sheet, keyed by column index. */
  getColumnFilters(): ReadonlyMap<number, ColumnFilter>;
  /**
   * Distinct resolved values of a column (Rust scan), capped at `limit`
   * (default 1000) — the data source for a filter-by-values UI.
   */
  distinctValues(col: number, limit?: number): CellScalar[];
  /** Hide the given data rows (composes with filters/sort). */
  hideRows(rows: readonly number[]): void;
  /** Show the given data rows again, or every hidden row when omitted. */
  showRows(rows?: readonly number[]): void;
  /** Currently hidden data rows on the active sheet. */
  hiddenRows(): readonly number[];
  /** Define a collapsible row group over a data-row range (end-inclusive). */
  groupRows(start: number, end: number): void;
  /** Remove a row group (rows become visible if the group was collapsed). */
  ungroupRows(start: number, end: number): void;
  /** Collapse/expand a row group; collapsing hides its rows. */
  setGroupCollapsed(start: number, collapsed: boolean): void;
  /** Row groups on the active sheet. */
  rowGroups(): readonly RowGroup[];
  /** Clear any active sort/filter view. */
  clearView(): void;
  /** Undo the last recorded cell edit. */
  undo(): void;
  /** Redo the last undone cell edit. */
  redo(): void;
  exportCsv(filename: string): void;
  exportXlsx(filename: string): Promise<void>;
  /** Find cells matching `query`; highlights matches, emits `search`, returns the result. */
  search(query: string, opts?: SearchOptions): SearchResult;
  /** Move the active match to the next match and scroll it into view. */
  findNext(): SearchResult;
  /** Move the active match to the previous match and scroll it into view. */
  findPrev(): SearchResult;
  /** Clear the current search and its highlights. */
  clearSearch(): void;
  /**
   * Replace the active match with `replacement`, then advance to the next match
   * (re-scanning against the new data). Only literal text/number cells are
   * eligible; formula and ref cells are skipped (formula source is never
   * rewritten). Honors the active {@link SearchOptions} (matchCase; `wholeCell`
   * swaps the entire cell). The write flows through the grid's commit path as
   * one undoable step. No-op when read-only or when there is no active match.
   */
  replaceCurrent(replacement: string): SearchResult;
  /**
   * Replace every current match in a single undoable transaction (one
   * `undo()` restores them all), then re-scan. Formula/ref cells are skipped
   * and not counted. No-op when read-only.
   */
  replaceAll(replacement: string): ReplaceResult;
  insertRows(at: number, count?: number): void;
  removeRows(at: number, count?: number): void;
  insertColumns(at: number, count?: number): void;
  removeColumns(at: number, count?: number): void;
  /** Highlight arbitrary cell ranges (null clears). Per-range `color` wins over the call color. */
  highlightCells(ranges: readonly HighlightRange[] | null, color?: string): void;
  /**
   * Merge `style` into every cell of `range` (null clears cell styles) as one
   * undoable transaction. Styles land in the store and paint in the canvas —
   * unlike {@link highlightCells}, which draws a translucent overlay above it.
   */
  styleRange(range: Range, style: Partial<CellStyle> | null): void;
  /** Open the cell editor at a view cell, optionally seeding text / selecting all. */
  beginEdit(row: number, col: number, initial?: string, selectAll?: boolean): void;
  /**
   * Ctrl+Arrow-style jump target: the data-run edge from (row, col) on the
   * moved axis (row for vertical moves, col for horizontal), or null when the
   * store is not columnar. Under an active sort/filter view, `row` is a view
   * position and vertical moves return view positions. For hosts building
   * their own keymaps (`config.keyboard`).
   */
  dataEdge(row: number, col: number, dRow: number, dCol: number): number | null;
  /** Set one row's display height (view metadata; repaints immediately, not undoable). */
  setRowHeight(row: number, height: number): void;
  /** Set one column's width via an undoable `setColumn` patch. */
  setColumnWidth(col: number, width: number): void;
  /**
   * Pin the first `rows` view rows and `cols` columns; they stay visible while
   * the body scrolls (0 = unfreeze that axis). Persisted on the active sheet.
   */
  setFrozen(rows: number, cols?: number): void;
  /** Content zoom factor (0.5–2): scales row/column geometry and fonts. */
  setZoom(zoom: number): void;
  getZoom(): number;
  /**
   * Which renderer is actually active: `"worker"` when the OffscreenCanvas
   * worker constructed successfully, `"canvas"` otherwise (including after a
   * `renderer-fallback`).
   */
  rendererKind(): "canvas" | "worker";
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
  /** Merged cell regions in display-row space (empty under sort/filter). */
  merges?: ReadonlyArray<{ r0: number; c0: number; r1: number; c1: number }>;
}

export interface Viewport {
  scrollTop: number;
  scrollLeft: number;
  width: number;
  height: number;
  /** Content/layout/theme revision; unchanged for pure scroll. */
  contentRevision?: number;
  /**
   * Per-row geometry for the rows currently painted, aligned to the window's
   * row range (index 0 is the window's first row). Tops are in content space
   * (sheet coordinates, before subtracting `scrollTop`); heights are per row.
   * Present when row heights are non-uniform; when omitted the renderer falls
   * back to the uniform `Theme.rowHeight`.
   */
  rowTops?: Float64Array;
  rowHeights?: Float64Array;
}

/** One frozen-pane paint: a window plus the clip rect and scroll offsets it paints with. */
export interface PanePaint {
  view: VisibleWindowView;
  /** Viewport-space clip rectangle for this pane. */
  clip: { x: number; y: number; w: number; h: number };
  /** Vertical scroll offset this pane paints with (0 for pinned rows). */
  scrollTop: number;
  /** Horizontal scroll offset this pane paints with (0 for pinned columns). */
  scrollLeft: number;
  /** Per-pane row geometry (window-aligned), like Viewport.rowTops/rowHeights. */
  rowTops?: Float64Array;
  rowHeights?: Float64Array;
}

export interface Renderer {
  mount(host: HTMLElement, theme: Theme): void;
  setLayout(layout: RenderLayout): void;
  setViewport(viewport: Viewport): void;
  /** Paint a window. The renderer never touches the store. */
  paint(view: VisibleWindowView): void;
  /**
   * Paint one frame as clipped frozen panes (corner/top/left/body). Present on
   * the built-in renderers; the grid falls back to `paint` when absent or when
   * nothing is frozen. `divider` marks the freeze boundary lines to draw.
   */
  paintPanes?(panes: readonly PanePaint[], divider: { x: number | null; y: number | null }): void;
  setTheme(theme: Theme): void;
  setRenderers(renderers: ReadonlyMap<string, CellRenderer>): void;
  destroy(): void;
}
