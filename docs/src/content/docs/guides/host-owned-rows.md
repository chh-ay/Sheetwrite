---
title: Keep app rows in your store
---

Use the row bridge when your app owns the row objects and Sheetwrite owns editing, history, sorting, and filtering. The bridge is optional. Without `getRowId`, `defaultRows` keeps its existing one-time, uncontrolled behavior.

```ts prelude="core" partial="requires surrounding host state" title="Host entity store"
import { createRowBridge, type RowBridgeProjection } from "@sheetwrite/core";

interface InvoiceRow {
  id: string;
  customer: string;
  total: number;
}

const entities = new Map<string, InvoiceRow>([
  ["invoice-1", { id: "invoice-1", customer: "Ada", total: 120 }],
  ["invoice-2", { id: "invoice-2", customer: "Lin", total: 75 }],
]);
const rows = [...entities.values()];
let nextId = 3;

const bridge = createRowBridge({
  columns: [{ key: "customer" }, { key: "total" }],
  defaultRows: rows,
  getRowId: (row) => row.id,
  createRowId: () => `invoice-${nextId++}`,
});

function applyProjection(projection: RowBridgeProjection<string>) {
  if (projection.status === "rejected" || projection.status === "duplicate") return;
  for (const delta of projection.deltas) {
    if (delta.kind === "cell") {
      const { rowId, columnKey, next } = delta.cell;
      if (rowId === null || columnKey === null || next?.kind !== "literal") continue;
      const row = entities.get(rowId);
      if (row) entities.set(rowId, { ...row, [columnKey]: next.value });
    }
    if (delta.kind === "row-structure" && delta.action === "delete") {
      for (const rowId of delta.removed) if (rowId !== null) entities.delete(rowId);
    }
    if (delta.kind === "row-structure" && delta.action === "insert") {
      for (const rowId of delta.inserted) {
        if (rowId !== null) entities.set(rowId, { id: rowId, customer: "", total: 0 });
      }
    }
  }
}
```

Attach the same bridge and callback in any adapter:

```tsx prelude="react" partial="requires surrounding component state" title="React adapter"
import {
  SheetwriteGrid,
  type RowBridge,
  type RowBridgeProjection,
  type SimpleColumn,
} from "@sheetwrite/react";

interface InvoiceRow {
  id: string;
  customer: string;
  total: number;
}

declare const columns: readonly SimpleColumn<InvoiceRow>[];
declare const rows: readonly InvoiceRow[];
declare const bridge: RowBridge<string>;
declare const applyProjection: (projection: RowBridgeProjection<string>) => void;
<SheetwriteGrid
  columns={columns}
  defaultRows={rows}
  rowBridge={bridge}
  onRowDelta={applyProjection}
  height={420}
/>
```

Vue emits `row-delta`; Svelte and the imperative controller use `onRowDelta`. All adapters call the same core bridge. Sorts, filters, and hidden rows only change the visible order, so emitted row IDs still refer to data-space rows.

Remote changes should enter through `grid.applyRemoteOperations(...)`. Their projections have `status: "remote"` and `source: "remote"`. An echoed local transaction is returned as `duplicate` with no deltas. For a server rejection or transformed acceptance, call `bridge.reconcile(...)` with the server result and the canonical applied operations. The bridge does not update your store automatically; your callback remains the only place that changes host rows.
