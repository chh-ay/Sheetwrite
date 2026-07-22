// ── Selection status readout ─────────────────────────────────────────────────
//
// Geometry-only, allocation-free status line. It never enumerates selected
// cells, never reads the store, and runs constant-time work per selection
// event — safe next to any selection size.

import type { Selection } from "../types/coordinates.js";
import type { Grid } from "../types/grid.js";
import type { ShellPiece } from "./formula-controls.js";

/** Human phrase for a selection's geometry; blank for null/single-cell. */
export function describeSelection(selection: Selection | null): string {
  if (!selection || selection.kind === "cell") return "";

  if (selection.kind === "range") {
    const rows = Math.abs(selection.range.end.row - selection.range.start.row) + 1;
    const cols = Math.abs(selection.range.end.col - selection.range.start.col) + 1;
    if (rows === 1 && cols === 1) return "";
    return `${rows} × ${cols} cells`;
  }

  if (selection.kind === "row") return `Row ${selection.row + 1}`;
  if (selection.kind === "column") return `Column ${selection.col + 1}`;
  return `${selection.ranges.length} ranges`;
}

/**
 * `<output role="status">` that follows the grid's selection. Text nodes only;
 * polite live region so screen readers announce changes without interrupting.
 */
export function createSelectionStatus(host: HTMLElement, grid: Grid): ShellPiece {
  const output = document.createElement("output");
  output.className = "sheetwrite-shell-status";
  output.setAttribute("role", "status");
  output.setAttribute("aria-live", "polite");

  const render = (selection: Selection | null): void => {
    const description = describeSelection(selection);
    output.textContent = description;
    output.hidden = description === "";
    host.hidden = output.hidden && host.childElementCount === 1;
  };
  const unsubscribe = grid.on("selection", (event) => render(event.selection));
  host.appendChild(output);
  render(grid.getSelection());

  let destroyed = false;
  return {
    element: output,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      output.remove();
    },
  };
}
