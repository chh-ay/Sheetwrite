---
title: Vanilla JavaScript
description: Own Sheetwrite initialization and Grid lifetime without a framework adapter.
---

Use `@sheetwrite/core` when the host owns DOM lifetime directly. Call `initSheetwrite()` on the client, pass an existing element to `createGrid`, and retain the returned `Grid` for events and commands.

```ts partial="requires workbook and data declarations" title="Vanilla lifecycle"
await initSheetwrite();
const grid = createGrid(host, { workbook, data });
const off = grid.on("change", persistChange);

// Permanent teardown:
off();
grid.destroy();
```

A datasource-backed grid may use dense storage or allocation-lazy paged storage. Full-sheet operations can throw `IncompleteDataError` until every required page is loaded. Worker rendering automatically falls back to the main-thread canvas when capabilities or startup fail; observe `renderer-fallback` if the host needs to report that transition.

- [Run the Vanilla example](/vanilla/)
- [Installation and explicit WASM sources](/docs/start/installation/)
- [Runtime ownership](/docs/concepts/runtime-ownership/)
- [`@sheetwrite/core` API](/docs/api/core/)
