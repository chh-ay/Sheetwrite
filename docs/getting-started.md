# Getting started

[Docs index](./README.md)

## Install

Sheetwrite uses [bun](https://bun.sh) as its package manager (and test runner and
bundler driver). Add the engine and the WASM data store:

```sh
bun add @sheetwrite/core @sheetwrite/wasm
```

Add a framework adapter only if you use one:

```sh
bun add @sheetwrite/react   # peer: react >= 18
bun add @sheetwrite/vue     # peer: vue >= 3.4
bun add @sheetwrite/svelte  # peer: svelte >= 5
```

Inside this repository the packages are wired together as bun workspaces; run
`bun install` at the root, then `bun run build` to build the WASM binary and the
TypeScript libraries before running an example.

## Load the WASM engine

The data store is a WebAssembly module that must be loaded **once** before the
first grid is created. `initSheetwrite` is async; `createGrid` is synchronous and
throws if you call it first:

```
Sheetwrite: await initSheetwrite() before createGrid()
```

`initSheetwrite` forwards its argument to the WASM loader, so it accepts anything
the loader does:

```ts
initSheetwrite(source?: BufferSource | URL | string | Request | WebAssembly.Module): Promise<void>
```

In a bundler, import the `.wasm` file as an asset and hand the resulting URL to
`initSheetwrite`. The published binary is exposed at the `@sheetwrite/wasm/wasm`
subpath. The asset-import syntax is bundler-specific:

```ts
// bun (import attribute) — used by examples/vanilla and examples/react
import wasmUrl from "@sheetwrite/wasm/wasm" with { type: "file" };

// Vite / Rollup — used by examples/svelte
import wasmUrl from "@sheetwrite/wasm/wasm?url";

await initSheetwrite(wasmUrl);
```

Both forms resolve `wasmUrl` to a string the browser can fetch. The in-repo
examples import the built binary by relative path
(`../../../packages/wasm/pkg/sheetwrite_wasm_bg.wasm`); published consumers use
the `@sheetwrite/wasm/wasm` subpath above.

## A minimal grid

The host must be a sized element — the grid fills it and manages its own internal
scrolling. Import the stylesheet once for the container chrome and CSS custom
properties.

```ts
import { createGrid, initSheetwrite, type Workbook } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";
import wasmUrl from "@sheetwrite/wasm/wasm" with { type: "file" };

await initSheetwrite(wasmUrl);

const workbook: Workbook = {
  activeSheet: "sheet1",
  sheets: [
    {
      id: "sheet1",
      name: "Sheet 1",
      rowCount: 3,
      columns: [
        { key: "name", header: "Name", width: 200, type: "text" },
        { key: "qty", header: "Qty", width: 100, type: "number" },
      ],
    },
  ],
};

const host = document.getElementById("app");
if (!host) throw new Error("missing #app host element");

const grid = createGrid(host, {
  workbook,
  data: {
    rowCount: 3,
    columns: {
      name: ["Widget", "Gadget", "Gizmo"],
      qty: [12, 7, 25],
    },
  },
  config: { toolbar: true },
});
```

Give the host a real size in CSS, e.g.:

```css
#app {
  height: 100%;
  min-height: 0; /* so it can shrink inside a flex column */
}
```

`createGrid(host, opts)` returns a [`Grid`](./configuration.md#grid-instance)
handle. Tear it down with `grid.destroy()` when the host goes away (the framework
adapters do this for you).

## Where the data comes from

A sheet declares its shape (`columns`, `rowCount`) in the `Workbook`. The actual
cell values arrive through one of two inputs — pass at most one:

- **`data: ColumnarData`** — eager, in-memory, column-major. Best for small to
  medium sheets you already hold in memory.

  ```ts
  const data: ColumnarData = {
    rowCount: 3,
    columns: {
      name: ["Widget", "Gadget", "Gizmo"],
      qty: [12, 7, 25],
    },
  };
  ```

- **`datasource: DataSource`** — lazy, paged, async. The grid calls `getRows`
  only for the window it needs as you scroll; placeholders show until each page
  resolves. This is how the `examples/vanilla` app serves 100,000 rows.

  ```ts
  const datasource: DataSource = {
    rowCount: () => 100_000,
    getRows: async (_sheet, start, end) => {
      const rows: RowData[] = [];
      for (let r = start; r < end; r++) {
        rows.push({ name: `Item ${r + 1}`, qty: (r % 50) + 1 });
      }
      return rows;
    },
  };

  const grid = createGrid(host, { workbook, datasource });
  ```

Each `RowData` is keyed by the column `key`, and a value may be a scalar
(`string | number | null`) or a full [`CellValue`](./concepts.md#cell-values).
Named column titles are not chrome — see
[the field-header pattern](./concepts.md#headers-letters-vs-field-names) for how
`examples/vanilla` styles a title row in row 0.

## Next steps

- [Concepts](./concepts.md) — how rendering and the store fit together.
- [Configuration](./configuration.md) — every option and method.
- [Framework integration](./framework-integration.md) — React, Vue, Svelte, and SSR-safe setups.
