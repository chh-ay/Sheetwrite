# Getting started

[Docs index](./README.md)

## Install

Install the engine and the WASM data store with your package manager:

```sh
npm install @sheetwrite/core @sheetwrite/wasm
pnpm add    @sheetwrite/core @sheetwrite/wasm
yarn add    @sheetwrite/core @sheetwrite/wasm
bun add     @sheetwrite/core @sheetwrite/wasm
```

Add a framework adapter only if you use one (same command shape with your
package manager):

```sh
npm install @sheetwrite/react   # peer: react >= 18
npm install @sheetwrite/vue     # peer: vue >= 3.4
npm install @sheetwrite/svelte  # peer: svelte >= 5
```

[Bun](https://bun.sh) is this repository's toolchain (workspaces, tests,
builds) — it is NOT a consumer requirement; any package manager and bundler
work. Inside this repository run `bun install` at the root, then
`bun run build` to build the WASM binary and the TypeScript libraries before
running an example.

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

`initSheetwrite` is re-entrant: concurrent same-source calls share one
initialization, repeat calls after success are no-ops, a concurrent call with a
*different* source rejects (it's a config bug), and a failed init is retryable
with a corrected source. `isSheetwriteReady(): boolean` reports whether
initialization has completed — useful for SSR guards and suspense-style UIs.

**Try zero-config first.** With no argument, the WASM loader resolves the
binary relative to its own module (`new URL(..., import.meta.url)` inside the
generated glue), and Vite and webpack/Next.js rewrite that into an emitted,
fingerprinted asset — no URL plumbing at all:

```ts
await initSheetwrite(); // runtime-verified on Vite and webpack production builds
```

Pass an explicit URL only when your bundler mangles module URLs (e.g.
bundling to a single file) or you serve the binary yourself. The two
published assets are the `.wasm` binary (`@sheetwrite/wasm/wasm` subpath)
and, if you use the worker renderer, the worker module
(`@sheetwrite/core/worker` subpath, see
[Worker rendering](./worker-rendering.md)). The canonical per-bundler matrix:

| Bundler / runtime | WASM URL | Worker URL |
|---|---|---|
| Vite / Astro / SvelteKit / Nuxt (vite) | `import wasmUrl from "@sheetwrite/wasm/wasm?url"` ¹ | `import workerUrl from "@sheetwrite/core/worker?worker&url"` ¹ |
| Bun bundler | `import wasmUrl from "@sheetwrite/wasm/wasm" with { type: "file" }` ² | public-copy of the whole `dist/` ⁴ (see [Worker rendering](./worker-rendering.md#enabling-it)) |
| webpack 5 / Next.js | `new URL("@sheetwrite/wasm/wasm", import.meta.url)` ¹ ³ | public-copy of the whole `dist/` ⁴ (see [Worker rendering](./worker-rendering.md#enabling-it)) |
| Any (portable) | copy `node_modules/@sheetwrite/wasm/pkg/sheetwrite_wasm_bg.wasm` to your public assets; pass its served URL string ⁴ | copy `node_modules/@sheetwrite/core/dist/` to your public assets; pass the served `…/worker.js` URL ⁴ |

¹ Machine-verified by the fixture builds in `test/bundler-fixtures/`
(`bun run verify:bundlers`).
² Bun is the repo toolchain; the form is Bun-specific import-attribute syntax.
³ webpack (and therefore Next.js) needs the WASM loader's Node-only,
runtime-guarded `node:fs/promises` import excluded from browser bundles:
`new webpack.IgnorePlugin({ resourceRegExp: /^node:fs\/promises$/ })` — without
it the build fails with `UnhandledSchemeError: Reading from "node:fs/promises"`.
The ignored branch only executes under Node, so browser bundles are unaffected.
⁴ Reasoned, not fixture-verified: static copies aren't exercised by the
compile fixtures. The whole-`dist/` worker copy is required because
`dist/worker.js` is an ES module with relative sibling imports.

```ts
// Vite / Astro / SvelteKit — used by the in-repo examples site (examples/site)
import wasmUrl from "@sheetwrite/wasm/wasm?url";

// Bun bundler (import attribute) — Bun-specific syntax
import wasmUrl from "@sheetwrite/wasm/wasm" with { type: "file" };

// webpack 5 / Next.js (asset module; webpack rewrites the bare specifier)
const wasmUrl = new URL("@sheetwrite/wasm/wasm", import.meta.url);

// Portable: copy the binary into public assets at build time…
//   cp node_modules/@sheetwrite/wasm/pkg/sheetwrite_wasm_bg.wasm public/
// …and pass the served path:
const wasmUrl = "/sheetwrite_wasm_bg.wasm";

await initSheetwrite(wasmUrl);
```

All forms resolve to something `initSheetwrite` accepts. The in-repo examples
site is the verified Vite reference (`examples/site/src/lib/sheetwrite.ts`).
Verification status per row lives in `test/bundler-fixtures/README.md` —
rows are machine-verified by those fixture builds unless footnoted otherwise.

## A minimal grid

The host must be a sized element — the grid fills it and manages its own internal
scrolling. Import the stylesheet once for the container chrome and CSS custom
properties.

```ts
import { createGrid, initSheetwrite, type Workbook } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";
// Vite-family form; see the per-bundler matrix above for Bun/webpack/portable.
import wasmUrl from "@sheetwrite/wasm/wasm?url";

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
  resolves. This is how the Vue example page streams 1,000,000 virtual rows.

  ```ts
  // The sheet's `rowCount` sets the scrollable extent; the datasource fills
  // only the visible window on demand (here a 100,000-row sheet).
  const workbook: Workbook = {
    activeSheet: "sheet1",
    sheets: [
      {
        id: "sheet1",
        name: "Sheet 1",
        rowCount: 100_000,
        columns: [
          { key: "name", header: "Name", width: 200, type: "text" },
          { key: "qty", header: "Qty", width: 100, type: "number" },
        ],
      },
    ],
  };

  const datasource: DataSource = {
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
the vanilla example page styles a title row in row 0.

## Next steps

- [Concepts](./concepts.md) — how rendering and the store fit together.
- [Configuration](./configuration.md) — every option and method.
- [Framework integration](./framework-integration.md) — React, Vue, Svelte, and SSR-safe setups.
