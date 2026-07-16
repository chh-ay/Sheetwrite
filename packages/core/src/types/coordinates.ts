// Coordinate, range, selection, and presence contracts for @sheetwrite/core.
// No runtime values live here.

/** Stable identifier used to address a workbook sheet. */
export type SheetId = string;

/** Zero-based address of one cell on a stable sheet ID. */
export interface CellAddress {
  sheet: SheetId;
  row: number;
  col: number;
}

/** Inclusive merged-cell rectangle in data-row/column coordinates. */
export interface MergeRange {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

/** Inclusive rectangular cell range on a stable sheet ID. */
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

/**
 * Ephemeral collaborator selection rendered above the grid. Presence never
 * enters document operations, snapshots, dirty state, or undo history.
 */
export interface PresenceOverlay {
  actorId: string;
  displayName?: string;
  color: string;
  activeSheet: SheetId;
  ranges: readonly Range[];
}

/** Current cell, range, row, column, or multi-range selection. */
export type Selection =
  | {
      /** Selects one addressed cell. */
      kind: "cell";
      /** Zero-based data address of the selected cell. */
      addr: CellAddress;
    }
  | {
      /** Selects one inclusive rectangular range. */
      kind: "range";
      /** Data-space bounds of the selected rectangle. */
      range: Range;
    }
  | {
      /** Selects an entire data row. */
      kind: "row";
      /** Stable ID of the containing sheet. */
      sheet: SheetId;
      /** Zero-based data-row index. */
      row: number;
    }
  | {
      /** Selects an entire column. */
      kind: "column";
      /** Stable ID of the containing sheet. */
      sheet: SheetId;
      /** Zero-based column index. */
      col: number;
    }
  | {
      /** Selects multiple, potentially disjoint rectangles. */
      kind: "multi";
      /** Data-space rectangles comprising the selection. */
      ranges: Range[];
    };
