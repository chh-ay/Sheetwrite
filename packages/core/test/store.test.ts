import { beforeAll, describe, expect, it } from "bun:test";
import { validateWorkbookSnapshot } from "../src/document-protocol.js";
import { initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import type { ChangeEvent, Transaction, Workbook, WorkbookSnapshot } from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

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

  it("loads formula CellValues from columnar data through the calc engine", async () => {
    const workbook = makeWorkbook(3);
    const store = new SheetwriteStore(workbook, {
      rowCount: 3,
      columns: {
        name: ["a", "b", "c"],
        // Numeric column mixing literals and formulas, per the ColumnarData contract.
        amount: [10, { kind: "formula", src: "=B1*2" }, { kind: "formula", src: "=SUM(B1:B2)" }],
      },
    });

    expect(store.getCell(addr(1, 1)).resolved).toBe(20);
    expect(store.getCell(addr(2, 1)).resolved).toBe(30);
    expect(store.getFormula(addr(1, 1))).toBe("=B1*2");

    store.dispose();
  });

  it("loads currency columns as numeric cells", () => {
    const workbook = makeWorkbook(3);
    workbook.sheets[0]!.columns[1] = {
      ...workbook.sheets[0]!.columns[1]!,
      type: "currency",
      numberFormat: "$#,##0.00",
    };
    const store = new SheetwriteStore(workbook, makeColumnarData(3));

    expect(store.getCell(addr(2, 1)).resolved).toBe(20.5);
    expect(store.aggregate("s1", 1, "sum")).toBe(31.5);
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

  it("compacts getVisibleWindow styles to window-local ids", () => {
    const store = new SheetwriteStore(makeWorkbook(5));
    const boldStyle = { bold: true };
    const italicStyle = { italic: true };
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: addr(0, 0),
          value: { kind: "literal", value: "bold" },
          style: boldStyle,
        },
        {
          op: "set",
          addr: addr(0, 1),
          value: { kind: "literal", value: "italic" },
          style: italicStyle,
        },
        {
          op: "set",
          addr: addr(1, 0),
          value: { kind: "literal", value: "also bold" },
          style: boldStyle,
        },
        {
          op: "set",
          addr: addr(4, 2),
          value: { kind: "literal", value: "outside" },
          style: { backgroundColor: "#f0f" },
        },
      ],
    });

    const windowAddrs = [addr(0, 0), addr(0, 1), addr(1, 0), addr(1, 1)];
    const expectedStyles = windowAddrs.map((cell) => store.getCell(cell).style);
    const distinctStyles = new Set(expectedStyles);
    expect(distinctStyles.size).toBeGreaterThan(1);

    const view = store.getVisibleWindow("s1", { start: 0, end: 2 }, [0, 1]);
    expect(view.styleIds.length).toBe(windowAddrs.length);
    expect(view.styles.length <= distinctStyles.size).toBe(true);
    for (let i = 0; i < view.styleIds.length; i++) {
      const localStyleId = view.styleIds[i]!;
      expect(localStyleId < view.styles.length).toBe(true);
      expect(view.styles[localStyleId]).toBe(expectedStyles[i]);
    }
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

  it("clears active views when structural row edits shift data rows", () => {
    const store = new SheetwriteStore(makeWorkbook(5), makeColumnarData(5));
    store.filterBy("s1", 2, "Tokyo");
    expect(store.viewRowCount("s1")).toBe(2);

    store.applyTransaction({ patches: [{ op: "addRows", sheet: "s1", at: 0, count: 1 }] });
    expect(store.viewRowCount("s1")).toBe(6);
    expect(store.getVisibleWindow("s1", { start: 1, end: 2 }, [0]).values[0]).toBe("Customer 0");

    store.sortBy("s1", 1, false);
    expect(store.viewRowCount("s1")).toBe(6);
    store.applyTransaction({ patches: [{ op: "removeRows", sheet: "s1", at: 0, count: 1 }] });
    expect(store.viewRowCount("s1")).toBe(5);
    expect(store.getVisibleWindow("s1", { start: 0, end: 1 }, [0]).values[0]).toBe("Customer 0");
  });

  it("rebases plain-reference overlays after structural row edits", () => {
    const store = new SheetwriteStore(makeWorkbook(5));
    store.applyTransaction({
      patches: [
        { op: "set", addr: addr(0, 0), value: { kind: "literal", value: "source" } },
        { op: "set", addr: addr(1, 0), value: { kind: "ref", target: addr(0, 0) } },
      ],
    });

    store.applyTransaction({ patches: [{ op: "addRows", sheet: "s1", at: 0, count: 1 }] });

    expect(store.getRefTarget(addr(2, 0))).toEqual(addr(1, 0));
    expect(store.getVisibleWindow("s1", { start: 2, end: 3 }, [0]).values[0]).toBe("source");
  });

  it("keeps ref shadows live in windows, queries, and formulas", () => {
    const store = new SheetwriteStore(makeWorkbook(5));
    store.applyTransaction({
      patches: [
        { op: "set", addr: addr(0, 0), value: { kind: "literal", value: 41 } },
        { op: "set", addr: addr(1, 0), value: { kind: "ref", target: addr(0, 0) } },
        { op: "set", addr: addr(2, 0), value: { kind: "formula", src: "=A2+1" } },
      ],
    });

    // The window reads the ref's shadow without a JS overlay, so the raw
    // typed-array fields stay attached (worker zero-copy path).
    const view = store.getVisibleWindow("s1", { start: 0, end: 3 }, [0]);
    expect(view.values[1]).toBe(41);
    expect(view.valueKinds).toBeDefined();

    // Formulas now see the ref cell's displayed value (was empty pre-port).
    expect(store.getCell(addr(2, 0)).resolved).toBe(42);

    // Editing the target refreshes the shadow and dependents.
    store.applyTransaction({
      patches: [{ op: "set", addr: addr(0, 0), value: { kind: "literal", value: 10 } }],
    });
    expect(store.getVisibleWindow("s1", { start: 1, end: 2 }, [0]).values[0]).toBe(10);
    expect(store.getCell(addr(2, 0)).resolved).toBe(11);
  });

  it("applies conditional formatting in the visible-window style dictionary", () => {
    const workbook = makeWorkbook(5);
    workbook.sheets[0]!.conditionalFormats = [
      {
        range: { sheet: "s1", start: { row: 0, col: 1 }, end: { row: 4, col: 1 } },
        when: { kind: "greaterThan", value: 25 },
        style: { backgroundColor: "#fef3c7", bold: true },
      },
    ];
    const store = new SheetwriteStore(workbook, makeColumnarData(5));

    const view = store.getVisibleWindow("s1", { start: 0, end: 5 }, [1]);

    const lowStyle = view.styles[view.styleIds[1]!] ?? {};
    const highStyle = view.styles[view.styleIds[3]!] ?? {};
    expect(lowStyle.backgroundColor).toBeUndefined();
    expect(highStyle.backgroundColor).toBe("#fef3c7");
    expect(highStyle.bold).toBe(true);

    workbook.sheets[0]!.conditionalFormats![0]!.when = { kind: "greaterThan", value: 35 };
    const updated = store.getVisibleWindow("s1", { start: 0, end: 5 }, [1]);
    const previousHighStyle = updated.styles[updated.styleIds[3]!] ?? {};
    const stillHighStyle = updated.styles[updated.styleIds[4]!] ?? {};
    expect(previousHighStyle.backgroundColor).toBeUndefined();
    expect(stillHighStyle.backgroundColor).toBe("#fef3c7");
  });

  it("returns exhaustive outcomes and emits only applied transactions", () => {
    const store = new SheetwriteStore(makeWorkbook(5));
    const events: ChangeEvent[] = [];
    store.on("change", (event) => events.push(event));

    const firstTransaction: Transaction = {
      epoch: 0,
      patches: [{ op: "set", addr: addr(0, 0), value: { kind: "literal", value: "a" } }],
    };
    expect(store.applyTransaction(firstTransaction)).toEqual({
      status: "applied",
      epoch: 1,
      transaction: firstTransaction,
    });
    expect(events).toHaveLength(1);

    expect(
      store.applyTransaction({
        epoch: 0,
        patches: [{ op: "set", addr: addr(0, 0), value: { kind: "literal", value: "b" } }],
      }),
    ).toEqual({ status: "conflict", expectedEpoch: 0, actualEpoch: 1 });
    expect(store.getCell(addr(0, 0)).resolved).toBe("a");
    expect(events).toHaveLength(1);

    expect(store.applyTransaction({ patches: [] })).toEqual({
      status: "noop",
      epoch: 1,
      reason: "empty",
    });
    expect(events).toHaveLength(1);

    expect(
      store.applyTransaction({
        patches: [{ op: "set", addr: addr(10, 0), value: { kind: "literal", value: "outside" } }],
      }),
    ).toEqual({ status: "noop", epoch: 1, reason: "out-of-bounds" });
    expect(events).toHaveLength(1);

    const validPatch = {
      op: "set",
      addr: addr(1, 0),
      value: { kind: "literal", value: "valid" },
    } as const;
    const mixedResult = store.applyTransaction({
      patches: [
        { op: "set", addr: addr(10, 0), value: { kind: "literal", value: "outside" } },
        validPatch,
      ],
    });
    expect(mixedResult).toEqual({
      status: "applied",
      epoch: 2,
      transaction: { patches: [validPatch] },
    });
    expect(events).toHaveLength(2);
    expect(events[1]?.transaction).toEqual({ patches: [validPatch] });
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

  it("evaluates arithmetic formulas and recomputes on dependency edits", () => {
    const store = new SheetwriteStore(makeWorkbook(5));
    store.applyTransaction({
      patches: [
        { op: "set", addr: addr(0, 1), value: { kind: "literal", value: 10 } },
        { op: "set", addr: addr(1, 1), value: { kind: "literal", value: 20 } },
      ],
    });
    store.applyTransaction({
      patches: [{ op: "set", addr: addr(2, 1), value: { kind: "formula", src: "=B1+B2*2" } }],
    });
    expect(store.getCell(addr(2, 1)).resolved).toBe(50);

    store.applyTransaction({
      patches: [{ op: "set", addr: addr(0, 1), value: { kind: "literal", value: 100 } }],
    });
    expect(store.getCell(addr(2, 1)).resolved).toBe(140);
  });

  it("keeps rewritten formula source authoritative across row and column deletes", () => {
    const rowStore = new SheetwriteStore(makeWorkbook(8));
    rowStore.applyTransaction({
      patches: [
        { op: "set", addr: addr(0, 0), value: { kind: "literal", value: 1 } },
        { op: "set", addr: addr(1, 0), value: { kind: "literal", value: 2 } },
        { op: "set", addr: addr(2, 0), value: { kind: "literal", value: 3 } },
        { op: "set", addr: addr(3, 0), value: { kind: "literal", value: 4 } },
        { op: "set", addr: addr(5, 1), value: { kind: "formula", src: "=$A$2" } },
        { op: "set", addr: addr(6, 1), value: { kind: "formula", src: "=SUM(A1:A4)" } },
      ],
    });
    rowStore.applyTransaction({
      patches: [{ op: "removeRows", sheet: "s1", at: 1, count: 2 }],
    });

    expect(rowStore.getCell(addr(3, 1)).resolved).toBe("#REF!");
    expect(rowStore.getFormula(addr(3, 1))).toBe("=#REF!");
    expect(rowStore.getCell(addr(4, 1)).resolved).toBe(5);
    expect(rowStore.getFormula(addr(4, 1))).toBe("=SUM(A1:A2)");

    const invalidSource = rowStore.getFormula(addr(3, 1));
    expect(invalidSource).not.toBeNull();
    rowStore.applyTransaction({
      patches: [
        {
          op: "set",
          addr: addr(0, 2),
          value: { kind: "formula", src: invalidSource! },
        },
      ],
    });
    expect(rowStore.getCell(addr(0, 2)).resolved).toBe("#REF!");

    const columnWorkbook: Workbook = {
      activeSheet: "s1",
      sheets: [
        {
          id: "s1",
          name: "Sheet 1",
          rowCount: 3,
          columns: Array.from({ length: 7 }, (_, index) => ({
            key: `c${index}`,
            header: `C${index}`,
            width: 80,
            type: "number" as const,
          })),
        },
      ],
    };
    const columnStore = new SheetwriteStore(columnWorkbook);
    columnStore.applyTransaction({
      patches: [
        { op: "set", addr: addr(0, 0), value: { kind: "literal", value: 1 } },
        { op: "set", addr: addr(0, 1), value: { kind: "literal", value: 2 } },
        { op: "set", addr: addr(0, 2), value: { kind: "literal", value: 3 } },
        { op: "set", addr: addr(0, 3), value: { kind: "literal", value: 4 } },
        { op: "set", addr: addr(1, 4), value: { kind: "formula", src: "=B1" } },
        { op: "set", addr: addr(1, 5), value: { kind: "formula", src: "=SUM(A1:D1)" } },
      ],
    });
    columnStore.applyTransaction({
      patches: [{ op: "removeColumns", sheet: "s1", at: 1, count: 2 }],
    });

    expect(columnStore.getCell(addr(1, 2)).resolved).toBe("#REF!");
    expect(columnStore.getFormula(addr(1, 2))).toBe("=#REF!");
    expect(columnStore.getCell(addr(1, 3)).resolved).toBe(5);
    expect(columnStore.getFormula(addr(1, 3))).toBe("=SUM(A1:B1)");
  });

  it("rewrites cross-sheet formulas without shifting unrelated absolute targets", () => {
    const workbook: Workbook = {
      activeSheet: "source",
      sheets: [
        {
          id: "source",
          name: "Source Data",
          rowCount: 5,
          columns: [{ key: "v", header: "V", width: 80, type: "number" }],
        },
        {
          id: "other",
          name: "Other",
          rowCount: 5,
          columns: [{ key: "v", header: "V", width: 80, type: "number" }],
        },
        {
          id: "summary",
          name: "Summary",
          rowCount: 5,
          columns: [{ key: "v", header: "V", width: 80, type: "number" }],
        },
      ],
    };
    const store = new SheetwriteStore(workbook);
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "source", row: 1, col: 0 },
          value: { kind: "literal", value: 9 },
        },
        {
          op: "set",
          addr: { sheet: "other", row: 0, col: 0 },
          value: { kind: "literal", value: 7 },
        },
        {
          op: "set",
          addr: { sheet: "summary", row: 0, col: 0 },
          value: { kind: "formula", src: "='Source Data'!$A$2" },
        },
        {
          op: "set",
          addr: { sheet: "summary", row: 1, col: 0 },
          value: { kind: "formula", src: "=Other!A1" },
        },
      ],
    });
    store.applyTransaction({
      patches: [{ op: "addRows", sheet: "source", at: 1, count: 1 }],
    });

    expect(store.getCell({ sheet: "summary", row: 0, col: 0 }).resolved).toBe(9);
    expect(store.getFormula({ sheet: "summary", row: 0, col: 0 })).toBe("='Source Data'!$A$3");
    expect(store.getCell({ sheet: "summary", row: 1, col: 0 }).resolved).toBe(7);
    expect(store.getFormula({ sheet: "summary", row: 1, col: 0 })).toBe("=Other!A1");

    store.applyTransaction({
      patches: [{ op: "removeRows", sheet: "source", at: 2, count: 1 }],
    });
    expect(store.getCell({ sheet: "summary", row: 0, col: 0 }).resolved).toBe("#REF!");
    expect(store.getFormula({ sheet: "summary", row: 0, col: 0 })).toBe("=#REF!");
    expect(store.getCell({ sheet: "summary", row: 1, col: 0 }).resolved).toBe(7);
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

  it("frees disposed stores so a fresh store still reads correctly after churn", () => {
    for (let i = 0; i < 20; i++) {
      const churn = new SheetwriteStore(makeWorkbook(1000), makeColumnarData(1000));
      expect(churn.getCell(addr(500, 0)).resolved).toBe("Customer 500");
      churn.dispose();
    }

    const store = new SheetwriteStore(makeWorkbook(1000), makeColumnarData(1000));
    expect(store.getCell(addr(500, 1)).resolved).toBe(5000.5);
    // sum of amount column: sum(r*10 + 0.5) for r in [0, 1000)
    expect(store.aggregate("s1", 1, "sum")).toBe(4995500);
    store.dispose();
  });

  it("re-warms string window reads after the pool-id cache exceeds its cap", () => {
    // A full column of unique names (> STRING_CACHE_CAP distinct strings) fills
    // the pool-id→string cache past its hard cap, forcing the self-healing clear
    // on the next sweep.
    const rowCount = 70_000;
    const store = new SheetwriteStore(makeWorkbook(rowCount), makeColumnarData(rowCount));
    const win = { start: 0, end: rowCount };

    // First sweep fills the cache beyond the cap.
    const first = store.getVisibleWindow("s1", win, [0]);
    expect(first.values[0]).toBe("Customer 0");
    expect(first.values[rowCount - 1]).toBe(`Customer ${rowCount - 1}`);

    // Second sweep sees size >= cap, clears, and must re-warm from poolStrings.
    // (values is a reused scratch buffer, so `first` is asserted before this.)
    const second = store.getVisibleWindow("s1", win, [0]);
    expect(second.values[0]).toBe("Customer 0");
    expect(second.values[12_345]).toBe("Customer 12345");
    expect(second.values[rowCount - 1]).toBe(`Customer ${rowCount - 1}`);

    store.dispose();
  });

  it("drops the value scratch after an outsized window read, without corrupting later reads", () => {
    // 70k rows x 1 col = 70_000 cells > WINDOW_SCRATCH_MAX_REUSE (65_536), so the
    // store must hand off the big buffer and reset its own scratch to empty.
    const rowCount = 70_000;
    const store = new SheetwriteStore(makeWorkbook(rowCount), makeColumnarData(rowCount));

    const big = store.getVisibleWindow("s1", { start: 0, end: rowCount }, [1]);
    expect(big.values.length).toBe(rowCount);
    expect(big.values[0]).toBe(0.5); // amount[0] = 0*10 + 0.5
    expect(big.values[rowCount - 1]).toBe((rowCount - 1) * 10 + 0.5);

    // Private scratch handle: name the cast once, then read the retained length.
    const internal = store as unknown as { windowValuesScratch: unknown[] };
    expect(internal.windowValuesScratch.length).toBe(0); // big buffer released, not pinned

    // A subsequent small window must still read correctly off a fresh scratch.
    const small = store.getVisibleWindow("s1", { start: 0, end: 3 }, [0, 1, 2]);
    expect(small.values.length).toBe(9);
    expect(small.values[0]).toBe("Customer 0");
    expect(small.values[1]).toBe(0.5);
    expect(small.values[2]).toBe("Phnom Penh");
    expect(small.values[3]).toBe("Customer 1");

    // Retained scratch is now O(small window), never O(cells).
    expect(internal.windowValuesScratch.length).toBe(9);
    // The outsized view's buffer was handed off, so the small read did not clobber it.
    expect(big.values[rowCount - 1]).toBe((rowCount - 1) * 10 + 0.5);

    store.dispose();
  });

  it("composes a values filter, hidden rows, and a multi-key sort into one view", () => {
    const store = new SheetwriteStore(makeWorkbook(6), makeColumnarData(6));

    // Keep only Phnom Penh + Tokyo cities → data rows [0, 1, 3, 4].
    store.setColumnFilter("s1", 2, { kind: "values", values: ["Phnom Penh", "Tokyo"] });
    expect(store.viewRowCount("s1")).toBe(4);
    expect(store.columnFilters("s1").get(2)).toEqual({
      kind: "values",
      values: ["Phnom Penh", "Tokyo"],
    });

    // Hide one survivor → [0, 1, 3].
    store.hideRows("s1", [4]);
    expect(store.viewRowCount("s1")).toBe(3);

    // Sort city ascending, then amount descending: Phnom Penh {3 (30.5), 0 (0.5)}, Tokyo {1}.
    store.sortByMulti("s1", [
      { col: 2, ascending: true },
      { col: 1, ascending: false },
    ]);
    expect(store.viewRowCount("s1")).toBe(3);
    expect(store.dataRowAt("s1", 0)).toBe(3);
    expect(store.getVisibleWindow("s1", { start: 0, end: 3 }, [0]).values).toEqual([
      "Customer 3",
      "Customer 0",
      "Customer 1",
    ]);
  });

  it("clears sort and filters on clearView while hidden rows keep applying", () => {
    const store = new SheetwriteStore(makeWorkbook(6), makeColumnarData(6));
    store.hideRows("s1", [2, 4]);
    store.sortBy("s1", 1, false);
    expect(store.viewRowCount("s1")).toBe(4);

    store.clearView("s1");

    // Sort dropped, but the hidden rows persist → [0, 1, 3, 5] in natural order.
    expect(store.viewRowCount("s1")).toBe(4);
    expect(store.hiddenRows("s1")).toEqual([2, 4]);
    expect(store.getVisibleWindow("s1", { start: 0, end: 4 }, [0]).values).toEqual([
      "Customer 0",
      "Customer 1",
      "Customer 3",
      "Customer 5",
    ]);

    // Showing the rows drops the last view transformation entirely.
    store.showRows("s1");
    expect(store.hasView("s1")).toBe(false);
    expect(store.viewRowCount("s1")).toBe(6);
  });

  it("toggles a group's rows in the view when collapsed and expanded", () => {
    const store = new SheetwriteStore(makeWorkbook(6), makeColumnarData(6));
    store.groupRows("s1", 1, 3);
    expect(store.rowGroups("s1")).toEqual([{ start: 1, end: 3, collapsed: false }]);
    // A non-collapsed group hides nothing.
    expect(store.hasView("s1")).toBe(false);
    expect(store.viewRowCount("s1")).toBe(6);

    store.setGroupCollapsed("s1", 1, true);
    expect(store.viewRowCount("s1")).toBe(3);
    expect(store.getVisibleWindow("s1", { start: 0, end: 3 }, [0]).values).toEqual([
      "Customer 0",
      "Customer 4",
      "Customer 5",
    ]);

    store.setGroupCollapsed("s1", 1, false);
    expect(store.viewRowCount("s1")).toBe(6);
    expect(store.hasView("s1")).toBe(false);
  });

  it("returns distinct column values capped and in first-seen order", () => {
    const store = new SheetwriteStore(makeWorkbook(6), makeColumnarData(6));

    // City cycles Phnom Penh, Tokyo, Berlin — reported in first-seen order.
    expect(store.distinctValues("s1", 2)).toEqual(["Phnom Penh", "Tokyo", "Berlin"]);
    // The cap keeps only the first N distinct values, still first-seen.
    expect(store.distinctValues("s1", 2, 2)).toEqual(["Phnom Penh", "Tokyo"]);
    // Numeric column dedupes by value in first-seen order.
    expect(store.distinctValues("s1", 1, 3)).toEqual([0.5, 10.5, 20.5]);
  });

  it("scans dataEdge in view space under an active sort", () => {
    const store = new SheetwriteStore(makeWorkbook(6), makeColumnarData(6));
    // Punch a hole in the name column at data row 2.
    store.applyTransaction({
      patches: [{ op: "set", addr: addr(2, 0), value: { kind: "literal", value: null } }],
    });

    // Sort amount descending → view order is data rows [5, 4, 3, 2, 1, 0].
    store.sortBy("s1", 1, false);
    expect(store.dataRowAt("s1", 0)).toBe(5);

    // Column-0 occupancy by VIEW position is [filled, filled, filled, EMPTY, filled,
    // filled], so the run from view row 0 ends at view position 2 — a view position,
    // not a data row (data-space would stop at row 1).
    expect(store.dataEdge("s1", 0, 0, 1, 0)).toBe(2);
    expect(store.dataRowAt("s1", 2)).toBe(3);

    // Without a view the same call scans data space and stops at the hole.
    store.clearView("s1");
    expect(store.hasView("s1")).toBe(false);
    expect(store.dataEdge("s1", 0, 0, 1, 0)).toBe(1);
  });

  it("collapses to an empty view when a filter matches nothing or all rows are hidden", () => {
    const store = new SheetwriteStore(makeWorkbook(6), makeColumnarData(6));

    // A filter no cell satisfies must show zero rows, never fall back to the sheet.
    store.setColumnFilter("s1", 2, { kind: "values", values: ["Atlantis"] });
    expect(store.hasView("s1")).toBe(true);
    expect(store.viewRowCount("s1")).toBe(0);

    // Clearing the impossible filter restores the full sheet.
    store.setColumnFilter("s1", 2, null);
    expect(store.hasView("s1")).toBe(false);
    expect(store.viewRowCount("s1")).toBe(6);

    // Hiding every row is likewise an empty view, not a full one.
    store.hideRows("s1", [0, 1, 2, 3, 4, 5]);
    expect(store.viewRowCount("s1")).toBe(0);
  });
});

