import type { Range } from "./coordinates.js";

/** Stable identity for a workbook table. Names may change; IDs never do. */
export type WorkbookTableId = string;

/** Stable identity and display metadata for one ordered table column. */
export interface WorkbookTableColumn {
  id: string;
  /** Case-insensitively unique within the table. */
  name: string;
  /** Optional text written in the totals row. Formula cells remain authoritative cell sources. */
  totalsRowLabel?: string;
}

/** Bounded native subset of ECMA-376 table style information. */
export interface WorkbookTableStyle {
  name?: string;
  showFirstColumn?: boolean;
  showLastColumn?: boolean;
  showRowStripes?: boolean;
  showColumnStripes?: boolean;
}

/**
 * OOXML table features deliberately retained as explicit loss metadata rather
 * than silently flattened into an ordinary range.
 */
export type WorkbookTableUnsupportedFeature =
  | "auto-filter"
  | "sort-state"
  | "calculated-columns"
  | "totals-functions"
  | "query-table"
  | "external-data"
  | "extensions";

/** Serializable canonical workbook table. Its range includes header/totals rows. */
export interface WorkbookTable {
  id: WorkbookTableId;
  /** Workbook-global, case-insensitively unique structured-reference name. */
  name: string;
  /** Inclusive table rectangle on one stable sheet ID. */
  range: Range;
  /** Ordered stable columns; length is exactly the table rectangle width. */
  columns: WorkbookTableColumn[];
  /** Whether the first range row is the structured-reference header row. */
  headerRow: boolean;
  /** Whether the last range row is the structured-reference totals row. */
  totalsRow: boolean;
  style?: WorkbookTableStyle;
  unsupportedFeatures?: WorkbookTableUnsupportedFeature[];
}

/** Mutable table fields accepted by the explicit update operation. */
export interface WorkbookTablePatch {
  name?: string;
  range?: Range;
  columns?: WorkbookTableColumn[];
  headerRow?: boolean;
  totalsRow?: boolean;
  style?: WorkbookTableStyle | null;
  unsupportedFeatures?: WorkbookTableUnsupportedFeature[];
}
