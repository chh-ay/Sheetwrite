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

export const GRID_OPTION_POLICY = {
  workbook: "reset",
  data: "reset",
  datasource: "reset",
  renderer: "reset",
  workerUrl: "reset",
  renderers: "reset",
  theme: "live",
  readOnly: "live",
  config: "live",
  overscan: "live",
  minColumns: "live",
} as const satisfies Record<keyof GridOptions, "reset" | "live">;

export type GridResetReason = "input-reset" | "renderer-reset";
export type GridReadyReason = "initial" | GridResetReason;

export interface GridReadyEvent {
  grid: Grid;
  generation: number;
  reason: GridReadyReason;
}

export interface GridAdapterEventHandlers {
  onGridChange?: (event: ChangeEvent) => void;
  onSelectionChange?: (selection: Selection | null) => void;
  onViewportChange?: (event: GridEvents["scroll"]) => void;
  onEditBegin?: (event: GridEvents["edit-begin"]) => void;
  onEditCommit?: (event: GridEvents["edit-commit"]) => void;
  onSearch?: (result: GridEvents["search"]) => void;
  onActiveSheetChange?: (event: GridEvents["active-sheet"]) => void;
  onReady?: (event: GridReadyEvent) => void;
  onInitializationError?: (error: unknown) => void;
}

export interface SheetwriteInitializationProps {
  wasmSource?: BufferSource | URL | string | Request | WebAssembly.Module;
  onInitializationError?: (error: unknown) => void;
}

export type GridSizeProps =
  | { height: number | string; fill?: never }
  | { fill: true; height?: never };

export interface OptionalGridSizeProps {
  height?: number | string;
  fill?: true;
}

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

export function extractGridOptions(source: Record<string, unknown>): GridOptions {
  const options: Partial<GridOptions> = {};
  for (const key of GRID_OPTION_KEYS) {
    if (key in source) Object.assign(options, { [key]: source[key] });
  }
  return options as GridOptions;
}

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

export const DEFAULT_SIMPLE_COLUMN_WIDTH = 120;

export interface SimpleColumn<Row extends Record<string, CellScalar>> {
  key: keyof Row & string;
  title: string;
  width?: number;
  type?: CellFormat;
  numberFormat?: string;
  headerStyle?: CellStyle;
  cellStyle?: CellStyle;
  visible?: boolean;
}

export interface SimpleSheetwriteOptions<Row extends Record<string, CellScalar>> {
  columns: readonly SimpleColumn<Row>[];
  defaultRows: readonly Row[];
  sheetName?: string;
}

export interface SimpleGridInput {
  workbook: Workbook;
  data: ColumnarData;
}

export function createSimpleGridInput<Row extends Record<string, CellScalar>>(
  options: SimpleSheetwriteOptions<Row>,
): SimpleGridInput {
  const keys = new Set<string>();
  const columns = options.columns.map((column) => {
    if (!column.key) throw new Error("Sheetwrite: every simple column requires a non-empty key");
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
  };
}
