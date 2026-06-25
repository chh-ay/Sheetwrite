import { parseCellInput } from "./cell-input";
import { neutralizeInjection, parseTsv, toTsv } from "./clipboard";
import type { SelectionModel, SelRect } from "./selection";
import type { CellScalar, Patch, Sheet, SheetId, Store } from "./types";

export interface ClipboardControllerDeps {
  store: Store;
  selection: () => SelectionModel;
  activeSheet: () => SheetId;
  sheet: () => Sheet;
  colIndices: () => number[];
  readOnly: () => boolean;
  mergeAnchorAt: (row: number, col: number) => SelRect | null;
  toDataRow: (viewRow: number) => number;
  clearSelection: () => void;
  commit: (patches: Patch[]) => void;
}

/**
 * Translates between the current selection and TSV clipboard payloads, preserving
 * the grid's view-row mapping and paste injection neutralization.
 */
export class ClipboardController {
  private readonly deps: ClipboardControllerDeps;

  constructor(deps: ClipboardControllerDeps) {
    this.deps = deps;
  }

  copy(): void {
    const m = this.selectionMatrix();
    if (!m || !navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(toTsv(m.values));
  }

  cut(): void {
    const m = this.selectionMatrix();
    if (!m || !navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(toTsv(m.values));
    this.deps.clearSelection();
  }

  async paste(): Promise<void> {
    if (this.deps.readOnly()) return;
    const focus = this.deps.selection().focusCell;
    if (!focus || !navigator.clipboard?.readText) return;

    const text = await navigator.clipboard.readText();
    const grid = parseTsv(text);
    if (grid.length === 0) return;

    const sheet = this.deps.sheet();
    const activeSheet = this.deps.activeSheet();
    const colIndices = this.deps.colIndices();
    const startPos = colIndices.indexOf(focus.col);
    const patches: Patch[] = [];
    for (let r = 0; r < grid.length; r++) {
      const line = grid[r]!;
      for (let c = 0; c < line.length; c++) {
        const targetRow = focus.row + r;
        const targetCol = colIndices[startPos + c];
        if (targetRow >= sheet.rowCount || targetCol === undefined) continue;
        const value = parseCellInput(
          neutralizeInjection(line[c]!),
          sheet.columns[targetCol]?.type ?? "text",
        );
        patches.push({
          op: "set",
          addr: { sheet: activeSheet, row: this.deps.toDataRow(targetRow), col: targetCol },
          value,
        });
      }
    }
    this.deps.commit(patches);
  }

  private selectionMatrix(): { rect: SelRect; values: CellScalar[][] } | null {
    const focus = this.deps.selection().focusCell;
    if (!focus) return null;
    const rects: SelRect[] = [];
    this.deps.selection().forEachRect((r) => rects.push(r));
    const rect = rects.find(
      (r) => r.r0 <= focus.row && focus.row <= r.r1 && r.c0 <= focus.col && focus.col <= r.c1,
    );
    if (!rect) return null;

    const activeSheet = this.deps.activeSheet();
    const values: CellScalar[][] = [];
    for (let r = rect.r0; r <= rect.r1; r++) {
      const line: CellScalar[] = [];
      for (let c = rect.c0; c <= rect.c1; c++) {
        const merge = this.deps.mergeAnchorAt(r, c);
        if (merge && (merge.r0 !== r || merge.c0 !== c)) {
          line.push(null);
          continue;
        }

        line.push(
          this.deps.store.getCell({ sheet: activeSheet, row: this.deps.toDataRow(r), col: c })
            .resolved,
        );
      }
      values.push(line);
    }
    return { rect, values };
  }
}
