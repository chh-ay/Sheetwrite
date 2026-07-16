import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { createGrid, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Grid } from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

let restoreCanvasStubs: () => void;

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreCanvasStubs = installCanvasTestStubs();
});

afterEach(() => {
  restoreCanvasStubs();
  document.body.innerHTML = "";
});

function makeGrid(rowCount = 10): Grid {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  return createGrid(host, {
    workbook: makeWorkbook(rowCount),
    data: makeColumnarData(rowCount),
    config: { toolbar: false, find: false, contextMenu: false },
  });
}

describe("StyleActions underline/strikethrough toggles", () => {
  it("applies underline to the selection and restores every style with one undo", () => {
    const grid = makeGrid();
    grid.setSelection({
      kind: "range",
      range: {
        sheet: "s1",
        start: { row: 0, col: 0 },
        end: { row: 0, col: 1 },
      },
    });

    grid.actions.toggleUnderline();
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).style.underline).toBe(true);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 1 }).style.underline).toBe(true);

    grid.actions.undo();
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).style.underline).toBeUndefined();
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 1 }).style.underline).toBeUndefined();
    grid.destroy();
  });

  it("adds strikethrough without losing an existing underline", () => {
    const grid = makeGrid();
    const addr = { sheet: "s1", row: 1, col: 0 };
    grid.applyTransaction({
      patches: [
        {
          op: "setRangeStyle",
          range: { sheet: "s1", start: { row: 1, col: 0 }, end: { row: 1, col: 0 } },
          style: { underline: true },
        },
      ],
    });
    grid.setSelection({ kind: "cell", addr });

    grid.actions.toggleStrikethrough();

    expect(grid.store.getCell(addr).style).toMatchObject({
      underline: true,
      strikethrough: true,
    });
    grid.destroy();
  });

  it("styles the selected rows in a descending sorted view", () => {
    const grid = makeGrid();
    const store = grid.store as SheetwriteStore;
    store.sortBy("s1", 1, false);
    grid.setSelection({
      kind: "range",
      range: {
        sheet: "s1",
        start: { row: 0, col: 0 },
        end: { row: 2, col: 0 },
      },
    });

    grid.actions.toggleUnderline();

    for (const row of [7, 8, 9]) {
      expect(store.getCell({ sheet: "s1", row, col: 0 }).style.underline).toBe(true);
    }
    expect(store.getCell({ sheet: "s1", row: 6, col: 0 }).style.underline).toBeUndefined();
    grid.destroy();
  });

  it("styles only non-contiguous rows present in a filtered view", () => {
    const grid = makeGrid();
    const store = grid.store as SheetwriteStore;
    store.filterBy("s1", 2, "Berlin");
    grid.setSelection({
      kind: "range",
      range: {
        sheet: "s1",
        start: { row: 0, col: 1 },
        end: { row: 2, col: 1 },
      },
    });

    grid.actions.toggleUnderline();

    for (const row of [2, 5, 8]) {
      expect(store.getCell({ sheet: "s1", row, col: 1 }).style.underline).toBe(true);
    }
    expect(store.getCell({ sheet: "s1", row: 1, col: 1 }).style.underline).toBeUndefined();
    grid.destroy();
  });

  it("does nothing when the selection is empty", () => {
    const grid = makeGrid();
    let changes = 0;
    grid.on("change", () => {
      changes += 1;
    });

    grid.actions.toggleUnderline();

    expect(changes).toBe(0);
    expect(grid.store.getCell({ sheet: "s1", row: 0, col: 0 }).style).toEqual({});
    grid.destroy();
  });
});

describe("StyleActions merge policy", () => {
  it("keeps anchor content, clears covered cells, and restores the merge with one undo", () => {
    const grid = makeGrid(4);
    const addresses = [
      { sheet: "s1", row: 1, col: 0 },
      { sheet: "s1", row: 1, col: 1 },
      { sheet: "s1", row: 2, col: 0 },
      { sheet: "s1", row: 2, col: 1 },
    ] as const;
    grid.applyTransaction({
      patches: addresses.map((addr, index) => ({
        op: "set" as const,
        addr,
        value: { kind: "literal" as const, value: `value-${index}` },
      })),
    });
    grid.setSelection({
      kind: "range",
      range: {
        sheet: "s1",
        start: { row: 1, col: 0 },
        end: { row: 2, col: 1 },
      },
    });

    grid.actions.merge();

    expect(grid.store.getWorkbook().sheets[0]!.merges).toEqual([{ r0: 1, c0: 0, r1: 2, c1: 1 }]);
    expect(addresses.map((addr) => grid.store.getCell(addr).resolved)).toEqual([
      "value-0",
      null,
      null,
      null,
    ]);

    grid.actions.undo();
    expect(grid.store.getWorkbook().sheets[0]!.merges ?? []).toEqual([]);
    expect(addresses.map((addr) => grid.store.getCell(addr).resolved)).toEqual([
      "value-0",
      "value-1",
      "value-2",
      "value-3",
    ]);
    grid.destroy();
  });
});
