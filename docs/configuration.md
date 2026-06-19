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

¹ "Default `true`" means: when you supply a `config` object at all. With no
`config` there is no toolbar.

Every control acts on the current selection — see [Interaction](./interaction.md).

## Grid instance

`createGrid` returns an imperative handle:

```ts
interface Grid {
  readonly store: Store;
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
  exportCsv(filename: string): void;
  exportXlsx(filename: string): Promise<void>;
  on<E extends keyof GridEvents>(evt: E, fn: (e: GridEvents[E]) => void): () => void;
  refresh(): void;
  destroy(): void;
}
```

| Method | Purpose |
| --- | --- |
| `store` | The underlying [`Store`](./concepts.md#the-store-contract) — apply transactions, read cells, subscribe. |
| `setActiveSheet(id)` | Switch the visible sheet. |
| `scrollToCell(addr)` | Scroll a cell into view. |
| `getSelection()` / `setSelection(sel)` | Read or set the current [`Selection`](./interaction.md#selection-model) (`null` clears it). |
| `setTheme(partial)` | Merge a partial theme and repaint. |
| `defineCellRenderer(name, r)` | Register a custom renderer after construction. |
| `aggregate(col, op)` | Column aggregate; see [Data operations](./data-operations.md#aggregate). |
| `sortBy` / `filterBy` / `clearView` | Non-mutating display views; see [Data operations](./data-operations.md#sort-filter-views). |
| `exportCsv` / `exportXlsx` | Download the active data; see [Data operations](./data-operations.md#export). |
| `on(evt, fn)` | Subscribe to an event; returns an unsubscribe function. |
| `refresh()` | Force a re-render (e.g. after mutating the workbook directly). |
| `destroy()` | Tear down listeners, DOM, and ARIA attributes. |

## Events

`grid.on(evt, fn)` returns an `off()` you should call to unsubscribe.

| Event | Payload |
| --- | --- |
| `change` | `{ transaction: Transaction; changes: CellChange[]; dirty: Patch[]; epoch? }` |
| `selection` | `{ selection: Selection \| null }` |
| `scroll` | `{ scrollTop: number; firstRow: number; lastRow: number }` |
| `edit-begin` | `{ addr: CellAddress }` |
| `edit-commit` | `{ addr: CellAddress; value: CellValue }` |

```ts
const off = grid.on("change", (e) => {
  console.log(`${e.changes.length} cell(s) changed`);
  // forward e.dirty to your backend, then grid.store.markClean(...)
});
// later
off();
```
