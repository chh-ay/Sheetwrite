---
title: React
description: Integrate Sheetwrite with React ownership, readiness, and controlled resets.
---

`@sheetwrite/react` initializes WASM after client mount. Use `Sheetwrite` for the simple `columns` and `defaultRows` contract; use `SheetwriteGrid` when the host supplies a `Workbook` plus eager data or a datasource.

`onGridChange` reports committed grid changes. `onReady` receives `{ grid, generation, reason }` after the forwarded ref is assigned. Replacing reset-sensitive inputs creates a new generation; destroy persistence/sync coordinators attached to the previous grid.

```tsx partial="requires application-owned save state" title="React adapter"
import { Sheetwrite, type GridReadyEvent, type SimpleColumn } from "@sheetwrite/react";
import type { Transaction } from "@sheetwrite/core";
import "@sheetwrite/react/styles.css";

type Row = { name: string; amount: number };

interface SheetProps {
  columns: readonly SimpleColumn<Row>[];
  rows: readonly Row[];
  save: (transaction: Transaction) => void;
  onReady: (event: GridReadyEvent) => void;
}

export function Sheet({ columns, rows, save, onReady }: SheetProps) {
  return (
    <Sheetwrite
      columns={columns}
      defaultRows={rows}
      onGridChange={(event) => save(event.transaction)}
      onReady={onReady}
    />
  );
}
```

Server rendering the component does not initialize WASM. Mount it in a client component in frameworks that render on the server.

- [Run the React example](/react/)
- [Lifecycle and reset semantics](/docs/frameworks/lifecycle/)
- [`@sheetwrite/react` API](/docs/api/react/)
