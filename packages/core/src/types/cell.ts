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

/** Predicate used to decide whether a conditional format applies. */
export type ConditionalFormatPredicate =
  | { kind: "greaterThan"; value: number }
  | { kind: "lessThan"; value: number }
  | { kind: "equal"; value: CellScalar }
  | { kind: "contains"; text: string; matchCase?: boolean };

/** Ordered condition and style applied to a cell range. */
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
  key: string;
  header: string;
  width: number;
  type: CellFormat;
  /** Excel number-format code, e.g. "#,##0.00" */
  numberFormat?: string;
  /** Explicit BCP 47 locale for separators; omitted keeps the deterministic default. */
  numberLocale?: string;
  headerStyle?: CellStyle;
  cellStyle?: CellStyle;
  visible?: boolean;
  /** Name of a registered custom cell renderer (see `Grid.defineCellRenderer`). */
  renderer?: string;
}
