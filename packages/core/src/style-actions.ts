import type { SelectionModel, SelRect } from "./selection.js";
import type { SheetwriteStore } from "./store.js";
import type { CellStyle, CellValue, Patch, Sheet, SheetId, Store, Theme } from "./types.js";

export interface StyleActionsDeps {
  store: Store;
  loadable: SheetwriteStore | null;
  selection: () => SelectionModel;
  activeSheet: () => SheetId;
  sheet: () => Sheet;
  readOnly: () => boolean;
  theme: () => Theme;
  merges: () => SelRect[];
  anchorCell: (row: number, col: number) => { row: number; col: number };
  toDataRow: (viewRow: number) => number;
  commit: (patches: Patch[]) => void;
}

/**
 * Implements selection-scoped formatting and merge commands for toolbar and
 * context-menu actions without owning the public action surface.
 */
export class StyleActions {
  private readonly deps: StyleActionsDeps;

  constructor(deps: StyleActionsDeps) {
    this.deps = deps;
  }

  toggleBorder(): void {
    const f = this.deps.selection().focusCell;
    const cell = f ? this.deps.anchorCell(f.row, f.col) : null;
    const has =
      cell !== null &&
      this.deps.store.getCell({
        sheet: this.deps.activeSheet(),
        row: this.deps.toDataRow(cell.row),
        col: cell.col,
      }).style.border !== undefined;

    this.applyStyle({
      border: has ? undefined : { all: { color: this.deps.theme().fg, width: 1 } },
    });
  }

  toggleStyle(prop: "bold" | "italic" | "underline" | "strikethrough"): void {
    const f = this.deps.selection().focusCell;
    const cell = f ? this.deps.anchorCell(f.row, f.col) : null;
    const on = cell
      ? this.deps.store.getCell({
          sheet: this.deps.activeSheet(),
          row: this.deps.toDataRow(cell.row),
          col: cell.col,
        }).style[prop]
      : false;
    this.applyStyle({ [prop]: !on });
  }

  /**
   * Re-set selected cells, preserving each value, with `patch` merged into the
   * style (cleared when `patch` is null).
   */
  applyStyle(patch: Partial<CellStyle> | null): void {
    const selection = this.deps.selection();
    if (this.deps.readOnly() || selection.isEmpty) return;

    const sheet = this.deps.sheet();
    const activeSheet = this.deps.activeSheet();
    const rects: SelRect[] = [];
    const seen = new Set<number>();
    selection.forEachRect((r) => rects.push(r));

    const patches: Patch[] = [];
    for (const rect of rects) {
      for (let r = rect.r0; r <= rect.r1; r++) {
        for (let c = rect.c0; c <= rect.c1; c++) {
          const cellRef = this.deps.anchorCell(r, c);
          const key = cellRef.row * sheet.columns.length + cellRef.col;
          if (seen.has(key)) continue;
          seen.add(key);

          const addr = {
            sheet: activeSheet,
            row: this.deps.toDataRow(cellRef.row),
            col: cellRef.col,
          };
          const formula = this.deps.loadable?.getFormula(addr) ?? null;
          const cell = this.deps.store.getCell(addr);
          const value: CellValue = formula
            ? { kind: "formula", src: formula }
            : { kind: "literal", value: cell.resolved };
          patches.push({
            op: "set",
            addr,
            value,
            style: patch ? { ...cell.style, ...patch } : undefined,
          });
        }
      }
    }
    this.deps.commit(patches);
  }

  mergeSelection(): void {
    if (this.deps.readOnly()) return;
    const activeSheet = this.deps.activeSheet();
    if (this.deps.loadable?.hasView(activeSheet)) return;

    const sel = this.deps.selection().toSelection(activeSheet);
    if (sel?.kind !== "range") return;
    const { start, end } = sel.range;
    const merge = {
      r0: Math.min(start.row, end.row),
      c0: Math.min(start.col, end.col),
      r1: Math.max(start.row, end.row),
      c1: Math.max(start.col, end.col),
    };
    if (merge.r0 === merge.r1 && merge.c0 === merge.c1) return;
    const sheet = this.deps.sheet();
    const frozenRows = sheet.frozenRows ?? 0;
    const frozenCols = sheet.frozenCols ?? 0;
    if (
      (merge.r0 < frozenRows && merge.r1 >= frozenRows) ||
      (merge.c0 < frozenCols && merge.c1 >= frozenCols) ||
      this.deps
        .merges()
        .some(
          (candidate) =>
            merge.r0 <= candidate.r1 &&
            candidate.r0 <= merge.r1 &&
            merge.c0 <= candidate.c1 &&
            candidate.c0 <= merge.c1,
        )
    ) {
      return;
    }

    const patches: Patch[] = [{ op: "addMerge", sheet: activeSheet, merge }];
    for (let row = merge.r0; row <= merge.r1; row++) {
      for (let col = merge.c0; col <= merge.c1; col++) {
        if (row === merge.r0 && col === merge.c0) continue;
        patches.push({
          op: "set",
          addr: { sheet: activeSheet, row: this.deps.toDataRow(row), col },
          value: { kind: "literal", value: null },
        });
      }
    }
    this.deps.commit(patches);
  }

  unmergeSelection(): void {
    if (this.deps.readOnly()) return;
    const f = this.deps.selection().focusCell;
    const list = this.deps.merges();
    if (!f || list.length === 0) return;
    const merge = list.find(
      (candidate) =>
        f.row >= candidate.r0 &&
        f.row <= candidate.r1 &&
        f.col >= candidate.c0 &&
        f.col <= candidate.c1,
    );
    if (!merge) return;
    this.deps.commit([{ op: "removeMerge", sheet: this.deps.activeSheet(), merge }]);
  }
}
