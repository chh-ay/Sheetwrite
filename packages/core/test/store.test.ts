import { beforeAll, describe, expect, it } from "bun:test";
import { initSheetwrite } from "../src/grid";
import { SheetwriteStore } from "../src/store";
import type { ChangeEvent, Workbook } from "../src/types";
import { makeColumnarData, makeWorkbook } from "./fixtures";

const addr = (row: number, col: number) => ({ sheet: "s1", row, col });

beforeAll(async () => {
  await initSheetwrite();
});

describe("SheetwriteStore", () => {
  it("applies literal set patches and resolves them through the WASM boundary", () => {
    const store = new SheetwriteStore(makeWorkbook(10));
    store.applyTransaction({
      patches: [
        { op: "set", addr: addr(2, 0), value: { kind: "literal", value: "Acme" } },
        { op: "set", addr: addr(2, 1), value: { kind: "literal", value: 1234.5 } },
      ],
    });
    expect(store.getCell(addr(2, 0)).resolved).toBe("Acme");
    expect(store.getCell(addr(2, 1)).resolved).toBe(1234.5);
    expect(store.getCell(addr(2, 2)).resolved).toBeNull();
  });

  it("returns a row-major bulk window without per-cell reads", () => {
    const store = new SheetwriteStore(makeWorkbook(50), makeColumnarData(50));
    const view = store.getVisibleWindow("s1", { start: 3, end: 6 }, [0, 1, 2]);
    expect(view.rows).toEqual({ start: 3, end: 6 });
    expect(view.values.length).toBe(3 * 3); // 3 rows x 3 cols, row-major
    // row 3 -> [name, amount, city]
    expect(view.values[0]).toBe("Customer 3");
    expect(view.values[1]).toBe(30.5); // row 3 amount = 3 * 10 + 0.5
    expect(view.values[2]).toBe("Phnom Penh"); // row 3 city = cities[3 % 3]
    // row 4 begins at index 3
    expect(view.values[3]).toBe("Customer 4");
    expect(view.styleIds.length).toBe(9);
  });

  it("carries a non-default style id and exposes it via the dictionary", () => {
    const store = new SheetwriteStore(makeWorkbook(5));
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: addr(0, 0),
          value: { kind: "literal", value: "x" },
          style: { bold: true },
        },
      ],
    });
    const { style } = store.getCell(addr(0, 0));
    expect(style.bold).toBe(true);
    const view = store.getVisibleWindow("s1", { start: 0, end: 1 }, [0]);
    expect(view.styles[view.styleIds[0]!]?.bold).toBe(true);
  });

  it("inserts and removes rows, shifting data and updating row count", () => {
    const store = new SheetwriteStore(makeWorkbook(5));
    store.applyTransaction({
      patches: [{ op: "set", addr: addr(0, 0), value: { kind: "literal", value: "top" } }],
    });
    store.applyTransaction({ patches: [{ op: "addRows", sheet: "s1", at: 0, count: 2 }] });
    expect(store.getWorkbook().sheets[0]!.rowCount).toBe(7);
    expect(store.getCell(addr(0, 0)).resolved).toBeNull();
    expect(store.getCell(addr(2, 0)).resolved).toBe("top");

    store.applyTransaction({ patches: [{ op: "removeRows", sheet: "s1", at: 0, count: 2 }] });
    expect(store.getWorkbook().sheets[0]!.rowCount).toBe(5);
    expect(store.getCell(addr(0, 0)).resolved).toBe("top");
  });

  it("rejects a transaction whose epoch is stale", () => {
    const store = new SheetwriteStore(makeWorkbook(5));
    // first edit advances epoch 0 -> 1
    store.applyTransaction({
      epoch: 0,
      patches: [{ op: "set", addr: addr(0, 0), value: { kind: "literal", value: "a" } }],
    });
    // resubmitting against the now-stale epoch 0 is dropped
    store.applyTransaction({
      epoch: 0,
      patches: [{ op: "set", addr: addr(0, 0), value: { kind: "literal", value: "b" } }],
    });
    expect(store.getCell(addr(0, 0)).resolved).toBe("a");
    // a transaction with no epoch always applies
    store.applyTransaction({
      patches: [{ op: "set", addr: addr(0, 0), value: { kind: "literal", value: "c" } }],
    });
    expect(store.getCell(addr(0, 0)).resolved).toBe("c");
  });

  it("tracks dirty patches and clears them on markClean", () => {
    const store = new SheetwriteStore(makeWorkbook(5));
    const patch = {
      op: "set",
      addr: addr(0, 0),
      value: { kind: "literal", value: 1 },
    } as const;
    store.applyTransaction({ patches: [patch] });
    expect(store.getDirty()).toHaveLength(1);
    store.markClean([patch]);
    expect(store.getDirty()).toHaveLength(0);
  });

  it("emits a change event carrying old and new values for rollback", () => {
    const store = new SheetwriteStore(makeWorkbook(5));
    store.applyTransaction({
      patches: [{ op: "set", addr: addr(0, 0), value: { kind: "literal", value: "old" } }],
    });
    let captured: ChangeEvent | null = null;
    store.on("change", (e) => {
      captured = e;
    });
    store.applyTransaction({
      patches: [{ op: "set", addr: addr(0, 0), value: { kind: "literal", value: "new" } }],
    });
    expect(captured).not.toBeNull();
    const change = captured!.changes[0]!;
    expect(change.oldValue).toEqual({ kind: "literal", value: "old" });
    expect(change.newValue).toEqual({ kind: "literal", value: "new" });
  });

  it("refuses arithmetic formula values (calc tier)", () => {
    const store = new SheetwriteStore(makeWorkbook(5));
    expect(() =>
      store.applyTransaction({
        patches: [{ op: "set", addr: addr(0, 0), value: { kind: "formula", src: "=A1*2" } }],
      }),
    ).toThrow(/not supported/);
  });

  it("resolves plain references and propagates target edits across sheets", () => {
    const workbook: Workbook = {
      activeSheet: "A",
      sheets: [
        {
          id: "A",
          name: "A",
          rowCount: 5,
          columns: [{ key: "v", header: "V", width: 80, type: "text" }],
        },
        {
          id: "B",
          name: "B",
          rowCount: 5,
          columns: [{ key: "v", header: "V", width: 80, type: "text" }],
        },
      ],
    };
    const store = new SheetwriteStore(workbook);
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "A", row: 0, col: 0 },
          value: { kind: "literal", value: "hello" },
        },
      ],
    });
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "B", row: 0, col: 0 },
          value: { kind: "ref", target: { sheet: "A", row: 0, col: 0 } },
        },
      ],
    });
    expect(store.getCell({ sheet: "B", row: 0, col: 0 }).resolved).toBe("hello");

    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "A", row: 0, col: 0 },
          value: { kind: "literal", value: "world" },
        },
      ],
    });
    expect(store.getCell({ sheet: "B", row: 0, col: 0 }).resolved).toBe("world");
    expect(store.getVisibleWindow("B", { start: 0, end: 1 }, [0]).values[0]).toBe("world");
  });
});
