// ── Name box + formula bar ───────────────────────────────────────────────────
//
// Independent input factories for the two Sheets-style formula-row controls.
// Both subscribe only to public grid events, keep a focused-draft guard so
// asynchronous refreshes never clobber in-progress typing, and return focus to
// the grid after Enter/Escape through the caller-provided callback.

import { colToA1, labelToCol } from "../a1.js";
import type { CellInputSnapshot, Grid } from "../types/grid.js";
import { commitCellInput, selectionFocus } from "./grid-binding.js";

/** A mounted shell piece: its root element plus an idempotent teardown. */
export interface ShellPiece {
  readonly element: HTMLElement;
  destroy(): void;
}

/** Host elements and callbacks used to bind a name box to a Grid. */
export interface NameBoxOptions {
  /** Called after a successful Enter navigation so the grid regains focus. */
  focusGrid?: () => void;
  /** Accessible label (default "Cell reference"). */
  label?: string;
}

/**
 * A1 jump box: shows the focused cell's reference and navigates on Enter.
 * Invalid or out-of-bounds references set `aria-invalid` and make no grid
 * calls; Escape restores the displayed reference.
 */
export function createNameBox(
  host: HTMLElement,
  grid: Grid,
  options: NameBoxOptions = {},
): ShellPiece {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "sheetwrite-shell-namebox";
  input.setAttribute("aria-label", options.label ?? "Cell reference");
  input.autocomplete = "off";
  input.spellcheck = false;

  let committed = "";
  let dirty = false;

  const refresh = (): void => {
    if (document.activeElement === input && dirty) return;
    const focus = selectionFocus(grid.getSelection());
    committed = focus ? `${colToA1(focus.col)}${focus.row + 1}` : "";
    input.value = committed;
    input.removeAttribute("aria-invalid");
    dirty = false;
  };

  const jump = (): void => {
    const match = /^([A-Za-z]+)(\d+)$/.exec(input.value.trim());
    const sheetId = grid.getActiveSheet();
    const sheet = grid.store.getWorkbook().sheets.find((candidate) => candidate.id === sheetId);
    if (!match || !sheet) {
      input.setAttribute("aria-invalid", "true");
      return;
    }

    const col = labelToCol(match[1]!.toUpperCase());
    const row = Number(match[2]) - 1;
    if (col < 0 || col >= sheet.columns.length || row < 0 || row >= sheet.rowCount) {
      input.setAttribute("aria-invalid", "true");
      return;
    }

    const addr = { sheet: sheetId, row, col };
    grid.setSelection({ kind: "cell", addr });
    grid.scrollToCell(addr);
    dirty = false;
    input.removeAttribute("aria-invalid");
    options.focusGrid?.();
  };

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      jump();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      input.value = committed;
      input.removeAttribute("aria-invalid");
      dirty = false;
      options.focusGrid?.();
    } else {
      dirty = true;
      input.removeAttribute("aria-invalid");
    }
  };

  input.addEventListener("keydown", onKeydown);
  const unsubscribes = [grid.on("selection", refresh), grid.on("active-sheet", refresh)];
  refresh();
  host.appendChild(input);

  let destroyed = false;
  return {
    element: input,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const unsubscribe of unsubscribes) unsubscribe();
      input.removeEventListener("keydown", onKeydown);
      input.remove();
    },
  };
}

/** Host elements and callbacks used to bind a formula bar to a Grid. */
export interface FormulaBarOptions {
  /** Called after Enter commits or Escape cancels, so the grid regains focus. */
  focusGrid?: () => void;
  /** Accessible label (default "Formula bar"). */
  label?: string;
}

/** A formula bar piece; `setReadOnly` blocks commits without unmounting. */
export interface FormulaBarPiece extends ShellPiece {
  setReadOnly(readOnly: boolean): void;
}

/**
 * Detached formula bar: mirrors the focused cell's editable text (exact
 * formula source, else literal text) and commits on Enter through the grid's
 * undoable transaction path, targeting the data address captured with the
 * draft — correct even under an active sort/filter view. A focused, dirty
 * draft is never overwritten by selection/change events; Escape restores the
 * last stable text.
 */
export function createFormulaBar(
  host: HTMLElement,
  grid: Grid,
  options: FormulaBarOptions = {},
): FormulaBarPiece {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "sheetwrite-shell-formula";
  input.setAttribute("aria-label", options.label ?? "Formula bar");
  input.autocomplete = "off";
  input.spellcheck = false;

  let snapshot: CellInputSnapshot | null = null;
  let committed = "";
  let dirty = false;
  let readOnly = false;

  const refresh = (): void => {
    if (document.activeElement === input && dirty) return;
    const focus = selectionFocus(grid.getSelection());
    snapshot = focus ? grid.getCellInput(focus.row, focus.col) : null;
    committed = snapshot?.text ?? "";
    input.value = committed;
    dirty = false;
  };

  const commit = (): void => {
    if (readOnly || !snapshot) return;
    commitCellInput(grid, snapshot, input.value);
    dirty = false;
    options.focusGrid?.();
  };

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      input.value = committed;
      dirty = false;
      options.focusGrid?.();
    } else {
      dirty = true;
    }
  };

  input.addEventListener("keydown", onKeydown);
  const unsubscribes = [
    grid.on("selection", refresh),
    grid.on("change", refresh),
    grid.on("active-sheet", refresh),
  ];
  refresh();
  host.appendChild(input);

  let destroyed = false;
  return {
    element: input,
    setReadOnly(value: boolean) {
      readOnly = value;
      input.readOnly = value;
      if (value) {
        // A pending draft cannot commit anymore; restore the stable text.
        input.value = committed;
        dirty = false;
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const unsubscribe of unsubscribes) unsubscribe();
      input.removeEventListener("keydown", onKeydown);
      input.remove();
    },
  };
}
