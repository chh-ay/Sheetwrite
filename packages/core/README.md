# @sheetwrite/core

The imperative Sheetwrite engine for vanilla applications and advanced framework consumers.

## Install

```sh
bun add @sheetwrite/core
```

`@sheetwrite/wasm` is a runtime dependency and does not need to be installed separately.

## Usage

```ts
import { createGrid, initSheetwrite, type Workbook } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";

await initSheetwrite();

const workbook: Workbook = {
  activeSheet: "sheet1",
  sheets: [
    {
      id: "sheet1",
      name: "Products",
      rowCount: 2,
      columns: [
        { key: "name", header: "Name", width: 180, type: "text" },
        { key: "price", header: "Price", width: 100, type: "currency" },
      ],
    },
  ],
};

const grid = createGrid(document.querySelector("#grid")!, {
  workbook,
  data: {
    rowCount: 2,
    columns: { name: ["Notebook", "Pen"], price: [12.5, 2.25] },
  },
});
```

`initSheetwrite()` is re-entrant: concurrent calls share initialization, failures can be retried, and successful repeats are no-ops. Pass an explicit `BufferSource | URL | string | Request | WebAssembly.Module` only when controlling asset delivery for an unsupported or unusually configured bundler.

Framework users should normally install only `@sheetwrite/react`, `@sheetwrite/vue`, or `@sheetwrite/svelte` and import that package's `styles.css`; the adapters initialize WASM automatically.

## Optional XLSX support

Core includes CSV/TSV and the backend-neutral canonical XLSX contracts, but no
Excel library or concrete XLSX implementation. Install and register the
optional package before `grid.exportXlsx()`, a framework toolbar XLSX action,
or any table/workbook XLSX function:

```sh
bun add @sheetwrite/xlsx
```

```ts
import "@sheetwrite/xlsx/register";
import {
  fromXlsxTable,
  fromXlsxWorkbook,
  toXlsxTable,
  toXlsxWorkbook,
} from "@sheetwrite/core";
```

The table APIs exchange the first sheet with a synthesized header row. The
workbook APIs preserve multi-sheet `WorkbookSnapshot` semantics and use an
in-memory backend with a default 1,000,000-populated-cell limit. Without
registration, each core XLSX function throws an error telling the caller to
install `@sheetwrite/xlsx` and import `@sheetwrite/xlsx/register`.
