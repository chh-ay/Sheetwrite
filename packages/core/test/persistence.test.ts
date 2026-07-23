import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
  type ChangeEvent,
  createGridFromSnapshot,
  initSheetwrite,
  MemoryPersistenceAdapter,
  PersistenceError,
  SheetwriteStore,
  SnapshotValidationError,
  type WorkbookSnapshot,
} from "../src/index.js";
import { installCanvasTestStubs, type RecordingContext2D } from "../src/testing.js";

beforeAll(async () => {
  await initSheetwrite();
});

let restoreStubs: () => void;
beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});
afterEach(() => restoreStubs());

function richSnapshot(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    documentId: "doc-1",
    version: 7,
    workbook: {
      activeSheet: "summary",
      namedRanges: [
        {
          name: "Input",
          range: { sheet: "source", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
        },
      ],
    },
    sheets: [
      {
        id: "source",
        name: "Sales",
        order: 0,
        rowCount: 4,
        columns: [
          { key: "amount", header: "Amount", width: 90, type: "number" },
          { key: "copy", header: "Copy", width: 110, type: "text" },
        ],
        frozenRows: 1,
        frozenCols: 1,
        rowMeta: [[2, { height: 36, hidden: true }]],
        merges: [{ r0: 1, c0: 0, r1: 1, c1: 1 }],
        conditionalFormats: [
          {
            range: { sheet: "source", start: { row: 1, col: 0 }, end: { row: 3, col: 0 } },
            when: { kind: "greaterThan", value: 10 },
            style: { backgroundColor: "#fef3c7" },
          },
        ],
        rowGroups: [{ start: 2, end: 3, collapsed: true }],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 4,
            colCount: 2,
            cells: [
              {
                rowOffset: 0,
                colOffset: 0,
                value: { kind: "literal", value: 4 },
                style: { bold: true, backgroundColor: "#fef3c7" },
              },
              {
                rowOffset: 0,
                colOffset: 1,
                value: {
                  kind: "ref",
                  target: { sheet: "source", row: 0, col: 0 },
                },
                style: { italic: true },
              },
              {
                rowOffset: 3,
                colOffset: 1,
                value: { kind: "literal", value: "note" },
              },
            ],
          },
        ],
      },
      {
        id: "summary",
        name: "Summary",
        order: 1,
        rowCount: 3,
        columns: [
          { key: "result", header: "Result", width: 120, type: "number" },
          { key: "resultRef", header: "Result ref", width: 120, type: "number" },
        ],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 1,
            colCount: 2,
            cells: [
              {
                rowOffset: 0,
                colOffset: 0,
                value: { kind: "formula", src: "=Sales!A1+1" },
                style: { underline: true },
              },
              {
                rowOffset: 0,
                colOffset: 1,
                value: {
                  kind: "ref",
                  target: { sheet: "summary", row: 0, col: 0 },
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("snapshot persistence boundary", () => {
  it("round-trips a rich workbook deterministically without hydration events", () => {
    const store = SheetwriteStore.fromSnapshot(JSON.parse(JSON.stringify(richSnapshot())));

    expect(store.getWorkbook().activeSheet).toBe("summary");
    expect(store.getWorkbook().sheets.map((sheet) => sheet.id)).toEqual(["source", "summary"]);
    expect(store.getCell({ sheet: "source", row: 0, col: 0 })).toEqual({
      resolved: 4,
      style: { bold: true, backgroundColor: "#fef3c7" },
    });
    expect(store.getRefTarget({ sheet: "source", row: 0, col: 1 })).toEqual({
      sheet: "source",
      row: 0,
      col: 0,
    });
    expect(store.getCell({ sheet: "source", row: 0, col: 1 }).resolved).toBe(4);
    expect(store.getFormula({ sheet: "summary", row: 0, col: 0 })).toBe("=Sales!A1+1");
    expect(store.getCell({ sheet: "summary", row: 0, col: 0 }).resolved).toBe(5);
    expect(store.getCell({ sheet: "summary", row: 0, col: 1 }).resolved).toBe(5);

    store.getCell = () => {
      throw new Error("snapshot export must use a bulk sheet read");
    };
    const first = store.exportSnapshot();
    const bytes = JSON.stringify(first);
    expect(first.sheets[0]).toMatchObject({
      frozenRows: 1,
      frozenCols: 1,
      rowMeta: [[2, { height: 36, hidden: true }]],
      merges: [{ r0: 1, c0: 0, r1: 1, c1: 1 }],
      rowGroups: [{ start: 2, end: 3, collapsed: true }],
    });

    const restored = SheetwriteStore.fromSnapshot(JSON.parse(bytes));
    expect(JSON.stringify(restored.exportSnapshot())).toBe(bytes);
    store.dispose();
    restored.dispose();
  });

  it("preserves non-ASCII formula source through the packed snapshot boundary", () => {
    const snapshot = richSnapshot();
    snapshot.sheets[1]!.cells[0]!.cells[0]!.value = {
      kind: "formula",
      src: '="雪😀"',
    };
    const store = SheetwriteStore.fromSnapshot(snapshot);

    expect(store.exportSnapshot().sheets[1]!.cells[0]!.cells[0]!.value).toEqual({
      kind: "formula",
      src: '="雪😀"',
    });
    store.dispose();
  });

  it("mounts without a user change or undo entry and rejects invalid input cleanly", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const grid = createGridFromSnapshot(host, richSnapshot());
    let changes = 0;
    grid.on("change", () => {
      changes += 1;
    });

    grid.undo();
    expect(grid.store.getCell({ sheet: "summary", row: 0, col: 0 }).resolved).toBe(5);
    expect(changes).toBe(0);
    grid.destroy();

    const invalidHost = document.createElement("div");
    expect(() =>
      createGridFromSnapshot(invalidHost, { ...richSnapshot(), schemaVersion: 99 }),
    ).toThrow(PersistenceError);
    expect(invalidHost.childElementCount).toBe(0);
  });

  it("surfaces malformed snapshots as validation errors at public load boundaries", () => {
    const malformed = { ...richSnapshot(), sheets: [null] };

    let storeError: unknown;
    try {
      SheetwriteStore.fromSnapshot(malformed);
    } catch (error) {
      storeError = error;
    }
    expect(storeError).not.toBeInstanceOf(TypeError);
    expect(storeError).toBeInstanceOf(SnapshotValidationError);
    if (!(storeError instanceof SnapshotValidationError)) {
      throw new Error("store did not expose snapshot validation details");
    }
    expect(storeError.errors).toContainEqual(
      expect.objectContaining({ path: "sheets[0]", code: "invalid-value" }),
    );

    const host = document.createElement("div");
    let gridError: unknown;
    try {
      createGridFromSnapshot(host, malformed);
    } catch (error) {
      gridError = error;
    }
    expect(gridError).not.toBeInstanceOf(TypeError);
    expect(gridError).toBeInstanceOf(PersistenceError);
    if (!(gridError instanceof PersistenceError)) {
      throw new Error("grid did not wrap snapshot validation failure");
    }
    expect(gridError.code).toBe("invalid-snapshot");
    expect(gridError.cause).toBeInstanceOf(SnapshotValidationError);
    expect(host.childElementCount).toBe(0);
  });
  it("hydrates a million-row snapshot only through paged allocation", () => {
    const snapshot: WorkbookSnapshot = {
      schemaVersion: 1,
      workbook: { activeSheet: "large" },
      sheets: [
        {
          id: "large",
          name: "Large",
          order: 0,
          rowCount: 1_000_000,
          columns: Array.from({ length: 6 }, (_, index) => ({
            key: `c${index}`,
            header: `C${index}`,
            width: 80,
            type: "text",
          })),
          cells: [],
        },
      ],
    };

    expect(() => SheetwriteStore.fromSnapshot(snapshot)).toThrow(SnapshotValidationError);
    const pagedStore = SheetwriteStore.fromSnapshot(snapshot, { storage: "paged" });
    expect(pagedStore.isPaged("large")).toBe(true);
    expect(pagedStore.getPagedStats("large").allocatedBytes).toBe(0);
    pagedStore.dispose();

    const host = document.createElement("div");
    const grid = createGridFromSnapshot(host, snapshot, {
      datasourceStorage: { mode: "paged" },
    });
    expect(grid.store.getWorkbook().sheets[0]?.rowCount).toBe(1_000_000);
    grid.destroy();

    let error: unknown;
    try {
      createGridFromSnapshot(document.createElement("div"), snapshot);
    } catch (cause) {
      error = cause;
    }
    expect(error).toBeInstanceOf(PersistenceError);
    if (!(error instanceof PersistenceError)) {
      throw new Error("dense snapshot resource failure was not typed");
    }
    expect(error.code).toBe("resource-limit");
    expect(error.cause).toBeInstanceOf(SnapshotValidationError);
  });

  it("exports a sparse billion-cell snapshot without a dense source scan", () => {
    const snapshot: WorkbookSnapshot = {
      schemaVersion: 1,
      workbook: { activeSheet: "large" },
      sheets: [
        {
          id: "large",
          name: "Large",
          order: 0,
          rowCount: 1_000_000,
          columns: Array.from({ length: 1_000 }, (_, index) => ({
            key: `c${index}`,
            header: `C${index}`,
            width: 80,
            type: "number" as const,
          })),
          cells: [
            {
              startRow: 999_999,
              startCol: 999,
              rowCount: 1,
              colCount: 1,
              cells: [
                {
                  rowOffset: 0,
                  colOffset: 0,
                  value: { kind: "literal", value: 42 },
                },
              ],
            },
          ],
        },
      ],
    };
    const store = SheetwriteStore.fromSnapshot(snapshot, { storage: "paged" });

    expect(store.queryCapability("large")).toEqual({ status: "complete" });
    expect(store.exportSnapshot().sheets[0]!.cells).toEqual([
      {
        startRow: 0,
        startCol: 0,
        rowCount: 1_000_000,
        colCount: 1_000,
        cells: [
          {
            rowOffset: 999_999,
            colOffset: 999,
            value: { kind: "literal", value: 42 },
          },
        ],
      },
    ]);
    expect(store.getPagedStats("large").dirtyCells).toBe(0);
    store.dispose();
  });

  it("hydrates multi-cell paged snapshots as clean baseline below the local dirty limit", () => {
    const snapshot: WorkbookSnapshot = {
      schemaVersion: 1,
      workbook: { activeSheet: "s1" },
      sheets: [
        {
          id: "s1",
          name: "Sheet 1",
          order: 0,
          rowCount: 4,
          columns: [{ key: "value", header: "Value", width: 100, type: "number" }],
          cells: [
            {
              startRow: 0,
              startCol: 0,
              rowCount: 3,
              colCount: 1,
              cells: [
                {
                  rowOffset: 0,
                  colOffset: 0,
                  value: { kind: "literal", value: 3 },
                  style: { bold: true },
                },
                { rowOffset: 1, colOffset: 0, value: { kind: "formula", src: "=A1+1" } },
                {
                  rowOffset: 2,
                  colOffset: 0,
                  value: { kind: "ref", target: { sheet: "s1", row: 0, col: 0 } },
                },
              ],
            },
          ],
        },
      ],
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const grid = createGridFromSnapshot(host, snapshot, {
      datasourceStorage: { mode: "paged", chunkRows: 4, dirtyCellLimit: 1 },
    });
    const store = grid.store as SheetwriteStore;

    expect(store.getCell({ sheet: "s1", row: 0, col: 0 })).toMatchObject({
      resolved: 3,
      style: { bold: true },
    });
    expect(store.getFormula({ sheet: "s1", row: 1, col: 0 })).toBe("=A1+1");
    expect(store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).toBe(4);
    expect(store.getRefTarget({ sheet: "s1", row: 2, col: 0 })).toEqual({
      sheet: "s1",
      row: 0,
      col: 0,
    });
    expect(store.getPagedStats("s1")).toMatchObject({
      loadedCells: 3,
      dirtyCells: 0,
    });
    expect(store.getCellLoadState({ sheet: "s1", row: 0, col: 0 })).toBe("loaded-value");

    const rejected = grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s1", row: 0, col: 0 },
          value: { kind: "literal", value: 10 },
        },
        {
          op: "set",
          addr: { sheet: "s1", row: 1, col: 0 },
          value: { kind: "literal", value: 20 },
        },
      ],
    });
    expect(rejected).toMatchObject({
      status: "rejected",
      epoch: 0,
      issues: [{ resource: "paged-dirty-cells", actual: 2, max: 1 }],
    });
    expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe(3);
    expect(store.getCell({ sheet: "s1", row: 1, col: 0 }).resolved).toBe(4);
    expect(store.getPagedStats("s1").dirtyCells).toBe(0);
    grid.destroy();
  });

  it("applies remote operations observably without local history", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const grid = createGridFromSnapshot(host, richSnapshot());
    const events: ChangeEvent[] = [];
    grid.on("change", (event) => events.push(event));
    const canvas = host.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("grid canvas missing");
    const context = canvas.getContext("2d") as unknown as RecordingContext2D;
    const paintsBefore = context.calls.fillText ?? 0;

    const result = grid.applyRemoteOperations([
      {
        op: "set",
        addr: { sheet: "source", row: 0, col: 0 },
        value: { kind: "literal", value: 8 },
      },
    ]);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    expect(result.status).toBe("applied");
    expect(events).toHaveLength(1);
    expect(events[0]?.source).toBe("remote");
    expect(events[0]?.transaction.patches).toHaveLength(1);
    expect(grid.store.getCell({ sheet: "summary", row: 0, col: 0 }).resolved).toBe(9);
    expect(grid.store.getCell({ sheet: "summary", row: 0, col: 1 }).resolved).toBe(9);
    expect(context.calls.fillText ?? 0).toBeGreaterThan(paintsBefore);
    grid.undo();
    expect(grid.store.getCell({ sheet: "source", row: 0, col: 0 }).resolved).toBe(8);
    grid.destroy();
  });

  it("persists operations through the cancellable in-memory reference adapter", async () => {
    const adapter = new MemoryPersistenceAdapter(richSnapshot());
    const loaded = await adapter.load("doc-1");
    expect(loaded.documentId).toBe("doc-1");
    await expect(adapter.load("missing")).rejects.toMatchObject({ code: "not-found" });
    await expect(
      adapter.commit({
        documentId: "doc-1",
        baseVersion: 7,
        clientMutationId: "invalid-1",
        operations: [
          {
            op: "set",
            addr: { sheet: "source", row: 99, col: 0 },
            value: { kind: "literal", value: 1 },
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "commit-rejected" });

    const response = await adapter.commit({
      documentId: "doc-1",
      baseVersion: 7,
      clientMutationId: "valid-1",
      operations: [
        {
          op: "set",
          addr: { sheet: "source", row: 0, col: 0 },
          value: { kind: "literal", value: 12 },
        },
      ],
    });
    expect(response.status).toBe("applied");

    const secondHost = document.createElement("div");
    document.body.appendChild(secondHost);
    const second = createGridFromSnapshot(secondHost, await adapter.load("doc-1"));
    expect(second.store.getCell({ sheet: "source", row: 0, col: 0 }).resolved).toBe(12);
    expect(second.store.getCell({ sheet: "summary", row: 0, col: 0 }).resolved).toBe(13);
    second.destroy();
    const controller = new AbortController();
    controller.abort("test cancellation");
    await expect(adapter.load("doc-1", controller.signal)).rejects.toMatchObject({
      code: "aborted",
    });
    await expect(
      adapter.commit({
        documentId: "doc-1",
        baseVersion: 8,
        clientMutationId: "aborted-1",
        operations: [],
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "aborted" });
  });
});
