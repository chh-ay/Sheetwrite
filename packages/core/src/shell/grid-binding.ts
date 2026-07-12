// ── Shell ↔ Grid adaptation layer ────────────────────────────────────────────
//
// The single shell file allowed to consolidate how shell chrome reads and
// writes grid state. Everything here goes through the public `Grid` contract —
// never `Store` internals, never private grid DOM. If a public name changes,
// this file (and only this file) absorbs it.

import { parseCellInput } from "../cell-input.js";
import type { CellInputSnapshot, Grid, Selection } from "../types.js";

/** The focused cell of a selection in view coordinates, or null. */
export function selectionFocus(selection: Selection | null): { row: number; col: number } | null {
  if (!selection) return null;
  if (selection.kind === "cell") return { row: selection.addr.row, col: selection.addr.col };
  if (selection.kind === "range") {
    return { row: selection.range.start.row, col: selection.range.start.col };
  }
  return null;
}

/**
 * Commit raw formula-bar text to the cell a snapshot was captured for. The
 * snapshot's data address (not the current selection) is the target, so a
 * selection change during editing can never retarget the write. Flows through
 * the grid's undoable commit path and read-only policy.
 */
export function commitCellInput(grid: Grid, snapshot: CellInputSnapshot, raw: string): void {
  const value = parseCellInput(raw, snapshot.format);
  grid.applyTransaction({
    patches: [{ op: "set", addr: snapshot.address, value }],
  });
}
