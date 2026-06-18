import { beforeAll, describe, expect, it } from "bun:test";
import { initSheetwrite } from "../src/grid";
import { SheetwriteStore } from "../src/store";
import type { Patch, Workbook } from "../src/types";

beforeAll(async () => {
  await initSheetwrite();
});

function workbook(): Workbook {
  return {
    activeSheet: "s",
    sheets: [
      {
        id: "s",
        name: "S",
        rowCount: 5,
        columns: [
          { key: "n", header: "N", width: 80, type: "number" },
          { key: "t", header: "T", width: 80, type: "text" },
        ],
      },
    ],
  };
}

function setNumbers(store: SheetwriteStore, values: number[]): void {
  const patches: Patch[] = values.map((value, row) => ({
    op: "set",
    addr: { sheet: "s", row, col: 0 },
    value: { kind: "literal", value },
  }));
  store.applyTransaction({ patches });
}

describe("store data ops", () => {
  it("aggregates a numeric column", () => {
    const store = new SheetwriteStore(workbook());
    setNumbers(store, [30, 10, 50, 20, 40]);
    expect(store.aggregate("s", 0, "sum")).toBe(150);
    expect(store.aggregate("s", 0, "avg")).toBe(30);
    expect(store.aggregate("s", 0, "min")).toBe(10);
    expect(store.aggregate("s", 0, "max")).toBe(50);
    expect(store.aggregate("s", 0, "count")).toBe(5);
  });

  it("sorts the visible window without mutating stored data", () => {
    const store = new SheetwriteStore(workbook());
    setNumbers(store, [30, 10, 50, 20, 40]);

    store.sortBy("s", 0, true);
    expect(Array.from(store.getVisibleWindow("s", { start: 0, end: 5 }, [0]).values)).toEqual([
      10, 20, 30, 40, 50,
    ]);

    store.clearView("s");
    expect(store.getVisibleWindow("s", { start: 0, end: 5 }, [0]).values[0]).toBe(30);
  });

  it("filters the visible rows", () => {
    const store = new SheetwriteStore(workbook());
    for (let r = 0; r < 5; r++) {
      store.applyTransaction({
        patches: [
          {
            op: "set",
            addr: { sheet: "s", row: r, col: 1 },
            value: { kind: "literal", value: r === 2 ? "keep" : `x${r}` },
          },
        ],
      });
    }
    store.filterBy("s", 1, "keep");
    expect(store.viewRowCount("s")).toBe(1);
    expect(store.getVisibleWindow("s", { start: 0, end: 1 }, [1]).values[0]).toBe("keep");
  });
});
