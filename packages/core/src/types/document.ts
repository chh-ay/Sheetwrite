// Workbook, view, validation, protection, snapshot, and operation contracts.
// No runtime values live here.

import type { CellScalar, CellStyle, CellValue, Column, ConditionalFormatRule } from "./cell.js";
import type { CellAddress, MergeRange, Range, SheetId } from "./coordinates.js";

export interface Sheet {
  id: SheetId;
  name: string;
  columns: Column[];
  /** Row count for both in-memory and datasource-backed sheets. */
  rowCount: number;
  /** Sparse per-row height overrides; default comes from the theme. */
  rowHeights?: Map<number, number>;
  /** Persisted hidden data rows; runtime form is sparse and non-JSON. */
  hiddenRows?: Set<number>;
  /** Persisted collapsible row groups. */
  rowGroups?: RowGroup[];
  /** Conditional styles folded into the bulk render-window style dictionary. */
  conditionalFormats?: ConditionalFormatRule[];
  /** Serializable data-entry rules evaluated at the local mutation barrier. */
  validationRules?: DataValidationRule[];
  /** Client-side protected-range policy metadata; never server authorization. */
  protectedRanges?: ProtectedRange[];
  /** Simple cell notes. Discussion threads live outside the document model. */
  notes?: CellNote[];
  /** Persisted sort keys for the sheet's view. */
  sortKeys?: SortKey[];
  /** Persisted column filters as JSON-safe index/value tuples. */
  filters?: Array<[col: number, filter: ColumnFilter]>;
  /** Persisted merged-cell regions; covered cells render/export from the anchor. */
  merges?: MergeRange[];
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
  namedRanges?: NamedRangeSnapshot[];
}

export interface AddSheetInput {
  id?: SheetId;
  name: string;
  rowCount?: number;
  columns?: Column[];
}

/** Workbook-global or sheet-scoped named range used by formulas and persistence. */
export interface NamedRangeSnapshot {
  name: string;
  /** Formula-context sheet whose local definition shadows the workbook definition. */
  scope?: SheetId;
  range: Range;
}
export type ValidationPolicy = "reject" | "warn" | "allow";

export type DataValidationCondition =
  | { kind: "list"; values: readonly CellScalar[]; allowCustom?: boolean }
  | { kind: "number"; min?: number; max?: number }
  | { kind: "date"; min?: number; max?: number }
  | { kind: "textLength"; min?: number; max?: number }
  | {
      kind: "checkbox";
      checkedValue?: CellScalar;
      uncheckedValue?: CellScalar;
    };

/** One stable, range-scoped data-entry rule. Blank cells are allowed unless disabled. */
export interface DataValidationRule {
  id: string;
  range: Range;
  condition: DataValidationCondition;
  policy: ValidationPolicy;
  allowBlank?: boolean;
  helpText?: string;
}

/** Serializable client UX policy. A host resolver decides whether a local mutation may proceed. */
export interface ProtectedRange {
  id: string;
  range: Range;
  label?: string;
  permissionKey?: string;
}

export interface CellNote {
  addr: CellAddress;
  text: string;
}

export type MutationPolicyMode = "atomic" | "partial";

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

export interface ProtectionRequest {
  protectedRange: Readonly<ProtectedRange>;
  operation: Readonly<DocumentOp>;
  commitReason: CommitReason;
}

export type ProtectionResolver = (request: ProtectionRequest) => "allow" | "deny";

export type MutationIssue =
  | {
      kind: "validation";
      severity: "error" | "warning";
      ruleId: string;
      addr: CellAddress;
      value: CellValue;
      message: string;
      operationIndex: number;
    }
  | {
      kind: "protection";
      severity: "error";
      protectedRangeId: string;
      range: Range;
      operationIndex: number;
      message: string;
    };

export interface RowMetadata {
  height?: number;
  hidden?: boolean;
}

export interface SnapshotCell {
  rowOffset: number;
  colOffset: number;
  value: CellValue;
  style?: CellStyle;
}
/**
 * Dense row-major mutation payload. Primitive arrays keep large paste/fill
 * operations JSON-safe without allocating one operation object per cell.
 * Formula/reference tuples are sparse exceptions keyed by row-major offset.
 */
