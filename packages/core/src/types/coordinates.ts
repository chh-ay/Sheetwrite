// Coordinate, range, selection, and presence contracts for @sheetwrite/core.
// No runtime values live here.

export type SheetId = string;

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

export type Selection =
  | { kind: "cell"; addr: CellAddress }
  | { kind: "range"; range: Range }
  | { kind: "row"; sheet: SheetId; row: number }
  | { kind: "column"; sheet: SheetId; col: number }
  | { kind: "multi"; ranges: Range[] };
