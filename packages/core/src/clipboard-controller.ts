import { shiftA1Refs } from "./a1.js";
import { parseCellInput } from "./cell-input.js";
import {
  type ClipboardCell,
  type ClipboardSnapshot,
  neutralizeInjection,
  parseTsv,
  toTsv,
} from "./clipboard.js";
import type { CellRef, SelectionModel, SelRect } from "./selection.js";
import type { CellScalar, CellStyle, CellValue, Patch, Sheet, SheetId, Store } from "./types.js";

export interface ClipboardControllerDeps {
  store: Store;
  selection: () => SelectionModel;
  activeSheet: () => SheetId;
  sheet: () => Sheet;
  colIndices: () => number[];
  readOnly: () => boolean;
  mergeAnchorAt: (row: number, col: number) => SelRect | null;
  toDataRow: (viewRow: number) => number;
  commit: (patches: Patch[]) => void;
}

/** What a single paste target cell should become, or `null` to skip it. */
interface CellWrite {
  value: CellValue;
  style?: CellStyle;
}

interface CapturedClipboard extends ClipboardSnapshot {
  /** Exact source addresses captured before an asynchronous cut writes the clipboard. */
  clearPatches: Patch[];
}

/** Re-anchor a copied value's relative A1 refs by (dRow, dCol); literals pass through. */
function shiftValue(value: CellValue, dRow: number, dCol: number): CellValue {
  if (value.kind === "formula") {
    return { kind: "formula", src: shiftA1Refs(value.src, dRow, dCol) };
  }
  return value;
}

/**
 * Translates between the current selection and clipboard payloads. Copy/cut write
 * TSV to the system clipboard (external interop, unchanged) and additionally keep
 * an internal snapshot: when paste sees that same TSV back it restores the rich
 * payload — formulas re-anchored, styles carried — Google-Sheets style; otherwise
 * it parses the external TSV as neutralized literals. Preserves the grid's
 * view-row mapping and paste injection neutralization throughout.
 */
export class ClipboardController {
  private readonly deps: ClipboardControllerDeps;

  /** The last copy/cut payload, matched against the system clipboard on paste. */
  private snapshot: ClipboardSnapshot | null = null;

  constructor(deps: ClipboardControllerDeps) {
    this.deps = deps;
  }

  copy(): void {
    const snapshot = this.capture(false);
    if (!snapshot || !navigator.clipboard?.writeText) return;
    this.snapshot = snapshot;
    void navigator.clipboard.writeText(snapshot.tsv);
  }

  async cut(): Promise<void> {
    const snapshot = this.capture(true);
    if (!snapshot || !navigator.clipboard?.writeText) return;

    try {
      await navigator.clipboard.writeText(snapshot.tsv);
    } catch {
      return;
    }

    if (this.deps.readOnly()) return;

    this.snapshot = snapshot;
    this.deps.commit(snapshot.clearPatches);
  }

  /**
   * Paste at the focus cell. Restores the internal snapshot's rich payload when
   * the system clipboard still holds its TSV (copy re-anchors formulas, cut keeps
   * them verbatim; styles carried either way); otherwise parses external TSV as
   * neutralized literals.
   */
  async paste(): Promise<void> {
    await this.pasteFrom(false);
  }

  /**
   * Like {@link paste} but writes only resolved literals — never formulas or
   * styles. For external text this is identical to {@link paste}.
   */
  async pasteValues(): Promise<void> {
    await this.pasteFrom(true);
  }

  private async pasteFrom(valuesOnly: boolean): Promise<void> {
    if (this.deps.readOnly()) return;
    const focus = this.deps.selection().focusCell;
    if (!focus || !navigator.clipboard?.readText) return;

    const text = await navigator.clipboard.readText();
    const snapshot = this.snapshot;
    if (snapshot && text === snapshot.tsv) {
      this.pasteInternal(snapshot, focus, valuesOnly);
      return;
    }
    this.pasteExternal(text, focus);
  }

  // ── Rich paste ─────────────────────────────────────────────────────────────

  private pasteInternal(snapshot: ClipboardSnapshot, focus: CellRef, valuesOnly: boolean): void {
    // Copy shifts every relative ref by the block's rigid displacement; cut does
    // not shift (and clears its source at cut time).
    const dRow = snapshot.cut ? 0 : this.deps.toDataRow(focus.row) - snapshot.anchor.row;
    const dCol = snapshot.cut ? 0 : focus.col - snapshot.anchor.col;

    this.commitBlock(
      focus,
      snapshot.cells.length,
      (r) => snapshot.cells[r]!.length,
      (r, c): CellWrite => {
        const cell = snapshot.cells[r]![c]!;
        if (valuesOnly) return { value: { kind: "literal", value: cell.resolved } };
        return { value: shiftValue(cell.value, dRow, dCol), style: cell.style };
      },
    );
  }

