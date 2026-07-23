import { beforeAll, describe, expect, it } from "bun:test";
import { initSheetwrite } from "../src/grid.js";
import { createRowBridge } from "../src/row-bridge.js";
import { SheetwriteStore } from "../src/store.js";
import type { CellValue } from "../src/types/cell.js";
import type { DocumentOp, Workbook } from "../src/types/document.js";
import type { ChangeEvent } from "../src/types/transaction.js";

interface HostRow extends Record<string, string | number | boolean | null> {
  id: string;
  name: string;
  amount: number;
}

const columns = [{ key: "name" as const }, { key: "amount" as const }];
const rows: HostRow[] = [
  { id: "row-a", name: "A", amount: 1 },
  { id: "row-b", name: "B", amount: 2 },
  { id: "row-c", name: "C", amount: 3 },
];
const literal = (value: string | number | boolean | null): CellValue => ({
  kind: "literal",
  value,
});

function event(
  patches: DocumentOp[],
  changes: ChangeEvent["changes"] = [],
  source: ChangeEvent["source"] = "local",
  epoch?: number,
): ChangeEvent {
  return {
    transaction: { patches },
    changes,
    commitReason: "api",
    source,
    ...(epoch === undefined ? {} : { epoch }),
  };
}

beforeAll(async () => {
  await initSheetwrite();
});

