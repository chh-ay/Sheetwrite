# Sheetwrite documentation

Sheetwrite is a framework-agnostic, high-performance spreadsheet grid. It paints
to a single `<canvas>` and keeps its data in a Rust → WebAssembly columnar store,
so a sheet of 100k+ rows scrolls, edits, and exports without ever materializing a
DOM node per cell. The core (`@sheetwrite/core`) is imperative and renderer-driven;
thin adapters wrap it for React, Vue, and Svelte. These pages cover installation,
the architecture, every configuration knob, and each shipped feature, with
copy-pasteable snippets grounded in the runnable examples under `examples/`.

## Contents

| Page | What it covers |
| --- | --- |
| [Getting started](./getting-started.md) | Install with bun, `initSheetwrite` + the bundler WASM asset import, a minimal `createGrid`, and where row data comes from. |
| [Concepts](./concepts.md) | Canvas + WASM columnar store, virtualization and scaled scroll, the `Store` contract, transactions/patches, and the column-letter vs. row-1 field-header model. |
| [Configuration](./configuration.md) | Every `GridOptions` and `GridConfig` field with type and default, plus the `Grid` instance methods and events. |
| [Styling](./styling.md) | `Theme` and `DEFAULT_THEME`, the `--sheetwrite-*` CSS custom properties and `@sheetwrite/core/styles.css`, `CellStyle` / per-side borders, and `numberFormat`. |
| [Formulas](./formulas.md) | The A1 formula dialect: references and ranges, operators, the function set, cycle detection, point-mode, and reference rewriting. |
| [Data operations](./data-operations.md) | Composable non-mutating sort/filter views, hidden rows/groups, frozen panes, zoom, aggregates, and CSV / TSV / XLSX import/export. |
| [Interaction](./interaction.md) | Selection, keyboard navigation, IME-safe inline editing, rich clipboard interop, validation editors, protection policy, the toolbar, merged cells, and drag-to-fill. |
| [Accessibility](./accessibility.md) | The ARIA grid shadow tree and its visible-window limitation. |
| [Spreadsheet shell](./shell.md) | `@sheetwrite/core/shell`: the full Sheets-style shell and the composable toolbar / name-box / formula-bar / status pieces. |
| [Framework integration](./framework-integration.md) | `@sheetwrite/react`, `@sheetwrite/vue`, `@sheetwrite/svelte`, and client-only recipes for Next.js, Nuxt, and SvelteKit. |
| [Worker rendering](./worker-rendering.md) | `renderer: "worker"`, OffscreenCanvas, and the automatic main-thread fallback. |

New to the project? Read [Getting started](./getting-started.md), then
[Concepts](./concepts.md).
