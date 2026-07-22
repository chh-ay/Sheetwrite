import { createRowBridge, type Grid, type RowBridgeProjection } from "@sheetwrite/core";
import { createSimpleGridInput } from "@sheetwrite/core/adapter";
import { SheetwriteGrid } from "@sheetwrite/react";
import { useMemo, useRef, useState } from "react";

interface HostEntity extends Record<string, string | number | boolean | null> {
  id: string;
  name: string;
  amount: number;
  region: string;
}

const columns = [
  { key: "name" as const, title: "Customer" },
  { key: "amount" as const, title: "Amount", type: "number" as const },
  { key: "region" as const, title: "Region" },
];
const initialRows: HostEntity[] = [
  { id: "account-a", name: "Ada", amount: 120, region: "North" },
  { id: "account-b", name: "Lin", amount: 75, region: "South" },
  { id: "account-c", name: "Maya", amount: 210, region: "North" },
];

export default function HostRowsShowcase() {
  const grid = useRef<Grid | null>(null);
  const nextId = useRef(4);
  const denyNext = useRef(false);
  const [entities, setEntities] = useState(() => new Map(initialRows.map((row) => [row.id, row])));
  const [log, setLog] = useState<string[]>([]);
  const input = useMemo(() => {
    const value = createSimpleGridInput({
      columns,
      defaultRows: initialRows,
      sheetName: "Accounts",
    });
    value.workbook.sheets[0]!.protectedRanges = [
      {
        id: "host-check",
        range: { sheet: "sheet1", start: { row: 0, col: 0 }, end: { row: 2, col: 2 } },
      },
    ];
    return value;
  }, []);
  const bridge = useMemo(
    () =>
      createRowBridge({
        columns,
        defaultRows: initialRows,
        getRowId: (row) => row.id,
        createRowId: () => `account-${nextId.current++}`,
      }),
    [],
  );

  const applyProjection = (projection: RowBridgeProjection<string>) => {
    setLog((entries) =>
      [`${projection.status} · ${projection.transaction.id}`, ...entries].slice(0, 8),
    );
    setEntities((current) => {
      const next = new Map(current);
      for (const delta of projection.deltas) {
        if (delta.kind === "cell") {
          const { rowId, columnKey, next: value } = delta.cell;
          const row = rowId === null ? undefined : next.get(rowId);
          if (row && columnKey && value?.kind === "literal") {
            next.set(row.id, { ...row, [columnKey]: value.value });
          }
        } else if (delta.kind === "row-structure" && delta.action === "insert") {
          for (const rowId of delta.inserted) {
            if (rowId !== null)
              next.set(rowId, { id: rowId, name: "New account", amount: 0, region: "North" });
          }
        } else if (delta.kind === "row-structure" && delta.action === "delete") {
          for (const rowId of delta.removed) if (rowId !== null) next.delete(rowId);
        }
      }
      return next;
    });
  };

  const remoteUpdate = () => {
    grid.current?.applyRemoteOperations([
      {
        op: "set",
        addr: { sheet: "sheet1", row: 0, col: 1 },
        value: { kind: "literal", value: 135 },
      },
    ]);
  };

  return (
    <main className="host-rows-showcase" data-testid="host-rows-showcase">
      <header>
        <p className="eyebrow">Host-owned rows</p>
        <h1>One grid, one entity store</h1>
        <p>
          Sort and filter only change the view. Every committed edit still names the same account
          row.
        </p>
      </header>
      <div className="host-row-actions">
        <button type="button" onClick={() => grid.current?.sortBy(1, false)}>
          Sort amount
        </button>
        <button type="button" onClick={() => grid.current?.filterBy(2, "North")}>
          Filter North
        </button>
        <button type="button" onClick={() => grid.current?.insertRows(1)}>
          Insert row
        </button>
        <button type="button" onClick={() => grid.current?.removeRows(1)}>
          Delete row
        </button>
        <button
          type="button"
          onClick={() => {
            denyNext.current = true;
            grid.current?.applyTransaction({
              patches: [
                {
                  op: "set",
                  addr: { sheet: "sheet1", row: 0, col: 1 },
                  value: { kind: "literal", value: 999 },
                },
              ],
            });
          }}
        >
          Reject next edit
        </button>
        <button
          type="button"
          onClick={() => {
            const result = bridge.reconcile({
              status: "transformed",
              transactionId: "server-normalized",
              operations: [
                {
                  op: "set",
                  addr: { sheet: "sheet1", row: 1, col: 1 },
                  value: { kind: "literal", value: 80 },
                },
              ],
            });
            applyProjection(result);
          }}
        >
          Transformed accept
        </button>
        <button type="button" onClick={remoteUpdate}>
          Remote update
        </button>
      </div>
      <SheetwriteGrid
        {...input}
        ref={grid}
        rowBridge={bridge}
        onRowDelta={applyProjection}
        onMutationRejected={() =>
          applyProjection(
            bridge.reconcile({
              status: "rejected",
              transactionId: "rejected-showcase",
              operations: [],
            }),
          )
        }
        protectionResolver={() => {
          if (!denyNext.current) return "allow";
          denyNext.current = false;
          return "deny";
        }}
        height={360}
      />
      <section className="host-row-proof">
        <div>
          <h2>Host entities</h2>
          <ul data-testid="host-entity-list">
            {[...entities.values()].map((row) => (
              <li key={row.id}>
                {row.id}: {row.name} · {row.amount} · {row.region}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2>Delta log</h2>
          <ol data-testid="host-delta-log">
            {log.map((entry, index) => (
              <li key={`${entry}-${index}`}>{entry}</li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}