export interface PackedCellBlock {
  rowCount: number;
  colCount: number;
  values: CellScalar[];
  formulas?: Array<[offset: number, source: string]>;
  refs?: Array<[offset: number, target: CellAddress]>;
  styleTable?: CellStyle[];
  styleIds?: number[];
}

/** Sparse row-major cells bounded by one rectangular block. */
export interface CellBlock {
  startRow: number;
  startCol: number;
  rowCount: number;
  colCount: number;
  cells: SnapshotCell[];
}

export interface SheetSnapshot {
  id: SheetId;
  name: string;
  order: number;
  rowCount: number;
  /** Keys are stable, unique document column identities as well as datasource keys. */
  columns: Column[];
  frozenRows?: number;
  frozenCols?: number;
  rowMeta?: Array<[row: number, meta: RowMetadata]>;
  merges?: MergeRange[];
  conditionalFormats?: ConditionalFormatRule[];
  validationRules?: DataValidationRule[];
  protectedRanges?: ProtectedRange[];
  notes?: CellNote[];
  sortKeys?: SortKey[];
  filters?: Array<[col: number, filter: ColumnFilter]>;
  rowGroups?: RowGroup[];
  cells: CellBlock[];
}

export interface WorkbookSnapshot {
  schemaVersion: 1;
  documentId?: string;
  version?: number;
  workbook: {
    activeSheet: SheetId;
    namedRanges?: NamedRangeSnapshot[];
  };
  sheets: SheetSnapshot[];
}

export type DocumentOp =
  | { op: "set"; addr: CellAddress; value: CellValue; style?: CellStyle }
  | { op: "setRange"; range: Range; cells: SnapshotCell[] }
  | { op: "setBlock"; range: Range; block: PackedCellBlock }
  | { op: "setRangeStyle"; range: Range; style: Partial<CellStyle> | null }
  | { op: "clearRange"; range: Range; contents?: boolean; style?: boolean }
  | { op: "addRows"; sheet: SheetId; at: number; count: number }
  | { op: "removeRows"; sheet: SheetId; at: number; count: number }
  | { op: "moveRows"; sheet: SheetId; from: number; count: number; to: number }
  | { op: "addColumns"; sheet: SheetId; at: number; columns: Column[] }
  | { op: "removeColumns"; sheet: SheetId; at: number; count: number }
  | { op: "moveColumns"; sheet: SheetId; from: number; count: number; to: number }
  | { op: "setColumn"; sheet: SheetId; col: number; patch: Partial<Column> }
  | { op: "setRowMeta"; sheet: SheetId; row: number; meta: RowMetadata | null }
  | { op: "addMerge"; sheet: SheetId; merge: MergeRange }
  | { op: "removeMerge"; sheet: SheetId; merge: MergeRange }
  | { op: "addSheet"; sheet: SheetSnapshot }
  | { op: "removeSheet"; sheet: SheetId }
  | { op: "renameSheet"; sheet: SheetId; name: string }
  | { op: "moveSheet"; sheet: SheetId; to: number }
  | {
      op: "setSheetMeta";
      sheet: SheetId;
      patch: {
        frozenRows?: number;
        frozenCols?: number;
        conditionalFormats?: ConditionalFormatRule[];
        rowGroups?: RowGroup[];
        sortKeys?: SortKey[];
        filters?: Array<[col: number, filter: ColumnFilter]>;
      };
    }
  | { op: "setValidationRule"; sheet: SheetId; rule: DataValidationRule }
  | { op: "removeValidationRule"; sheet: SheetId; id: string }
  | { op: "setProtectedRange"; sheet: SheetId; protectedRange: ProtectedRange }
  | { op: "removeProtectedRange"; sheet: SheetId; id: string }
  | { op: "setNote"; addr: CellAddress; text: string | null }
  | { op: "setNamedRange"; namedRange: NamedRangeSnapshot }
  | { op: "removeNamedRange"; name: string; scope?: SheetId };
