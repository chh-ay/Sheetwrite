# Configuration

[Docs index](./README.md)

Everything you pass to `createGrid(host, opts)` lives in `GridOptions`. This page
lists every field with its type and default, the optional toolbar `GridConfig`,
and the `Grid` instance API.

## GridOptions

```ts
createGrid(host: HTMLElement, opts: GridOptions): Grid
```

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `workbook` | `Workbook` | — (required) | Sheets, columns, row counts, and the `activeSheet` id. |
| `data` | `ColumnarData` | `undefined` | Eager, in-memory, column-major values. Pass this **or** `datasource`. |
| `datasource` | `DataSource` | `undefined` | Lazy, paged async source; rows fetched per visible window. |
| `renderer` | `"canvas" \| "worker"` | `"canvas"` | `"worker"` paints off-thread via OffscreenCanvas, falling back to canvas. See [Worker rendering](./worker-rendering.md). |
| `workerUrl` | `string \| URL` | `undefined` | Bundler-resolved worker entry for `renderer: "worker"`, e.g. `new URL("@sheetwrite/core/worker", import.meta.url)`. |
| `theme` | `Partial<Theme>` | `undefined` | Overrides merged over `DEFAULT_THEME` and any `--sheetwrite-*` CSS vars. See [Styling](./styling.md). |
| `readOnly` | `boolean` | `false` | When `true`, all mutating interactions (edit, clear, fill, paste, restyle) are disabled and the host gets `aria-readonly="true"`. |
| `renderers` | `Record<string, CellRenderer>` | `{}` | Custom cell renderers registered up front; reference one by name via `Column.renderer`. Also see `defineCellRenderer`. |
| `overscan` | `number` | `6` | Rows rendered above and below the viewport to absorb fast scrolls. |
| `config` | `GridConfig` | `undefined` | Presence opts into the built-in toolbar (see below). Omit for no toolbar. |

A `CellRenderer` paints (or returns a DOM node for) a single cell:

```ts
interface CellRenderer {
  canvas?(ctx: CanvasRenderingContext2D, c: CellPaintContext): void;
  dom?(c: CellPaintContext): HTMLElement;
}
```

Custom renderers are **not** available under `renderer: "worker"` (functions can
not be transferred to the worker).

## GridConfig (toolbar)

Set `config` to show the built-in toolbar. Each flag toggles one control; all
flags **default to `true`** when `config` is present. The one special case is
`toolbar: false`, which suppresses the toolbar entirely.

```ts
createGrid(host, { workbook, config: {} });               // toolbar with every control
createGrid(host, { workbook, config: { sort: false } });  // toolbar, no sort control
createGrid(host, { workbook, config: { toolbar: false } }); // no toolbar
createGrid(host, { workbook });                            // no toolbar (config omitted)
```

| Flag | Type | Default | Control |
| --- | --- | --- | --- |
| `toolbar` | `boolean` | `true`¹ | Master switch. `false` removes the toolbar. |
| `bold` | `boolean` | `true` | Bold toggle. |
| `italic` | `boolean` | `true` | Italic toggle. |
| `align` | `boolean` | `true` | Left / center / right alignment. |
| `textColor` | `boolean` | `true` | Text color picker. |
| `fillColor` | `boolean` | `true` | Fill (background) color picker. |
| `border` | `boolean` | `true` | Border control. |
| `clearFormat` | `boolean` | `true` | Clear formatting. |
| `merge` | `boolean` | `true` | Merge / unmerge selection. |
| `sort` | `boolean` | `true` | Sort the selected column. |
| `export` | `boolean` | `true` | CSV / XLSX export buttons. |
| `undo` | `boolean` | `true` | Undo / redo buttons (also bound to Ctrl+Z / Ctrl+Shift+Z). |

¹ "Default `true`" means: when you supply a `config` object at all. With no
`config` there is no toolbar.

Every control acts on the current selection — see [Interaction](./interaction.md).

### Feature flags

Three `GridConfig` fields enable behavior that lives outside the toolbar button
row. The two booleans default to enabled and stay active even with `toolbar: false`:

| Field | Type | Default | Effect |
| --- | --- | --- | --- |
| `find` | `boolean` | `true` | Built-in **Ctrl+F** find widget (a search box with next / previous and a live match count). Set `false` to remove the shortcut and the widget. |
| `contextMenu` | `boolean \| ContextMenuItem[]` | `true` | Right-click cell context menu (cut / copy / paste, clear, merge, export). Pass an array to supply a custom item list. |
| `icons` | `Partial<Record<ToolbarActionName, string>>` | `undefined` | Override the built-in toolbar icon for any action by name, e.g. `{ bold: "𝐁", undo: "↶" }`. |

Undo/redo and find are keyboard-driven and work without the toolbar: **Ctrl+Z**
undoes the last edit, **Ctrl+Shift+Z** redoes it, and **Ctrl+F** opens the find
widget (unless `find: false`).

## Grid instance

`createGrid` returns an imperative handle:

