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
| [Concepts](./concepts.md) | Runtime ownership, canvas/WASM storage, virtualization, document snapshots/operations, derived formula values, and session state. |
| [Configuration](./configuration.md) | Every `GridOptions` and `GridConfig` field with type and default, plus the `Grid` instance methods and events. |
| [Styling](./styling.md) | `Theme` and `DEFAULT_THEME`, the `--sheetwrite-*` CSS custom properties and `@sheetwrite/core/styles.css`, `CellStyle` / per-side borders, and `numberFormat`. |
| [Formulas](./formulas.md) | The A1 formula dialect: references and ranges, operators, the function set, cycle detection, point-mode, and reference rewriting. |
| [Data operations](./data-operations.md) | Composable non-mutating sort/filter views, hidden rows/groups, frozen panes, zoom, aggregates, and CSV / TSV / XLSX import/export. |
| [Interaction](./interaction.md) | Selection, keyboard navigation, IME-safe inline editing, rich clipboard interop, validation editors, protection policy, the toolbar, merged cells, and drag-to-fill. |
| [Accessibility](./accessibility.md) | The ARIA grid shadow tree and its visible-window limitation. |
| [Spreadsheet shell example](../examples/site/src/pages/svelte.astro) | Source for composing the framework-neutral `@sheetwrite/core/shell` toolbar, name box, formula bar, status, and grid through Svelte. |
| [Framework integration](./framework-integration.md) | `@sheetwrite/react`, `@sheetwrite/vue`, `@sheetwrite/svelte`, and client-only recipes for Next.js, Nuxt, and SvelteKit. |
| [Worker rendering](./worker-rendering.md) | `renderer: "worker"`, OffscreenCanvas, and the automatic main-thread fallback. |
| [Offline and collaboration](./collaboration.md) | Versioned persistence, mutation acknowledgements, durable IndexedDB pending work, conflict reload/rebase, presence, revisions, and comments. |

## Capability boundaries

| Area | Shipped contract | Deliberate boundary |
| --- | --- | --- |
| Documents | Schema-versioned `WorkbookSnapshot`; exhaustive `DocumentOp` reducer; stable sheet IDs; formula source, styles, validation, protection, notes, groups, filters, and names | Selection, scroll, caret, search, temporary overlays, read-only policy, and local zoom are session state |
| Persistence | Host `PersistenceAdapter`; server versions; stable mutation IDs; applied/duplicate acknowledgement; ordered remote operations; optional IndexedDB pending storage | Core embeds no database, endpoint, authentication, authorization, or automatic ambiguous structural merge |
| Formulas | 53 accepted names across aggregate, logical, math, text, date, criteria, and lookup families; booleans, errors, dates, cross-sheet references, and scoped names | No dynamic arrays/spills, `IMPORT*`, custom JavaScript, random functions, charts, or pivot tables |
| Data loading | Eager columnar data or cancellable datasource pages carrying literals, formulas, references, and styles; dense or allocation-lazy paged storage | Full-sheet queries/exports remain incomplete until required datasource pages are loaded |
| Formatting and interaction | Font/alignment/wrap, colors, per-side borders, number/date formats, conditional formats, rich clipboard, validation editors, protected-range UX, notes, merges, and fill | Protection is client UX policy, never server authorization; unsupported external clipboard styles are dropped |
| XLSX | Table interchange for the active sheet; workbook round-trip for sheets/formulas/styles/merges/dimensions/frozen panes/names plus Sheetwrite metadata | Not every Excel feature maps; warnings report flattening or dropped unsupported workbook features |
| Collaboration | Server sequencing, durable optimistic edits, presence, revision/comment adapters, and conservative non-overlapping rebase | No bundled server and no CRDT/general OT; ambiguous structural/formula conflicts require host UX |

The [formula matrix](./formulas.md#compatibility-matrix) mirrors the Rust parser
table; the [XLSX matrix](./data-operations.md#xlsx-compatibility) and feature
pages above are the detailed compatibility sources. Sheetwrite is an embeddable
spreadsheet engine, not a claim of Google Sheets or Excel feature parity.

New to the project? Read [Getting started](./getting-started.md), then
[Concepts](./concepts.md).