describe("datasource row hydration", () => {
  it("preserves rich cells without producing dirty changes", () => {
    const store = new SheetwriteStore(makeWorkbook(5));
    let changes = 0;
    store.on("change", () => {
      changes += 1;
    });

    store.loadRows("s1", 0, [
      {
        name: { kind: "literal", value: "rich" },
        amount: {
          value: { kind: "formula", src: "=1+2" },
          style: { bold: true, fontSize: 18 },
        },
        city: { kind: "ref", target: addr(1, 0) },
      },
    ]);

    expect(store.getCell(addr(0, 0)).resolved).toBe("rich");
    expect(store.getFormula(addr(0, 1))).toBe("=1+2");
    expect(store.getCell(addr(0, 1))).toMatchObject({
      resolved: 3,
      style: { bold: true, fontSize: 18 },
    });
    expect(store.getRefTarget(addr(0, 2))).toEqual(addr(1, 0));
    expect(store.getCell(addr(0, 2)).resolved).toBeNull();
    store.loadRows("s1", 1, [{ name: "later source" }]);
    expect(store.getCell(addr(0, 2)).resolved).toBe("later source");
    expect(store.getDirty()).toEqual([]);
    expect(changes).toBe(0);
    store.dispose();
  });
});

describe("stable formula sheet identity", () => {
  function lifecycleWorkbook(): Workbook {
    return {
      activeSheet: "summary",
      sheets: [
        {
          id: "source",
          name: "Sales",
          rowCount: 2,
          columns: [{ key: "value", header: "Value", width: 100, type: "number" }],
        },
        {
          id: "summary",
          name: "Summary",
          rowCount: 2,
          columns: [
            { key: "result", header: "Result", width: 100, type: "number" },
            { key: "next", header: "Next", width: 100, type: "number" },
          ],
        },
      ],
    };
  }

  it("renames resolved references canonically and supports inverse rename", () => {
    const workbook = lifecycleWorkbook();
    const store = new SheetwriteStore(workbook);
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "source", row: 0, col: 0 },
          value: { kind: "literal", value: 4 },
        },
        {
          op: "set",
          addr: { sheet: "summary", row: 0, col: 0 },
          value: { kind: "formula", src: "=Sales!A1+1" },
        },
      ],
    });

    expect(store.renameSheetFormulaIdentity("source", "Sales Data")).toBe(true);
    expect(store.getFormula({ sheet: "summary", row: 0, col: 0 })).toBe("=('Sales Data'!A1+1)");
    expect(store.getCell({ sheet: "summary", row: 0, col: 0 }).resolved).toBe(5);

    expect(store.renameSheetFormulaIdentity("source", "O'Brien")).toBe(true);
    expect(store.getFormula({ sheet: "summary", row: 0, col: 0 })).toBe("=('O''Brien'!A1+1)");
    workbook.sheets[0]!.name = "O'Brien";
    const snapshot: WorkbookSnapshot = {
      schemaVersion: 1,
      workbook: { activeSheet: "summary" },
      sheets: workbook.sheets.map((sheet, order) => ({
        ...sheet,
        order,
        rowMeta: sheet.rowHeights
          ? [...sheet.rowHeights].map(([row, height]) => [row, { height }])
          : [],
        cells:
          sheet.id === "summary"
            ? [
                {
                  startRow: 0,
                  startCol: 0,
                  rowCount: 1,
                  colCount: 1,
                  cells: [
                    {
                      rowOffset: 0,
                      colOffset: 0,
                      value: {
                        kind: "formula",
                        src: store.getFormula({ sheet: "summary", row: 0, col: 0 })!,
                      },
                    },
                  ],
                },
              ]
            : [],
      })),
    };
    const roundTrip = validateWorkbookSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(roundTrip.ok).toBe(true);
    if (!roundTrip.ok) throw new Error("renamed snapshot did not validate");
    expect(roundTrip.value.sheets[1]?.cells[0]?.cells[0]?.value).toEqual({
      kind: "formula",
      src: "=('O''Brien'!A1+1)",
    });
    expect(store.renameSheetFormulaIdentity("source", "Sales")).toBe(true);
    expect(store.getFormula({ sheet: "summary", row: 0, col: 0 })).toBe("=(Sales!A1+1)");
    store.dispose();
  });

  it("tombstones removed handles and repairs transitive dependencies", () => {
    const workbook = lifecycleWorkbook();
    const store = new SheetwriteStore(workbook);
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "source", row: 0, col: 0 },
          value: { kind: "literal", value: 4 },
        },
        {
          op: "set",
          addr: { sheet: "summary", row: 0, col: 0 },
          value: { kind: "formula", src: "=Sales!A1+1" },
        },
        {
          op: "set",
          addr: { sheet: "summary", row: 0, col: 1 },
          value: { kind: "formula", src: "=A1+1" },
        },
      ],
    });
    expect(store.getCell({ sheet: "summary", row: 0, col: 1 }).resolved).toBe(6);

    expect(store.removeSheetFormulaIdentity("source")).toBe(true);

    expect(store.getFormula({ sheet: "summary", row: 0, col: 0 })).toBe("=(#REF!+1)");
    expect(store.getCell({ sheet: "summary", row: 0, col: 0 }).resolved).toBe("#REF!");
    expect(store.getCell({ sheet: "summary", row: 0, col: 1 }).resolved).toBe("#REF!");
    expect(store.removeSheetFormulaIdentity("source")).toBe(false);
    store.dispose();
  });
});

