// Grid configuration, events, actions, search, and imperative API contracts.
// No runtime values live here.

import type {
  CellAlign,
  CellFormat,
  CellScalar,
  CellStyle,
  CellValue,
  ConditionalFormatRule,
} from "./cell.js";
import type {
  CellAddress,
  HighlightRange,
  PresenceOverlay,
  Range,
  Selection,
  SheetId,
} from "./coordinates.js";
import type {
  AggregateOp,
  ColumnarData,
  DataSource,
  DataSourceRequest,
  DataSourceStorageOptions,
} from "./data.js";
import type {
  AddSheetInput,
  ColumnFilter,
  DataValidationRule,
  DocumentOp,
  MutationIssue,
  MutationPolicyMode,
  ProtectedRange,
  ProtectionResolver,
  RowGroup,
  SortKey,
  Workbook,
  WorkbookSnapshot,
} from "./document.js";
import type { CellEditor } from "./editor.js";
import type { CellRenderer, Theme } from "./render.js";
import type { Store } from "./store.js";
import type {
  ApplyTransactionResult,
  ChangeEvent,
  GridTransaction,
  RemoteOperationOptions,
  TransactionResourceLimits,
} from "./transaction.js";

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

/** Header semantics used by the retained canvas and accessibility mirror. */
export type GridPresentation = "spreadsheet" | "data-grid";

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
  hideRows(rows?: readonly number[]): void;
  showRows(rows?: readonly number[]): void;
  autoFitRows(): void;
  hideColumns(cols?: readonly number[]): void;
  showColumns(cols?: readonly number[]): void;
  autoFitColumns(cols?: readonly number[]): void;
  clearFilter(col?: number): void;
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

/** Built-in action names accepted by custom toolbar items. */
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

/** Built-in command names accepted by state queries and change events. */
export type GridCommandName = Exclude<ToolbarActionName, "separator">;

/** Observable availability and selection-derived activity for one command. */
export interface GridCommandState {
  readonly disabled: boolean;
  readonly activity: "inactive" | "active" | "mixed";
}

/** Complete command-state snapshot emitted whenever availability or activity can change. */
export interface GridCommandStateChangeEvent {
  readonly states: Readonly<Record<GridCommandName, GridCommandState>>;
}

/** Text, DOM node, or node factory used as toolbar icon content. */
export type ToolbarIcon = string | Node | (() => Node);

/** Built-in, separator, or custom callback item in the grid toolbar. */
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

/** Built-in action names accepted by custom context-menu rows. */
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
  | "hideRow"
  | "showAllRows"
  | "autoFitRow"
  | "hideColumn"
  | "showAllColumns"
  | "autoFitColumn"
  | "clearFilter"
  | "exportCsv"
  | "exportXlsx"
  | "separator";

/** Cell and viewport coordinates resolved for one bundled context-menu opening. */
export interface ContextMenuContext {
  /** Right-clicked cell, or null when the pointer is outside the cell body. */
  readonly cell: CellAddress | null;
  /** Viewport-relative browser pointer coordinate. */
  readonly clientX: number;
  /** Viewport-relative browser pointer coordinate. */
  readonly clientY: number;
}

/** Built-in, separator, or custom callback row in the right-click menu. */
export interface ContextMenuItem {
  /** Stable host identifier, exposed as `data-context-menu-item`. */
  id?: string;
  /** Built-in action to bind (or "separator"). Omit when supplying `onClick`. */
  action?: ContextMenuActionName;
  /** Custom click handler; receives the grid and the right-clicked cell (null if none). */
  onClick?: (grid: Grid, cell: CellAddress | null) => void;
  /** Menu row text. Defaults per action. */
  label?: string;
  /** Optional shortcut hint rendered beside the label. */
  shortcut?: string;
  /** Static or request-aware visibility. Hidden separators are normalized. */
  visible?: boolean | ((context: ContextMenuContext) => boolean);
  /** Static or context-aware disabled state. */
  disabled?: boolean | ((context: ContextMenuContext) => boolean);
}

/** Static rows or a context-aware factory evaluated each time the menu opens. */
export type ContextMenuItems =
  | readonly ContextMenuItem[]
  | ((context: ContextMenuContext) => readonly ContextMenuItem[]);

/**
 * Toolbar / feature configuration. When `config` is set the built-in toolbar is
 * shown; control flags default to `true` except the opt-in `export` flag.
 */
