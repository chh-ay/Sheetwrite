import type { Patch } from "./types";

interface UndoEntry {
  undo: Patch[];
  redo: Patch[];
}

/**
 * Bounded undo/redo over cell transactions. Stores each edit as its inverse
 * (undo) and forward (redo) patch lists; the grid supplies both. Store-agnostic.
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
}
