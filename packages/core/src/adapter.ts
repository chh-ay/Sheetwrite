import type { SheetwriteError } from "./errors.js";

export {
  isSheetwriteError,
  SHEETWRITE_ERROR_CODES,
  SHEETWRITE_ERROR_OPERATIONS,
  SheetwriteError,
  type SheetwriteErrorCode,
  type SheetwriteErrorContext,
  type SheetwriteErrorEnvelope,
  type SheetwriteErrorOperation,
} from "./errors.js";

import type {
  CellFormat,
  CellScalar,
  CellStyle,
  ChangeEvent,
  ColumnarData,
  Grid,
  GridEvents,
  GridOptions,
  Selection,
  Workbook,
} from "./types.js";

export {
  createGridController,
  type GridController,
  type GridControllerHandlers,
} from "./grid-controller.js";

import type { GridController } from "./grid-controller.js";

/** Classification of adapter options as live-updatable or reset-sensitive. */
export const GRID_OPTION_POLICY = {
  workbook: "reset",
  data: "reset",
  datasource: "reset",
  datasourceStorage: "reset",
  renderer: "reset",
  workerUrl: "reset",
  presentation: "reset",
  renderers: "reset",
  editors: "reset",
  protectionResolver: "reset",
  mutationPolicy: "reset",
  transactionResourceLimits: "reset",
  theme: "live",
  readOnly: "live",
  config: "live",
  overscan: "live",
  minColumns: "live",
} as const satisfies Record<keyof GridOptions, "reset" | "live">;

/** Reset-sensitive input change that requires an adapter to replace its Grid. */
export type GridResetReason = "input-reset" | "renderer-reset";
/** Reason an adapter published a ready Grid generation. */
export type GridReadyReason = "initial" | GridResetReason;

/** Grid handle, generation, and reason published after adapter initialization. */
export interface GridReadyEvent {
  /** Live handle just published by the adapter; replaced on the next reset generation. */
  grid: Grid;
  /** One-based adapter generation, incremented whenever a Grid is replaced. */
  generation: number;
  /** Whether readiness followed first initialization, an input reset, or a renderer reset. */
  reason: GridReadyReason;
}

/** Framework-neutral readiness, change, and error callbacks shared by adapters. */
export interface GridAdapterEventHandlers {
  /** Receives every committed Grid change, including its applied transaction. */
  onGridChange?: (event: ChangeEvent) => void;
  /** Receives the current selection, or `null` after it is cleared. */
  onSelectionChange?: (selection: Selection | null) => void;
  /** Receives visible row bounds and vertical scroll offset after scrolling. */
  onViewportChange?: (event: GridEvents["scroll"]) => void;
  /** Fires when cell editing begins. */
  onEditBegin?: (event: GridEvents["edit-begin"]) => void;
  /** Fires after an edit commits its parsed cell value. */
  onEditCommit?: (event: GridEvents["edit-commit"]) => void;
  /** Receives refreshed search matches and active-match index. */
  onSearch?: (result: GridEvents["search"]) => void;
  /** Fires after the visible sheet changes. */
  onActiveSheetChange?: (event: GridEvents["active-sheet"]) => void;
  /** Receives observable undo/redo and formatting command state. */
  onCommandStateChange?: (event: GridEvents["command-state-change"]) => void;
  /** Receives structured issues when a Grid mutation is rejected. */
  onMutationRejected?: (event: GridEvents["mutation-rejected"]) => void;
  /** Fires when worker rendering falls back to the main-thread canvas renderer. */
  onRendererFallback?: (event: GridEvents["renderer-fallback"]) => void;
  /** Receives failed datasource requests and their errors. */
  onDatasourceError?: (event: GridEvents["datasource-error"]) => void;
  /** Receives failures from built-in XLSX export actions. */
  onExportError?: (event: GridEvents["export-error"]) => void;
  /** Fires after the adapter publishes a ready Grid generation. */
  onReady?: (event: GridReadyEvent) => void;
  /** Receives a WASM initialization failure while the adapter remains mounted. */
  onInitializationError?: (error: SheetwriteError) => void;
}

/** Optional explicit WASM source and initialization error callback for adapters. */
export interface SheetwriteInitializationProps {
  /** Explicit source passed to process-wide WASM initialization; concurrent initialization is first-source-wins. */
  wasmSource?: BufferSource | URL | string | Request | WebAssembly.Module;
  /** Called when WASM initialization fails while the adapter is mounted. */
  onInitializationError?: (error: SheetwriteError) => void;
}

/** Explicit width and height accepted by framework adapters. */
export type GridSizeProps =
  | {
      /** Host height in CSS pixels for numbers or any CSS length string. */
      height: number | string;
      /** Mutually exclusive with an explicit `height`. */
      fill?: never;
    }
  | {
      /** Fills the parent's available width and height. */
      fill: true;
      /** Mutually exclusive with `fill`. */
      height?: never;
    };

/** Optional width and height accepted by advanced framework adapters. */
export interface OptionalGridSizeProps {
  height?: number | string;
  fill?: true;
}