```ts
interface Grid {
  readonly store: Store;
  readonly actions: GridActions;
  setActiveSheet(id: SheetId): void;
  scrollToCell(addr: CellAddress): void;
  getSelection(): Selection | null;
  setSelection(sel: Selection | null): void;
  setTheme(theme: Partial<Theme>): void;
  defineCellRenderer(name: string, renderer: CellRenderer): void;
  aggregate(col: number, op: AggregateOp): number;
  sortBy(col: number, ascending?: boolean): void;
  filterBy(col: number, needle: string): void;
  clearView(): void;
  undo(): void;
  redo(): void;
  exportCsv(filename: string): void;
  exportXlsx(filename: string): Promise<void>;
  search(query: string, opts?: SearchOptions): SearchResult;
  findNext(): SearchResult;
  findPrev(): SearchResult;
  clearSearch(): void;
  highlightCells(ranges: Range[] | null, color?: string): void;
  on<E extends keyof GridEvents>(evt: E, fn: (e: GridEvents[E]) => void): () => void;
  refresh(): void;
  destroy(): void;
}
```

| Method | Purpose |
| --- | --- |
| `store` | The underlying [`Store`](./concepts.md#the-store-contract) — apply transactions, read cells, subscribe. |
| `actions` | Imperative action surface (`toggleBold()`, `merge()`, `undo()`, `exportCsv()`, …) the toolbar and context menu bind to — use it to wire custom controls. |
| `setActiveSheet(id)` | Switch the visible sheet. |
| `scrollToCell(addr)` | Scroll a cell into view. |
| `getSelection()` / `setSelection(sel)` | Read or set the current [`Selection`](./interaction.md#selection-model) (`null` clears it). |
| `setTheme(partial)` | Merge a partial theme and repaint. |
| `defineCellRenderer(name, r)` | Register a custom renderer after construction. |
| `aggregate(col, op)` | Column aggregate; see [Data operations](./data-operations.md#aggregate). |
| `sortBy` / `filterBy` / `clearView` | Non-mutating display views; see [Data operations](./data-operations.md#sort-filter-views). |
| `undo()` / `redo()` | Undo or redo the last recorded cell edit (also bound to Ctrl+Z / Ctrl+Shift+Z). |
| `exportCsv` / `exportXlsx` | Download the active data; see [Data operations](./data-operations.md#export). |
| `search(query, opts?)` | Find matching cells; highlights them, emits `search`, returns a [`SearchResult`](#search). |
| `findNext()` / `findPrev()` | Step the active match forward / backward and scroll it into view. |
| `clearSearch()` | Drop the current search and clear its highlights. |
| `highlightCells(ranges, color?)` | Highlight arbitrary ranges (`null` clears); `color` overrides the theme highlight. |
| `on(evt, fn)` | Subscribe to an event; returns an unsubscribe function. |
| `refresh()` | Force a re-render (e.g. after mutating the workbook directly). |
| `destroy()` | Tear down listeners, DOM, and ARIA attributes. |

## Search

`grid.search(query, opts?)` scans cells, highlights every match, scrolls the first
match into view, and emits a [`search`](#events) event. `findNext()` / `findPrev()`
move the active match; `clearSearch()` clears the highlights. The built-in **Ctrl+F**
find widget (gated by `config.find`, on by default) drives this same API.

```ts
interface SearchOptions {
  matchCase?: boolean; // case-sensitive match (default false)
  wholeCell?: boolean; // match the whole cell, not a substring (default false)
  sheet?: SheetId;     // restrict to one sheet (default: the active sheet)
  columns?: number[];  // restrict to these column indices (default: all)
}

interface SearchResult {
  query: string;
  matches: CellAddress[]; // matching cells, in row-major order
  active: number;         // index of the active match, or -1 when there are none
}
```

```ts
const result = grid.search("error");
console.log(`${result.matches.length} match(es)`);
grid.findNext();    // advance the active match and scroll to it
grid.clearSearch(); // remove the highlights when done
```

`highlightCells(ranges, color?)` highlights arbitrary ranges independently of
search (pass `null` to clear); `color` overrides the theme highlight color.

## Events

`grid.on(evt, fn)` returns an `off()` you should call to unsubscribe.

| Event | Payload |
| --- | --- |
| `change` | `{ transaction: Transaction; changes: CellChange[]; dirty: Patch[]; epoch? }` |
| `selection` | `{ selection: Selection \| null }` |
| `scroll` | `{ scrollTop: number; firstRow: number; lastRow: number }` |
| `edit-begin` | `{ addr: CellAddress }` |
| `edit-commit` | `{ addr: CellAddress; value: CellValue }` |
| `search` | `SearchResult` — `{ query: string; matches: CellAddress[]; active: number }` |

```ts
const off = grid.on("change", (e) => {
  console.log(`${e.changes.length} cell(s) changed`);
  // forward e.dirty to your backend, then grid.store.markClean(...)
});
// later
off();
```