  // ── External TSV paste ───────────────────────────────────────────────────────

  private pasteExternal(text: string, focus: CellRef): void {
    const grid = parseTsv(text);
    if (grid.length === 0) return;
    const sheet = this.deps.sheet();

    this.commitBlock(
      focus,
      grid.length,
      (r) => grid[r]!.length,
      (r, c, targetCol): CellWrite => ({
        value: parseCellInput(
          neutralizeInjection(grid[r]![c]!),
          sheet.columns[targetCol]?.type ?? "text",
        ),
      }),
    );
  }

  // ── Shared plumbing ──────────────────────────────────────────────────────────

  /**
   * Walk a `height`×`widthAt(r)` block anchored at `focus`, resolving each cell to
   * a `set` patch via `cellAt`. Honors the view-row mapping, the visible-column
   * order, the row limit, and merge-anchor skipping, then commits one transaction.
   */
  private commitBlock(
    focus: CellRef,
    height: number,
    widthAt: (r: number) => number,
    cellAt: (r: number, c: number, targetCol: number) => CellWrite | null,
  ): void {
    const activeSheet = this.deps.activeSheet();
    const rowLimit = this.deps.store.viewRowCount(activeSheet);
    const colIndices = this.deps.colIndices();
    const startPos = colIndices.indexOf(focus.col);
    if (startPos < 0) return;

    const patches: Patch[] = [];
    for (let r = 0; r < height; r++) {
      const width = widthAt(r);
      for (let c = 0; c < width; c++) {
        const targetRow = focus.row + r;
        const targetCol = colIndices[startPos + c];
        if (targetRow >= rowLimit || targetCol === undefined) continue;

        const merge = this.deps.mergeAnchorAt(targetRow, targetCol);
        if (merge && (merge.r0 !== targetRow || merge.c0 !== targetCol)) continue;

        const write = cellAt(r, c, targetCol);
        if (!write) continue;
        patches.push({
          op: "set",
          addr: { sheet: activeSheet, row: this.deps.toDataRow(targetRow), col: targetCol },
          value: write.value,
          style: write.style,
        });
      }
    }
    this.deps.commit(patches);
  }

  /**
   * Snapshot the focused selection rectangle into a {@link ClipboardSnapshot}:
   * per-cell value (formula src preserved, else literal), resolved scalar, and
   * style, plus the source anchor and the TSV those resolved scalars produce.
   * Returns `null` when there is no focused rectangle.
   */
  private capture(cut: boolean): CapturedClipboard | null {
    const focus = this.deps.selection().focusCell;
    if (!focus) return null;
    const rects: SelRect[] = [];
    this.deps.selection().forEachRect((r) => rects.push(r));
    const rect = rects.find(
      (r) => r.r0 <= focus.row && focus.row <= r.r1 && r.c0 <= focus.col && focus.col <= r.c1,
    );
    if (!rect) return null;

    const activeSheet = this.deps.activeSheet();
    const cells: ClipboardCell[][] = [];
    const values: CellScalar[][] = [];
    const clearPatches: Patch[] = [];
    for (let r = rect.r0; r <= rect.r1; r++) {
      const cellLine: ClipboardCell[] = [];
      const valueLine: CellScalar[] = [];
      for (let c = rect.c0; c <= rect.c1; c++) {
        const merge = this.deps.mergeAnchorAt(r, c);
        if (merge && (merge.r0 !== r || merge.c0 !== c)) {
          cellLine.push({ value: { kind: "literal", value: null }, resolved: null, style: {} });
          valueLine.push(null);
          continue;
        }

        const addr = { sheet: activeSheet, row: this.deps.toDataRow(r), col: c };
        const cell = this.deps.store.getCell(addr);
        const formula = this.deps.store.getFormula(addr);
        const value: CellValue = formula
          ? { kind: "formula", src: formula }
          : { kind: "literal", value: cell.resolved };

        cellLine.push({ value, resolved: cell.resolved, style: cell.style });
        valueLine.push(cell.resolved);
        clearPatches.push({
          op: "set",
          addr,
          value: { kind: "literal", value: null },
        });
      }
      cells.push(cellLine);
      values.push(valueLine);
    }

    const anchor = { row: this.deps.toDataRow(rect.r0), col: rect.c0 };
    return { anchor, cells, tsv: toTsv(values), cut, clearPatches };
  }
}
