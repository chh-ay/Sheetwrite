---
title: React
description: Integrate Sheetwrite with React ownership, readiness, and controlled resets.
---

`@sheetwrite/react` initializes WASM after client mount. Use `Sheetwrite` for the simple `columns` and `defaultRows` contract; use `SheetwriteGrid` when the host supplies a `Workbook` plus eager data or a datasource.

`onGridChange` reports committed grid changes. `onReady` receives `{ grid, generation, reason }` after the forwarded ref is assigned. Replacing reset-sensitive inputs creates a new generation; destroy persistence/sync coordinators attached to the previous grid.

```tsx partial="requires component-owned columns and rows" title="React adapter"
import { Sheetwrite } from "@sheetwrite/react";
import "@sheetwrite/react/styles.css";

<Sheetwrite
  columns={columns}
  defaultRows={rows}
  onGridChange={(event) => save(event.transaction)}
  onReady={({ grid, generation, reason }) => {
    console.log(grid.rendererKind, generation, reason);
  }}
/>;
```

Server rendering the component does not initialize WASM. Mount it in a client component in frameworks that render on the server.

- [Run the React example](/react/)
- [Lifecycle and reset semantics](/docs/frameworks/lifecycle/)
- [`@sheetwrite/react` API](/docs/api/react/)