describe("document metadata reducer validation", () => {
  it("rejects overlapping, out-of-bounds, and frozen-boundary merges atomically", () => {
    const workbook = makeWorkbook(5);
    workbook.sheets[0]!.frozenRows = 1;
    const store = new SheetwriteStore(workbook);

    expect(
      store.applyTransaction({
        patches: [{ op: "addMerge", sheet: "s1", merge: { r0: 0, c0: 0, r1: 1, c1: 1 } }],
      }),
    ).toEqual({ status: "noop", epoch: 0, reason: "out-of-bounds" });
    expect(workbook.sheets[0]!.merges).toBeUndefined();

    const applied = store.applyTransaction({
      patches: [{ op: "addMerge", sheet: "s1", merge: { r0: 1, c0: 0, r1: 2, c1: 1 } }],
    });
    expect(applied.status).toBe("applied");
    expect(
      store.applyTransaction({
        patches: [
          { op: "addMerge", sheet: "s1", merge: { r0: 2, c0: 1, r1: 3, c1: 2 } },
          { op: "addMerge", sheet: "s1", merge: { r0: 99, c0: 0, r1: 100, c1: 1 } },
        ],
      }),
    ).toEqual({ status: "noop", epoch: 1, reason: "out-of-bounds" });
    expect(workbook.sheets[0]!.merges).toEqual([{ r0: 1, c0: 0, r1: 2, c1: 1 }]);
    store.dispose();
  });

  it("emits plain-data metadata operations sufficient for reconstruction", () => {
    const workbook = makeWorkbook(5);
    const store = new SheetwriteStore(workbook);
    const events: ChangeEvent[] = [];
    store.on("change", (event) => events.push(event));
    const operations: Transaction["patches"] = [
      { op: "setRowMeta", sheet: "s1", row: 2, meta: { height: 40, hidden: true } },
      {
        op: "setSheetMeta",
        sheet: "s1",
        patch: {
          frozenRows: 1,
          frozenCols: 1,
          rowGroups: [{ start: 2, end: 3, collapsed: true }],
        },
      },
    ];

    const result = store.applyTransaction({ patches: operations });

    expect(result.status).toBe("applied");
    expect(events).toHaveLength(1);
    expect(events[0]?.transaction.patches).toEqual(operations);
    expect(events[0]?.dirty).toEqual(operations);
    expect(JSON.parse(JSON.stringify(events[0]?.transaction.patches))).toEqual(operations);
    expect(workbook.sheets[0]).toMatchObject({ frozenRows: 1, frozenCols: 1 });
    expect(workbook.sheets[0]!.rowHeights?.get(2)).toBe(40);
    expect(workbook.sheets[0]!.hiddenRows?.has(2)).toBe(true);
    expect(workbook.sheets[0]!.rowGroups).toEqual([{ start: 2, end: 3, collapsed: true }]);
    store.dispose();
  });

  it("rebases document metadata with structural row and column operations", () => {
    const workbook = makeWorkbook(5);
    const sheet = workbook.sheets[0]!;
    sheet.frozenRows = 1;
    sheet.frozenCols = 1;
    sheet.rowHeights = new Map([[2, 44]]);
    sheet.hiddenRows = new Set([2]);
    sheet.rowGroups = [{ start: 2, end: 3, collapsed: true }];
    sheet.merges = [{ r0: 2, c0: 1, r1: 3, c1: 2 }];
    sheet.conditionalFormats = [
      {
        range: { sheet: "s1", start: { row: 2, col: 1 }, end: { row: 4, col: 2 } },
        when: { kind: "greaterThan", value: 0 },
        style: { bold: true },
      },
    ];
    workbook.namedRanges = [
      {
        name: "Report",
        range: { sheet: "s1", start: { row: 2, col: 1 }, end: { row: 4, col: 2 } },
      },
    ];
    const store = new SheetwriteStore(workbook);

    expect(
      store.applyTransaction({
        patches: [
          { op: "addRows", sheet: "s1", at: 1, count: 1 },
          { op: "removeRows", sheet: "s1", at: 0, count: 1 },
          { op: "removeColumns", sheet: "s1", at: 0, count: 1 },
        ],
      }).status,
    ).toBe("applied");

    expect(sheet.frozenRows).toBe(0);
    expect(sheet.frozenCols).toBe(0);
    expect([...sheet.rowHeights!]).toEqual([[2, 44]]);
    expect([...sheet.hiddenRows!]).toEqual([2]);
    expect(sheet.rowGroups).toEqual([{ start: 2, end: 3, collapsed: true }]);
    expect(sheet.merges).toEqual([{ r0: 2, c0: 0, r1: 3, c1: 1 }]);
    expect(sheet.conditionalFormats?.[0]?.range).toEqual({
      sheet: "s1",
      start: { row: 2, col: 0 },
      end: { row: 4, col: 1 },
    });
    expect(workbook.namedRanges?.[0]?.range).toEqual({
      sheet: "s1",
      start: { row: 2, col: 0 },
      end: { row: 4, col: 1 },
    });
    store.dispose();
  });
});
