import type { CellScalar, Grid, GridOptions } from "@sheetwrite/core";
import type {
  GridAdapterEventHandlers,
  GridSizeProps,
  SheetwriteInitializationProps,
  SimpleColumn,
} from "@sheetwrite/core/adapter";
import type { Snippet } from "svelte";
import type { HTMLAttributes } from "svelte/elements";

export interface SheetwriteGridProps
  extends Omit<HTMLAttributes<HTMLDivElement>, keyof GridAdapterEventHandlers | "children">,
    GridAdapterEventHandlers,
    SheetwriteInitializationProps {
  workbook: GridOptions["workbook"];
  data?: GridOptions["data"];
  datasource?: GridOptions["datasource"];
  datasourceStorage?: GridOptions["datasourceStorage"];
  renderer?: GridOptions["renderer"];
  workerUrl?: GridOptions["workerUrl"];
  theme?: GridOptions["theme"];
  readOnly?: GridOptions["readOnly"];
  protectionResolver?: GridOptions["protectionResolver"];
  mutationPolicy?: GridOptions["mutationPolicy"];
  renderers?: GridOptions["renderers"];
  overscan?: GridOptions["overscan"];
  minColumns?: GridOptions["minColumns"];
  config?: GridOptions["config"];
  height?: number | string;
  fill?: true;
  fallback?: Snippet;
  grid?: Grid;
}

export type SheetwriteProps<Row extends Record<string, CellScalar>> = Omit<
  SheetwriteGridProps,
  "workbook" | "data" | "datasource" | "height" | "fill"
> &
  GridSizeProps & {
    columns: readonly SimpleColumn<Row>[];
    defaultRows: readonly Row[];
    sheetName?: string;
  };
