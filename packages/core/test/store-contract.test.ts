import { beforeAll, describe, expect, it } from "bun:test";
import { SnapshotResourceError, SnapshotValidationError } from "../src/document-protocol.js";
import { initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import type { ChangeEvent, DocumentOp, Workbook } from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

function contractWorkbook(): Workbook {
  const workbook = makeWorkbook(4);
  workbook.sheets[0]!.protectedRanges = [
    {
      id: "locked-tail",
      range: { sheet: "s1", start: { row: 3, col: 0 }, end: { row: 3, col: 2 } },
    },
  ];
  return workbook;
}

function runFacadeContract(storage: "dense" | "paged"): void {
  const store = new SheetwriteStore(contractWorkbook(), undefined, {
    storage,
    chunkRows: 4,
    cacheBytes: 1_000_000,
  });
  if (storage === "paged") {
    expect(store.queryCapability("s1").status).toBe("incomplete");
    store.loadRows("s1", 0, [
      { name: "", amount: 0, city: "" },
      { name: "", amount: 0, city: "" },
      { name: "", amount: 0, city: "" },
      { name: "", amount: 0, city: "" },
    ]);
  }
  expect(store.queryCapability("s1")).toEqual({ status: "complete" });

  const range = { sheet: "s1", start: { row: 1, col: 0 }, end: { row: 1, col: 1 } };
  const blockRange = { sheet: "s1", start: { row: 2, col: 0 }, end: { row: 2, col: 2 } };
  const patches: DocumentOp[] = [
    {
      op: "set",
      addr: { sheet: "s1", row: 0, col: 0 },
      value: { kind: "literal", value: 2 },
      style: { bold: true },
    },
    {
      op: "setRange",
      range,
      cells: [
        { rowOffset: 0, colOffset: 0, value: { kind: "literal", value: 3 } },
        { rowOffset: 0, colOffset: 1, value: { kind: "literal", value: "range" } },
      ],
    },
    {
      op: "setBlock",
      range: blockRange,
      block: {
        rowCount: 1,
        colCount: 3,
        values: [4, null, null],
        formulas: [[1, "=A3*2"]],
        refs: [[2, { sheet: "s1", row: 2, col: 1 }]],
      },
    },
    {
      op: "setRangeStyle",
      range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 2, col: 2 } },
      style: { italic: true },
    },
  ];
  const transaction = { epoch: 0, patches };
  const listenerOrder: string[] = [];
  const events: ChangeEvent[] = [];
  store.on("change", (event) => {
    listenerOrder.push("first");
    events.push(event);
  });
  store.on("change", () => listenerOrder.push("second"));

  const applied = store.applyTransaction(transaction);
  expect(applied).toMatchObject({ status: "applied", epoch: 1 });
  expect(applied.status === "applied" ? applied.transaction.patches : []).toBe(patches);
  expect(events).toHaveLength(1);
  expect(events[0]?.transaction.patches).toBe(patches);
  expect(listenerOrder).toEqual(["first", "second"]);
  expect(store.getCell({ sheet: "s1", row: 2, col: 1 }).resolved).toBe(8);
  expect(store.getCell({ sheet: "s1", row: 2, col: 2 }).resolved).toBe(8);
  expect(store.getFormula({ sheet: "s1", row: 2, col: 1 })).toBe("=A3*2");
  expect(store.getRefTarget({ sheet: "s1", row: 2, col: 2 })).toEqual({
    sheet: "s1",
    row: 2,
    col: 1,
  });
  expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).style).toMatchObject({
    bold: true,
    italic: true,
  });

  const firstWindow = store.getVisibleWindow("s1", { start: 0, end: 3 }, [0, 1, 2]);
  const firstValues = Array.from(firstWindow.values);
  const secondWindow = store.getVisibleWindow("s1", { start: 0, end: 3 }, [0, 1, 2]);
  const secondValues = Array.from(secondWindow.values);
  expect(secondValues).toEqual(firstValues);
  expect(secondValues[0]).toBe(2);
  expect(secondValues.slice(3, 5)).toEqual([3, "range"]);
  expect(secondValues.slice(6, 9)).toEqual([4, 8, 8]);

  store.sortBy("s1", 0, false);
  const viewOrder = [0, 1, 2, 3].map((row) => store.dataRowAt("s1", row));
  expect(new Set(viewOrder).size).toBe(4);
  for (let viewRow = 0; viewRow < viewOrder.length; viewRow++) {
    expect(store.viewRowOf("s1", viewOrder[viewRow]!)).toBe(viewRow);
  }
  store.clearView("s1");

  const beforeRejected = events.length;
  expect(
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 3, col: 0 },
          value: { kind: "literal", value: "denied" },
        },
      ],
    }),
  ).toMatchObject({ status: "rejected" });
  expect(store.applyTransaction({ patches: [] })).toMatchObject({ status: "noop" });
  expect(events).toHaveLength(beforeRejected);

  const history = store.captureRangeHistory(blockRange);
  expect(history).not.toBeNull();
  expect(() => {
    history?.dispose();
    history?.dispose();
  }).not.toThrow();

  const snapshot = store.exportSnapshot();
  const restored = SheetwriteStore.fromSnapshot(JSON.parse(JSON.stringify(snapshot)));
  expect(restored.exportSnapshot()).toEqual(snapshot);
  restored.dispose();

  if (storage === "paged") {
    expect(store.getPagedStats("s1").dirtyCells).toBeGreaterThan(0);
    store.acknowledgeOperations(patches);
    expect(store.getPagedStats("s1").dirtyCells).toBe(0);
  }
  store.dispose();
}

describe("SheetwriteStore facade contract", () => {
  it("preserves dense transaction, view, snapshot, policy, and resource barriers", () => {
    runFacadeContract("dense");
  });

  it("preserves paged transaction, view, snapshot, policy, and resource barriers", () => {
    runFacadeContract("paged");
  });

  it("keeps snapshot validation at the facade trust boundary", () => {
    expect(() => SheetwriteStore.fromSnapshot({ schemaVersion: 999 })).toThrow(
      SnapshotValidationError,
    );

    const large = makeWorkbook(1_000_000);
    for (let index = large.sheets[0]!.columns.length; index < 6; index++) {
      large.sheets[0]!.columns.push({
        key: `extra-${index}`,
        header: `Extra ${index}`,
        width: 80,
        type: "text",
      });
    }
    expect(() => new SheetwriteStore(large)).toThrow(SnapshotResourceError);
    const paged = new SheetwriteStore(large, undefined, { storage: "paged" });
    expect(paged.isPaged("s1")).toBe(true);
    paged.dispose();
  });
});
