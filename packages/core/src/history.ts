import type { CellAddress, Patch, SheetId } from "./types.js";

interface UndoEntry {
  undo: Patch[];
  redo: Patch[];
}

/**
 * Bounded undo/redo over cell transactions. Stores each edit as its inverse
 * (undo) and forward (redo) patch lists; the grid supplies both. Store-agnostic
 * except for address rebasing after structural row/column edits.
 */
export class UndoManager {
  private readonly undoStack: UndoEntry[] = [];
  private readonly redoStack: UndoEntry[] = [];

  constructor(private readonly limit = 200) {}

  /** Record an applied edit. A fresh edit clears the redo stack. */
  push(undo: Patch[], redo: Patch[]): void {
    if (undo.length === 0) return;

    this.undoStack.push({ undo, redo });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  /** Rebase stored patch addresses after a row insert/delete in data space. */
  rebaseRows(sheet: SheetId, at: number, delta: number): void {
    this.rebase((addr) => rebaseAddrRows(addr, sheet, at, delta));
  }

  /** Rebase stored patch addresses after a column insert/delete in data space. */
  rebaseCols(sheet: SheetId, at: number, delta: number): void {
    this.rebase((addr) => rebaseAddrCols(addr, sheet, at, delta));
  }

  /** Inverse patches to apply for an undo, or null when nothing is recorded. */
  undo(): Patch[] | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;

    this.redoStack.push(entry);
    return entry.undo;
  }

  /** Forward patches to re-apply for a redo, or null when nothing is undone. */
  redo(): Patch[] | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;

    this.undoStack.push(entry);
    return entry.redo;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  private rebase(mapAddr: (addr: CellAddress) => CellAddress | null): void {
    rebaseEntries(this.undoStack, mapAddr);
    rebaseEntries(this.redoStack, mapAddr);
  }
}

function rebaseEntries(entries: UndoEntry[], mapAddr: (addr: CellAddress) => CellAddress | null) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]!;
    entry.undo = rebasePatches(entry.undo, mapAddr);
    entry.redo = rebasePatches(entry.redo, mapAddr);
    if (entry.undo.length === 0 || entry.redo.length === 0) entries.splice(i, 1);
  }
}

function rebasePatches(patches: Patch[], mapAddr: (addr: CellAddress) => CellAddress | null) {
  const out: Patch[] = [];
  for (const patch of patches) {
    if (patch.op !== "set") {
      out.push(patch);
      continue;
    }

    const addr = mapAddr(patch.addr);
    if (addr) out.push({ ...patch, addr });
  }
  return out;
}

function rebaseAddrRows(
  addr: CellAddress,
  sheet: SheetId,
  at: number,
  delta: number,
): CellAddress | null {
  if (addr.sheet !== sheet || addr.row < at) return addr;
  if (delta >= 0) return { ...addr, row: addr.row + delta };

  const count = -delta;
  if (addr.row < at + count) return null;
  return { ...addr, row: addr.row - count };
}

function rebaseAddrCols(
  addr: CellAddress,
  sheet: SheetId,
  at: number,
  delta: number,
): CellAddress | null {
  if (addr.sheet !== sheet || addr.col < at) return addr;
  if (delta >= 0) return { ...addr, col: addr.col + delta };

  const count = -delta;
  if (addr.col < at + count) return null;
  return { ...addr, col: addr.col - count };
}
