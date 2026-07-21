import type { CellAddress, Range, SheetId } from "./types/coordinates.js";
import type { DocumentOp } from "./types/document.js";

export type HistoryPart =
  | { kind: "patches"; patches: DocumentOp[] }
  | {
      kind: "rangeSnapshot";
      range: Range;
      toPatch: (range: Range) => Extract<DocumentOp, { op: "setBlock" }>;
      dispose: () => void;
    };

export type HistoryAction = HistoryPart[];

interface UndoEntry {
  undo: HistoryAction;
  redo: DocumentOp[];
}

/** Retains recent transaction-level undo resources without allowing unbounded history growth. */
const DEFAULT_HISTORY_LIMIT = 200;

/**
 * Bounded undo/redo over document transactions. Destructive bulk edits may
 * retain opaque store-local range resources, which are materialized into a
 * serializable `setBlock` only when undo executes.
 */
export class UndoManager {
  private readonly undoStack: UndoEntry[] = [];
  private readonly redoStack: UndoEntry[] = [];

  constructor(private readonly limit = DEFAULT_HISTORY_LIMIT) {}

  /** Record an applied edit. A fresh edit disposes the discarded redo stack. */
  push(undo: HistoryAction, redo: DocumentOp[]): void {
    if (undo.length === 0) return;

    this.undoStack.push({ undo, redo });
    if (this.undoStack.length > this.limit) disposeEntry(this.undoStack.shift()!);
    for (const entry of this.redoStack) disposeEntry(entry);
    this.redoStack.length = 0;
  }

  /** Rebase stored addresses after a row insert/delete in data space. */
  rebaseRows(sheet: SheetId, at: number, delta: number): void {
    this.rebase((addr) => rebaseAddrRows(addr, sheet, at, delta));
  }

  /** Rebase stored addresses after a column insert/delete in data space. */
  rebaseCols(sheet: SheetId, at: number, delta: number): void {
    this.rebase((addr) => rebaseAddrCols(addr, sheet, at, delta));
  }

  undo(): HistoryAction | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;

    this.redoStack.push(entry);
    return entry.undo;
  }

  /** Restore the most recently moved undo entry after its transaction was rejected. */
  restoreUndo(): void {
    const entry = this.redoStack.pop();
    if (entry) this.undoStack.push(entry);
  }

  redo(): HistoryAction | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;

    this.undoStack.push(entry);
    return [{ kind: "patches", patches: entry.redo }];
  }

  /** Restore the most recently moved redo entry after its transaction was rejected. */
  restoreRedo(): void {
    const entry = this.undoStack.pop();
    if (entry) this.redoStack.push(entry);
  }

  clear(): void {
    for (const entry of this.undoStack) disposeEntry(entry);
    for (const entry of this.redoStack) disposeEntry(entry);
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

export function materializeHistoryAction(action: HistoryAction): DocumentOp[] {
  const patches: DocumentOp[] = [];
  for (const part of action) {
    if (part.kind === "patches") patches.push(...part.patches);
    else patches.push(part.toPatch(part.range));
  }
  return patches;
}

function disposeEntry(entry: UndoEntry): void {
  for (const part of entry.undo) {
    if (part.kind === "rangeSnapshot") part.dispose();
  }
}

function rebaseEntries(
  entries: UndoEntry[],
  mapAddr: (addr: CellAddress) => CellAddress | null,
): void {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]!;
    const undo: HistoryAction = [];
    for (const part of entry.undo) {
      if (part.kind === "patches") {
        const patches = rebasePatches(part.patches, mapAddr);
        if (patches.length > 0) undo.push({ kind: "patches", patches });
        continue;
      }
      const start = mapAddr({ sheet: part.range.sheet, ...part.range.start });
      const end = mapAddr({ sheet: part.range.sheet, ...part.range.end });
      if (start && end && start.sheet === end.sheet) {
        part.range = {
          sheet: start.sheet,
          start: { row: start.row, col: start.col },
          end: { row: end.row, col: end.col },
        };
        undo.push(part);
      } else {
        part.dispose();
      }
    }
    entry.undo = undo;
    entry.redo = rebasePatches(entry.redo, mapAddr);
    if (entry.undo.length === 0 || entry.redo.length === 0) {
      disposeEntry(entry);
      entries.splice(i, 1);
    }
  }
}

function rebasePatches(
  patches: DocumentOp[],
  mapAddr: (addr: CellAddress) => CellAddress | null,
): DocumentOp[] {
  const out: DocumentOp[] = [];
  for (const patch of patches) {
    if (patch.op === "set") {
      const addr = mapAddr(patch.addr);
      if (addr) out.push({ ...patch, addr });
      continue;
    }
    if (
      patch.op === "setRange" ||
      patch.op === "setBlock" ||
      patch.op === "setRangeStyle" ||
      patch.op === "clearRange"
    ) {
      const start = mapAddr({ sheet: patch.range.sheet, ...patch.range.start });
      const end = mapAddr({ sheet: patch.range.sheet, ...patch.range.end });
      if (start && end && start.sheet === end.sheet) {
        out.push({
          ...patch,
          range: {
            sheet: start.sheet,
            start: { row: start.row, col: start.col },
            end: { row: end.row, col: end.col },
          },
        });
      }
      continue;
    }
    out.push(patch);
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
