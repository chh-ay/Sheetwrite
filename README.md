# Sheetwrite

Framework-agnostic, high-performance canvas spreadsheet grid.

Sheetwrite renders to a `<canvas>` and keeps its cells in a Rust→WASM columnar
store, so it stays fast at 100k+ rows. The core is framework-agnostic; thin
React, Vue, and Svelte adapters wrap the same imperative engine.

## Features

- Canvas rendering backed by a Rust→WASM columnar store, virtualized for 100k+ rows (scaled scroll past the browser element-height cap).
- Formulas: A1 references and ranges (`A1:B3`), arithmetic and comparisons, `SUM`/`AVG`/`MIN`/`MAX`/`COUNT`/`IF`/`ABS`/`ROUND`/`SQRT`/`MOD`/`POW`/`AND`/`OR`/`NOT`, cycle detection, and point-mode entry.
- Multi-sheet workbooks with a tab bar and variable row heights.
- Selection (cell/range/row/column/multi), keyboard navigation, and IME-safe inline editing.
- Clipboard as TSV (formula-injection hardened).
- Non-mutating data views: single/multi-column sort, column filters, distinct-value scans, hidden rows, row groups, and aggregates.
- Frozen panes and zoom without mutating workbook row heights or column widths.
- Import/export: CSV, TSV, and XLSX with pluggable XLSX import/export backends.
- Per-side cell borders and Excel-style number formats (e.g. `#,##0.00`).
- Opt-in formatting toolbar (bold, italic, align, text/fill color, border, clear-format, merge, sort).
- Merged cells and a drag-to-fill handle (relative A1 refs shift by the delta; absolute `$A$1` parts preserved).
- Theming via a typed theme object and CSS custom properties.
- Accessibility: an ARIA grid shadow tree mirrors the visible window.
- Optional off-thread worker renderer (OffscreenCanvas) with main-thread fallback.
- React, Vue, and Svelte adapters.

## Install

```sh
bun add @sheetwrite/core @sheetwrite/wasm
```

Add a framework adapter if you use one, e.g. `bun add @sheetwrite/react`.

All packages are **ESM-only**: they ship ES modules exposed through a single
`default` export condition, with no CommonJS `require` build. Consume them from
an ESM context or through a bundler.

## Quick start (vanilla)

```ts
import { createGrid, initSheetwrite, type ColumnarData, type Workbook } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";
// Vite-family bundlers; Bun uses `... with { type: "file" }` — the full
// per-bundler matrix lives in docs/getting-started.md#load-the-wasm-engine.
import wasmUrl from "@sheetwrite/wasm/wasm?url";

const workbook: Workbook = {
  activeSheet: "sheet1",
  sheets: [
    {
      id: "sheet1",
      name: "Sheet 1",
      rowCount: 3,
      columns: [
        { key: "item", header: "Item", width: 200, type: "text" },
        { key: "qty", header: "Qty", width: 100, type: "number" },
      ],
    },
  ],
};

// Eager columnar input. For large sheets pass a paged `datasource` instead.
const data: ColumnarData = {
  rowCount: 3,
  columns: {
    item: ["Cable", "Adapter", "Mount"],
    qty: [3, 2, 5],
  },
};

// WASM must be ready before createGrid (which is synchronous).
await initSheetwrite(wasmUrl);

const host = document.getElementById("app");
if (!host) throw new Error("missing #app host element");

const grid = createGrid(host, { workbook, data, config: { toolbar: true } });
```

The host element needs an explicit size (for example a `height`); the grid fills its container.

## Packages

| Package | Description |
| --- | --- |
| `@sheetwrite/core` | The engine: canvas grid, columnar store, formulas, data views, export, and theming. |
| `@sheetwrite/wasm` | Rust→WASM columnar store and calc engine (consumed by core). |
| `@sheetwrite/react` | React `<SheetwriteGrid>` adapter. |
| `@sheetwrite/vue` | Vue 3 `<SheetwriteGrid>` adapter. |
| `@sheetwrite/svelte` | Svelte 5 `<SheetwriteGrid>` adapter. |

## Development

```sh
bun install            # install workspace dependencies
bun run build:wasm     # compile the Rust crate (wasm-pack build --target web)
bun run build          # build wasm, then core, react, and vue
bun run typecheck
bun run lint
bun test
bun run examples       # build packages, then serve every demo at one URL (Astro)
```

`bun run build:wasm` (and the `build` step that wraps it) requires `wasm-pack`
and the Rust toolchain pinned in `rust-toolchain.toml`. `bun run build` runs the
WASM build first, so a one-shot `bun run build` covers everything.

`bun run examples` starts the examples site (`examples/site`) — one Astro app
with a tab per demo: the vanilla Google-Sheets-style workbook, the theming lab,
and the React, Vue, and Svelte showcases.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) for architecture rules, local checks,
Changesets, and the release process. See [SECURITY.md](SECURITY.md) for private
vulnerability-reporting guidance; do not disclose security issues in public
issues.

## Documentation

See [docs/](docs/) for guides and the API reference.

## License

Sheetwrite is MIT licensed.
