import type { CellScalar, Grid, GridOptions } from "@sheetwrite/core";
import type {
  GridAdapterEventHandlers,
  GridSizeProps,
  SheetwriteInitializationProps,
  SimpleColumn,
} from "@sheetwrite/core/adapter";
import type { Snippet } from "svelte";
import type { HTMLAttributes } from "svelte/elements";

/** Advanced framework adapter props for workbook data or datasource ownership. */
export interface SheetwriteGridProps
  extends Omit<HTMLAttributes<HTMLDivElement>, keyof GridAdapterEventHandlers | "children">,
    GridAdapterEventHandlers,
    SheetwriteInitializationProps {
  /** Live workbook schema adopted by the Grid. */
  workbook: GridOptions["workbook"];
  /** Eager values for the active sheet. */
  data?: GridOptions["data"];
  /** Lazy visible-row provider. */
  datasource?: GridOptions["datasource"];
  /** Datasource storage policy. */
  datasourceStorage?: GridOptions["datasourceStorage"];
  /** Canvas or worker paint backend. */
  renderer?: GridOptions["renderer"];
  /** Browser-fetchable worker module URL. */
  workerUrl?: GridOptions["workerUrl"];
  /** Positional spreadsheet or semantic data-grid headers. */
  presentation?: GridOptions["presentation"];
  /** Live resolved-theme overrides. */
  theme?: GridOptions["theme"];
  /** Disables mutations, not navigation. */
  readOnly?: GridOptions["readOnly"];
  /** Client protected-range check. */
  protectionResolver?: GridOptions["protectionResolver"];
  /** Atomic or partial denial policy. */
  mutationPolicy?: GridOptions["mutationPolicy"];
  /** Overrides inclusive operation-count and encoded-byte ceilings for every atomic mutation. */
  transactionResourceLimits?: GridOptions["transactionResourceLimits"];
  /** Controls link activation: emit an event, also navigate internally, or disable it. */
  hyperlinkActivation?: GridOptions["hyperlinkActivation"];
  /** Named custom cell renderers. */
  renderers?: GridOptions["renderers"];
  /** Named custom cell editors. */
  editors?: GridOptions["editors"];
  /** Extra rows painted around the viewport. */
  overscan?: GridOptions["overscan"];
  /** Minimum column count with padding. */
  minColumns?: GridOptions["minColumns"];
  /** Built-in UI control configuration. */
  config?: GridOptions["config"];
  /** Host height as pixels or a CSS length. */
  height?: number | string;
  /** Fills the parent's available size. */
  fill?: true;
  /** Content shown until initialization succeeds. */
  fallback?: Snippet;
  /** Bindable live Grid, cleared on reset or unmount. */
  grid?: Grid;
}

/** Simple framework adapter props for columns and default row objects. */
export type SheetwriteProps<Row extends Record<string, CellScalar>> = Omit<
  SheetwriteGridProps,
  "workbook" | "data" | "datasource" | "height" | "fill"
> &
  GridSizeProps & {
    /** Ordered schema for the owned sheet. */
    columns: readonly SimpleColumn<Row>[];
    /** Initial rows; missing column keys become `null`. */
    defaultRows: readonly Row[];
    /** Sheet name; defaults to `Sheet 1`. */
    sheetName?: string;
  };
