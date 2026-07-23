// Cell value, style, format, and column contracts for @sheetwrite/core.
// No runtime values live here.

import type { CellAddress, Range } from "./coordinates.js";

/** Horizontal text alignment supported by cell styles. */
export type CellAlign = "left" | "center" | "right";

/** Visual border applied to one or more sides of a cell. */
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

/** Serializable formatting applied to a cell or used as a column default. */
export interface CellStyle {
  /** Uses the bold variant of the theme font. */
  bold?: boolean;
  /** Uses the italic variant of the theme font. */
  italic?: boolean;
  /** Draws a line beneath each rendered text run. */
  underline?: boolean;
  /** Draws a line through each rendered text run. */
  strikethrough?: boolean;
  /** Font size in unzoomed CSS pixels; zoom is applied during painting. */
  fontSize?: number;
  /** hex color, e.g. "#111111" */
  color?: string;
  /** hex color, e.g. "#ffffff" */
  backgroundColor?: string;
  /** Horizontal placement of cell text within its column. */
  align?: CellAlign;
  /** Wraps text within the cell width; row auto-fit accounts for the resulting line count. */
  wrap?: boolean;
  /** Border overrides for the cell's individual sides. */
  border?: CellBorders;
}

/** Browser-safe external target or stable workbook-internal range target. */
export type HyperlinkTarget =
  | { kind: "external"; url: string }
  | { kind: "internal"; range: Range };

/** Bounded serializable hyperlink metadata applied to one cell or range. */
export interface CellHyperlink {
  /** Stable identity used by operations, history, and collaboration rebase. */
  id: string;
  range: Range;
  target: HyperlinkTarget;
  /** Optional accessible/OOXML display label; cell values remain authoritative. */
  display?: string;
  /** Optional override merged over the deterministic blue/underline link style. */
  style?: CellStyle;
}

/** Predicate used to decide whether a conditional format applies. */
export type ConditionalFormatPredicate =
  | { kind: "greaterThan"; value: number }
  | { kind: "lessThan"; value: number }
  | { kind: "equal"; value: CellScalar }
  | { kind: "contains"; text: string; matchCase?: boolean }
  /** Boolean formula anchored at the rule range's top-left; relative A1 refs shift per cell. */
  | { kind: "formula"; source: string };

/** Ordered condition and style applied to a cell range. */
export interface ConditionalFormatRule {
  range: Range;
  when: ConditionalFormatPredicate;
  style: CellStyle;
  /** Stop evaluating lower-precedence rules for a cell when this rule matches. */
  stopIfTrue?: boolean;
}

/**
 * How a column's cells are typed, parsed, and rendered: `text` verbatim, `number`
 * via its `numberFormat`, `date` as an Excel-style serial (see `date-serial.ts`)
 * rendered by a date `numberFormat`, and `currency` as a plain number rendered by
 * a currency `numberFormat` (e.g. `$#,##0.00`).
 */
export type CellFormat = "text" | "number" | "date" | "currency";

/** A scalar that can be displayed directly. */
export type CellScalar = string | number | boolean | null;

/**
 * A cell's persisted input: a literal, a cross-reference, or a formula.
 * References resolve through the store's reference graph; formulas resolve in
 * the WASM calculation engine.
 */
export type CellValue =
  | { kind: "literal"; value: CellScalar }
  | { kind: "ref"; target: CellAddress }
  | { kind: "formula"; src: string };

/** Schema and default presentation for one workbook column. */
export interface Column {
  /** Non-empty key, unique within the sheet, used to map input and datasource values. */
  key: string;
  /** Schema label used by table exports and data-grid presentation headers. */
  header: string;
  /** Unzoomed column width in CSS pixels. */
  width: number;
  /** Controls cell input parsing and default value formatting for this column. */
  type: CellFormat;
  /** Excel number-format code, e.g. "#,##0.00" */
  numberFormat?: string;
  /** Explicit BCP 47 locale for separators; omitted keeps the deterministic default. */
  numberLocale?: string;
  /** Overrides theme styling for the painted column header. */
  headerStyle?: CellStyle;
  /** Base style merged beneath each cell's own style. */
  cellStyle?: CellStyle;
  /** Set to `false` to exclude the column from the live view and table exports. */
  visible?: boolean;
  /** Name of a registered custom cell renderer (see `Grid.defineCellRenderer`). */
  renderer?: string;
  /** Name of a registered custom editor (see `GridOptions.editors`). */
  editor?: string;
}