export interface GridConfig {
  /** Show the built-in toolbar (true), hide it (false), or supply a custom item list. */
  toolbar?: boolean | ToolbarItem[];
  /** Show the bold control in the default toolbar (default true). */
  bold?: boolean;
  /** Show the italic control in the default toolbar (default true). */
  italic?: boolean;
  /** Show left, center, and right alignment controls (default true). */
  align?: boolean;
  /** Show the text-color control in the default toolbar (default true). */
  textColor?: boolean;
  /** Show the fill-color control in the default toolbar (default true). */
  fillColor?: boolean;
  /** Show the border control in the default toolbar (default true). */
  border?: boolean;
  /** Show the clear-format control in the default toolbar (default true). */
  clearFormat?: boolean;
  /** Show merge and unmerge controls in the default toolbar (default true). */
  merge?: boolean;
  /** Show ascending and descending sort controls in the default toolbar (default true). */
  sort?: boolean;
  /** Show CSV/XLSX export controls in the default toolbar (default false). */
  export?: boolean;
  /** Override built-in toolbar icons by action name. Strings render as plain text; DOM nodes/factories support SVG/HTML icons. */
  icons?: Partial<Record<ToolbarActionName, ToolbarIcon>>;
  /** Built-in menu, disabled menu, static rows, or a request-aware row factory. */
  contextMenu?: boolean | ContextMenuItems;
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

/** Workbook, data, rendering, policy, and built-in UI options used to create a Grid. */
export interface GridOptions {
  /** Live workbook schema adopted by the store and updated by document operations. */
  workbook: Workbook;
  /** Eager column-major values loaded into `workbook.activeSheet`; use instead of `datasource`. */
  data?: ColumnarData;
  /** Lazy row provider requested for visible windows; use instead of eager `data`. */
  datasource?: DataSource;
  /** Allocation and cache policy for datasource-backed cell storage. */
  datasourceStorage?: DataSourceStorageOptions;
  /** Paint backend; defaults to main-thread `canvas` and falls back there if a worker fails. */
  renderer?: "canvas" | "worker";
  /**
   * URL of the worker renderer module (`renderer: "worker"`), as served to the
   * BROWSER — the platform `Worker` constructor does not consult package
   * exports, so a bare specifier like `new URL("@sheetwrite/core/worker",
   * import.meta.url)` is NOT reliable. Either copy
   * `@sheetwrite/core/dist/worker.js` to your public assets and pass its URL
   * string (works everywhere), or use your bundler's dependency-worker import
   * if it has one (see `/docs/guides/worker-rendering/`). If omitted or the worker
   * can't be constructed, the grid falls back to the main-thread canvas
   * renderer and emits `renderer-fallback` once.
   */
  workerUrl?: string | URL;
  /**
   * Header presentation. Spreadsheet mode (default) paints positional A/B/C
   * labels; data-grid mode paints each column's semantic `header`. Cell
   * addressing, row indices, clipboard values, formulas, and exports are
   * unchanged in both modes.
   */
  presentation?: GridPresentation;
  /** Overrides merged over the default theme and host CSS custom properties. */
  theme?: Partial<Theme>;
  /** Disables mutating interactions while preserving navigation and selection. */
  readOnly?: boolean;
  /**
   * Host-owned client UX permission check. Servers must independently authorize
   * every submitted operation; this resolver is not an authentication boundary.
   */
  protectionResolver?: ProtectionResolver;
  /** Atomic rejects the transaction; partial skips denied operation objects. */
  mutationPolicy?: MutationPolicyMode;
  /** Overrides inclusive operation-count and encoded-byte ceilings for every atomic mutation. */
  transactionResourceLimits?: Partial<TransactionResourceLimits>;
  /** Custom cell renderers registered up front; also see `Grid.defineCellRenderer`. */
  renderers?: Record<string, CellRenderer>;
  /** Named custom editors resolved from each column's `editor` field. */
  editors?: Record<string, CellEditor>;
  /**
   * Extra row and visible-column positions painted on each viewport edge.
   * Defaults to 6; use 0 to disable the buffer.
   */
  overscan?: number;
  /** Render at least this many columns (empty padding columns past the data, like a spreadsheet). */
  minColumns?: number;
  /** Built-in UI controls; providing an object enables the toolbar unless `toolbar` is false. */
  config?: GridConfig;
}

/** Case, whole-cell, sheet, and column constraints for grid search. */
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

/** Ordered matches and active index produced by a grid search. */
export interface SearchResult {
  /** Query string retained for navigation and subsequent replacement. */
  query: string;
  /** Matching cells in row-major order. */
  matches: CellAddress[];
  /** Index of the active match within `matches`, or -1 when there are none. */
  active: number;
}

/** Replacement count and refreshed search state returned by replace-all. */
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

/** Payload map for events emitted by a Grid. */
export interface GridEvents {
  change: ChangeEvent;
  selection: { selection: Selection | null };
  scroll: { scrollTop: number; firstRow: number; lastRow: number };
  "edit-begin": { addr: CellAddress };
  "edit-commit": { addr: CellAddress; value: CellValue };
  search: SearchResult;
  /** Command availability or formatting activity changed. */
  "command-state-change": GridCommandStateChangeEvent;
  "mutation-rejected": { issues: MutationIssue[] };
  /** Emitted after the visible sheet changes (direct call or cross-sheet scroll). */
  "active-sheet": { sheet: SheetId };
  /**
   * Emitted once when the worker renderer could not be constructed and the
   * grid fell back to the main-thread canvas renderer.
   */
  "renderer-fallback": { requested: "worker"; error: unknown };
  "datasource-error": { request: Omit<DataSourceRequest, "signal">; error: unknown };
  /** Built-in toolbar/context-menu export failed after its action was dispatched. */
  "export-error": { format: "xlsx"; error: unknown };
}

/** Imperative grid handle for document commands, events, rendering, and teardown. */
export interface Grid {
  readonly store: Store;
  /** Imperative action surface for binding custom toolbars/menus. */
  readonly actions: GridActions;
  /** Query undo/redo availability and formatting active/mixed/disabled state. */
  getCommandState(command: GridCommandName): GridCommandState;
  setActiveSheet(id: SheetId): void;
  scrollToCell(addr: CellAddress): void;
  /**
   * Resolve browser viewport coordinates to an active-sheet cell for host-owned
   * menus and interactions. Returns null outside the cell body.
   */
  getCellAtPoint(clientX: number, clientY: number): CellAddress | null;
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
  applyTransaction(transaction: GridTransaction): ApplyTransactionResult;
  /** Deterministically export the complete authoritative workbook document. */
  exportSnapshot(): WorkbookSnapshot;
  /**
   * Apply host-supplied operations without undo history or outgoing dirty state.
   * The resulting change event has `source: "remote"`.
   */
  applyRemoteOperations(
    operations: readonly DocumentOp[],
    options?: RemoteOperationOptions,
  ): ApplyTransactionResult;
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
  /** Persisted multi-key sort of the active sheet. */
  setSort(keys: readonly SortKey[]): ApplyTransactionResult;
  /** Active column filters on the active sheet, keyed by column index. */
  getColumnFilters(): ReadonlyMap<number, ColumnFilter>;
  /**
   * Distinct resolved values of a column in first-seen order. Defaults to
   * 1,000 values for bounded filter menus; pass 0 to request an uncapped scan.
   */
  distinctValues(col: number, limit?: number): CellScalar[];
  /** Hide the given data rows (composes with filters/sort). */
  hideRows(rows: readonly number[]): void;
  /** Show the given data rows again, or every hidden row when omitted. */
  showRows(rows?: readonly number[]): void;
  /** Currently hidden data rows on the active sheet. */
  hiddenRows(): readonly number[];
  /** Hide columns through one bulk-safe metadata transaction. */
  hideColumns(cols?: readonly number[]): void;
  /** Show columns through one bulk-safe metadata transaction. */
  showColumns(cols?: readonly number[]): void;
  /** Currently hidden columns on the active sheet. */
  hiddenColumns(): readonly number[];
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
  /** Add a sheet with a stable ID and make it available to the tab bar. */
  addSheet(input: AddSheetInput): SheetId;
  /** Remove a sheet; at least one sheet always remains. */
  removeSheet(id: SheetId): void;
  renameSheet(id: SheetId, name: string): void;
  moveSheet(id: SheetId, toIndex: number): void;
  setConditionalFormats(rules: readonly ConditionalFormatRule[]): void;
  setValidationRule(rule: DataValidationRule): ApplyTransactionResult;
  removeValidationRule(id: string): ApplyTransactionResult;
  setProtectedRange(protectedRange: ProtectedRange): ApplyTransactionResult;
  removeProtectedRange(id: string): ApplyTransactionResult;
  setProtectionResolver(resolver: ProtectionResolver | undefined, mode?: MutationPolicyMode): void;
  setNote(addr: CellAddress, text: string | null): ApplyTransactionResult;
  getNote(addr: CellAddress): string | null;
  /**
   * Live-update the render window overscan (row/column positions painted past
   * each edge); `undefined` restores the default of 6.
   */
  setOverscan(overscan?: number): void;
  /**
   * Live-update the minimum rendered column count. Increasing the minimum
   * silently extends presentation padding; `undefined` restores the default.
   */
  setMinColumns(minColumns?: number): void;
  /** Highlight arbitrary cell ranges (null clears). Per-range `color` wins over the call color. */
  highlightCells(ranges: readonly HighlightRange[] | null, color?: string): void;
  /** Replace ephemeral remote-presence overlays; null clears every collaborator. */
  setPresenceOverlays(overlays: readonly PresenceOverlay[] | null): void;
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
  /** Set one row's persistent display height through document history. */
  setRowHeight(row: number, height: number): void;
  /** Set one column's width via an undoable `setColumn` patch. */
  setColumnWidth(col: number, width: number): void;
  /** Explicitly resize rows to fit wrapped content; never runs during paint. */
  autoFitRows(range?: Range): void;
  /** Explicitly resize columns from a bulk worksheet read. */
  autoFitColumns(cols?: readonly number[]): void;
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
