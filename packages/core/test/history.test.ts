import { describe, expect, it } from "bun:test";
import { type HistoryAction, UndoManager } from "../src/history.js";
import type { DocumentOp } from "../src/types/document.js";

const setOperation: DocumentOp = {
  op: "set",
  addr: { sheet: "sheet", row: 0, col: 0 },
  value: { kind: "literal", value: "next" },
};
const undoAction: HistoryAction = [
  {
    kind: "patches",
    patches: [
      {
        op: "set",
        addr: { sheet: "sheet", row: 0, col: 0 },
        value: { kind: "literal", value: "before" },
      },
    ],
  },
];

describe("UndoManager rejection recovery", () => {
  it("restores undo and redo entries after rejected transactions", () => {
    const history = new UndoManager();
    history.push(undoAction, [setOperation]);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);

    expect(history.undo()).toEqual(undoAction);
    history.restoreUndo();
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);

    expect(history.undo()).toEqual(undoAction);
    expect(history.redo()).toEqual([{ kind: "patches", patches: [setOperation] }]);
    history.restoreRedo();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);

    expect(history.redo()).toEqual([{ kind: "patches", patches: [setOperation] }]);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
    history.clear();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it("disposes retained range snapshots when history is cleared", () => {
    let disposals = 0;
    const history = new UndoManager();
    history.push(
      [
        {
          kind: "rangeSnapshot",
          range: {
            sheet: "sheet",
            start: { row: 0, col: 0 },
            end: { row: 0, col: 0 },
          },
          byteLength: 13,
          toPatch: (range) => ({
            op: "setBlock",
            range,
            block: { rowCount: 1, colCount: 1, values: ["before"] },
          }),
          dispose: () => {
            disposals += 1;
          },
        },
      ],
      [setOperation],
    );
    expect(history.getResourceStats()).toEqual({
      undoEntries: 1,
      redoEntries: 0,
      retainedSnapshots: 1,
      retainedSnapshotBytes: 13,
    });
    history.clear();
    expect(disposals).toBe(1);
    expect(history.getResourceStats()).toEqual({
      undoEntries: 0,
      redoEntries: 0,
      retainedSnapshots: 0,
      retainedSnapshotBytes: 0,
    });
  });
});
