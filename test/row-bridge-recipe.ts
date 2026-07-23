import {
  createRowBridge,
  type DocumentOp,
  type RowBridgeProjection,
} from "../packages/core/src/index.js";

interface Entity extends Record<string, string | number | boolean | null> {
  id: string;
  name: string;
  amount: number;
}

const entities = new Map<string, Entity>([
  ["entity-a", { id: "entity-a", name: "Ada", amount: 10 }],
  ["entity-b", { id: "entity-b", name: "Lin", amount: 20 }],
]);
const initialRows = [...entities.values()];
const bridge = createRowBridge({
  columns: [{ key: "name" }, { key: "amount" }],
  defaultRows: initialRows,
  getRowId: (row) => row.id,
});

const addr = { sheet: "sheet1", row: 1, col: 1 };
const operations: DocumentOp[] = [{ op: "set", addr, value: { kind: "literal", value: 25 } }];
const projection = bridge.project({
  transaction: { patches: operations },
  changes: [
    {
      addr,
      oldValue: { kind: "literal", value: 20 },
      newValue: { kind: "literal", value: 25 },
    },
  ],
  commitReason: "api",
  source: "local",
  epoch: 1,
});

function apply(result: RowBridgeProjection<string>) {
  for (const delta of result.deltas) {
    if (delta.kind !== "cell") continue;
    const { rowId, columnKey, next } = delta.cell;
    if (rowId === null || columnKey === null || next?.kind !== "literal") continue;
    const entity = entities.get(rowId);
    if (entity) entities.set(rowId, { ...entity, [columnKey]: next.value });
  }
}

apply(projection);
if (entities.get("entity-b")?.amount !== 25) throw new Error("row bridge recipe failed");
console.log("row bridge recipe passed");