/** Converts adapter size props into a host element style object. */
export function gridSizeStyle(size: OptionalGridSizeProps): Record<string, string> {
  if (size.fill) return { width: "100%", height: "100%", minHeight: "0" };
  if (size.height !== undefined) {
    return {
      width: "100%",
      height: typeof size.height === "number" ? `${size.height}px` : size.height,
    };
  }
  return {};
}

const GRID_OPTION_KEYS = Object.keys(GRID_OPTION_POLICY) as Array<keyof GridOptions>;

/** Extracts advanced GridOptions from framework adapter props. */
export function extractGridOptions(source: Record<string, unknown>): GridOptions {
  const options: Partial<GridOptions> = {};
  for (const key of GRID_OPTION_KEYS) {
    if (key in source) Object.assign(options, { [key]: source[key] });
  }
  return options as GridOptions;
}

/** Returns the first reset-sensitive adapter input that changed, if any. */
export function getGridResetReason(
  previous: GridOptions,
  next: GridOptions,
): GridResetReason | null {
  for (const key of GRID_OPTION_KEYS) {
    if (GRID_OPTION_POLICY[key] !== "reset" || previous[key] === next[key]) continue;
    return key === "renderer" || key === "workerUrl" || key === "renderers"
      ? "renderer-reset"
      : "input-reset";
  }
  return null;
}

/** Applies live-updatable adapter option changes to an existing Grid. */
export function applyChangedLiveGridOptions(
  controller: GridController,
  previous: GridOptions,
  next: GridOptions,
): void {
  if (previous.theme !== next.theme) controller.setTheme(next.theme);
  if (previous.readOnly !== next.readOnly) controller.setReadOnly(next.readOnly ?? false);
  if (previous.config !== next.config) controller.setConfig(next.config);
  if (previous.overscan !== next.overscan) controller.setOverscan(next.overscan);
  if (previous.minColumns !== next.minColumns) controller.setMinColumns(next.minColumns);
}

/** Default pixel width assigned to simple adapter columns. */
export const DEFAULT_SIMPLE_COLUMN_WIDTH = 120;

/** Column definition accepted by the adapters’ simple row-object API. */
export interface SimpleColumn<Row extends Record<string, CellScalar>> {
  /** Non-empty row-object key, unique within the column list. */
  key: keyof Row & string;
  /** Semantic title painted in data-grid mode and written by table exports. */
  title: string;
  /** Unzoomed width in CSS pixels; defaults to 120. */
  width?: number;
  /** Input and formatting type; defaults to `text`. */
  type?: CellFormat;
  /** Excel number-format code used for number, date, or currency display. */
  numberFormat?: string;
  /** Style applied to the painted column header. */
  headerStyle?: CellStyle;
  /** Name of a custom editor registered through `GridOptions.editors`. */
  editor?: string;
  /** Base style merged beneath cell-specific styles. */
  cellStyle?: CellStyle;
  /** Set to `false` to exclude the column from the live view and table exports. */
  visible?: boolean;
}

/** Framework-neutral simple columns, rows, sizing, and grid options. */
export interface SimpleSheetwriteOptions<Row extends Record<string, CellScalar>> {
  columns: readonly SimpleColumn<Row>[];
  defaultRows: readonly Row[];
  sheetName?: string;
}

/** Normalized workbook and columnar data produced from simple adapter props. */
export interface SimpleGridInput {
  workbook: Workbook;
  data: ColumnarData;
  /** Simple row-object input always opts into semantic data-grid presentation. */
  presentation: "data-grid";
}

/** Converts simple columns and row objects into canonical workbook and columnar input. */
export function createSimpleGridInput<Row extends Record<string, CellScalar>>(
  options: SimpleSheetwriteOptions<Row>,
): SimpleGridInput {
  const keys = new Set<string>();
  const columns = options.columns.map((column) => {
    if (!column.key) throw new Error("Sheetwrite: every simple column requires a non-empty key");
    if (!column.title) throw new Error("Sheetwrite: every simple column requires a title");
    if (keys.has(column.key)) {
      throw new Error(`Sheetwrite: duplicate simple column key "${column.key}"`);
    }
    keys.add(column.key);
    return {
      key: column.key,
      header: column.title,
      width: column.width ?? DEFAULT_SIMPLE_COLUMN_WIDTH,
      type: column.type ?? "text",
      numberFormat: column.numberFormat,
      headerStyle: column.headerStyle,
      cellStyle: column.cellStyle,
      editor: column.editor,
      visible: column.visible,
    };
  });

  const dataColumns: Record<string, CellScalar[]> = Object.fromEntries(
    columns.map((column) => [column.key, new Array<CellScalar>(options.defaultRows.length)]),
  );
  for (let rowIndex = 0; rowIndex < options.defaultRows.length; rowIndex += 1) {
    const row = options.defaultRows[rowIndex]!;
    for (const column of columns) dataColumns[column.key]![rowIndex] = row[column.key] ?? null;
  }

  const sheetId = "sheet1";
  return {
    workbook: {
      activeSheet: sheetId,
      sheets: [
        {
          id: sheetId,
          name: options.sheetName ?? "Sheet 1",
          columns,
          rowCount: options.defaultRows.length,
        },
      ],
    },
    data: { rowCount: options.defaultRows.length, columns: dataColumns },
    presentation: "data-grid",
  };
}