describe("RowBridge", () => {
  it("admits unique stable IDs and rejects missing or duplicate identities", () => {
    const bridge = createRowBridge({ columns, defaultRows: rows, getRowId: (row) => row.id });
    expect(bridge.rowIds()).toEqual(["row-a", "row-b", "row-c"]);
    expect([...rows].reverse().map((row) => row.id)).toEqual(["row-c", "row-b", "row-a"]);
    expect(bridge.rowIds()).toEqual(["row-a", "row-b", "row-c"]);

    expect(() =>
      createRowBridge({
        columns,
        defaultRows: rows,
        getRowId: () => "same",
      }),
    ).toThrow("duplicate row ID");
    expect(() =>
      createRowBridge({
        columns,
        defaultRows: rows,
        getRowId: () => undefined as never,
      }),
    ).toThrow("stable string or number");
  });

  it("attributes repeated writes to the same cell in operation order", () => {
    const bridge = createRowBridge({ columns, defaultRows: rows, getRowId: (row) => row.id });
    const addr = { sheet: "sheet1", row: 1, col: 0 };
    const first: DocumentOp = { op: "set", addr, value: literal("B2") };
    const second: DocumentOp = { op: "set", addr, value: literal("B3") };
    const projection = bridge.project(
      event(
        [first, second],
        [
          { addr, oldValue: literal("B"), newValue: literal("B2") },
          { addr, oldValue: literal("B2"), newValue: literal("B3") },
        ],
      ),
    );
    expect(projection.deltas.map((delta) => delta.kind)).toEqual(["cell", "cell"]);
    const cells = projection.deltas.flatMap((delta) => (delta.kind === "cell" ? [delta.cell] : []));
    expect(cells).toEqual([
      expect.objectContaining({
        rowId: "row-b",
        columnKey: "name",
        previous: literal("B"),
        next: literal("B2"),
      }),
      expect.objectContaining({
        rowId: "row-b",
        columnKey: "name",
        previous: literal("B2"),
        next: literal("B3"),
      }),
    ]);
  });

  it("keeps data-space identities through insert, move, and delete", () => {
    const bridge = createRowBridge({
      columns,
      defaultRows: rows,
      getRowId: (row) => row.id,
      createRowId: ({ transactionId, offset }) => `${transactionId}-${offset}`,
    });
    const inserted = bridge.project(
      event([{ op: "addRows", sheet: "sheet1", at: 1, count: 2 }], [], "local", 1),
    );
    const insertedIds =
      inserted.deltas[0]?.kind === "row-structure" ? inserted.deltas[0].inserted : [];
    expect(insertedIds).toHaveLength(2);
    expect(bridge.rowIds()).toEqual(["row-a", ...insertedIds, "row-b", "row-c"]);

    bridge.project(
      event([{ op: "moveRows", sheet: "sheet1", from: 3, count: 1, to: 0 }], [], "local", 2),
    );
    expect(bridge.rowIds()).toEqual(["row-b", "row-a", ...insertedIds, "row-c"]);

    const removed = bridge.project(
      event([{ op: "removeRows", sheet: "sheet1", at: 1, count: 2 }], [], "local", 3),
    );
    expect(removed.deltas[0]).toEqual(
      expect.objectContaining({ kind: "row-structure", removed: ["row-a", insertedIds[0]] }),
    );
    expect(bridge.rowIds()).toEqual(["row-b", insertedIds[1]!, "row-c"]);
  });

  it("reconciles transformed, rejected, duplicate, out-of-order, and remote input without echoes", () => {
    const bridge = createRowBridge({ columns, defaultRows: rows, getRowId: (row) => row.id });
    const addr = { sheet: "sheet1", row: 0, col: 1 };
    const requested: DocumentOp[] = [{ op: "set", addr, value: literal(10) }];
    const canonical: DocumentOp[] = [{ op: "set", addr, value: literal(8) }];
    expect(
      bridge.reconcile({
        status: "transformed",
        transactionId: "local-1",
        requestedOperations: requested,
        event: event(canonical, [{ addr, oldValue: literal(1), newValue: literal(8) }], "local", 1),
      }).status,
    ).toBe("transformed");
    expect(
      bridge.reconcile({ status: "rejected", transactionId: "local-2", operations: requested })
        .deltas,
    ).toEqual([]);
    expect(
      bridge.reconcile({ status: "duplicate", transactionId: "local-1", operations: canonical })
        .status,
    ).toBe("duplicate");
    expect(
      bridge.reconcile({
        status: "accepted",
        transactionId: "old",
        version: 0,
        operations: requested,
      }).status,
    ).toBe("out-of-order");

    const echo = bridge.project(
      event(canonical, [{ addr, oldValue: literal(1), newValue: literal(8) }], "remote", 2),
    );
    expect(echo.status).toBe("duplicate");
    expect(echo.deltas).toEqual([]);
    const remote = bridge.project(
      event(
        [{ op: "set", addr, value: literal(9) }],
        [{ addr, oldValue: literal(8), newValue: literal(9) }],
        "remote",
        3,
      ),
    );
    expect(remote.status).toBe("remote");
    expect(remote.deltas).toHaveLength(1);
  });

  it("captures packed and clear before/after cells only when detailed capture is enabled", () => {
    const workbook: Workbook = {
      activeSheet: "sheet1",
      sheets: [
        {
          id: "sheet1",
          name: "Sheet 1",
          rowCount: 2,
          columns: [
            { key: "name", header: "Name", width: 100, type: "text" },
            { key: "amount", header: "Amount", width: 100, type: "number" },
          ],
        },
      ],
    };
    const store = new SheetwriteStore(workbook, {
      rowCount: 2,
      columns: { name: ["A", "B"], amount: [1, 2] },
    });
    const bridge = createRowBridge({
      columns,
      defaultRows: rows.slice(0, 2),
      getRowId: (row) => row.id,
    });
    const projections: ReturnType<typeof bridge.project>[] = [];
    store.setDetailedChangeCapture(true);
    store.on("change", (change) => projections.push(bridge.project(change)));

    store.applyTransaction({
      patches: [
        {
          op: "setBlock",
          range: { sheet: "sheet1", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
          block: { rowCount: 2, colCount: 1, values: ["AA", "BB"] },
        },
      ],
    });
    store.applyTransaction({
      patches: [
        {
          op: "clearRange",
          range: { sheet: "sheet1", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
        },
      ],
    });

    const range = projections[0]?.deltas[0];
    expect(
      range?.kind === "range"
        ? range.cells.map((cell) => [cell.rowId, cell.previous, cell.next])
        : [],
    ).toEqual([
      ["row-a", literal("A"), literal("AA")],
      ["row-b", literal("B"), literal("BB")],
    ]);
    const clear = projections[1]?.deltas[0];
    expect(
      clear?.kind === "clear" ? clear.cells.map((cell) => [cell.previous, cell.next]) : [],
    ).toEqual([
      [literal("AA"), literal(null)],
      [literal("BB"), literal(null)],
    ]);
  });
});
