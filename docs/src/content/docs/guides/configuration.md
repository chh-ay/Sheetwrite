---
title: Configuration
description: Configure data ownership, rendering, interaction, theming, protection, and toolbar behavior.
---

[Installation](/docs/start/installation/)

Everything you pass to `createGrid(host, opts)` lives in `GridOptions`. This page
lists every field with its type and default, the optional toolbar `GridConfig`,
and the `Grid` instance API.

## GridOptions

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
type CreateGrid = (host: HTMLElement, opts: GridOptions) => Grid;
```

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `workbook` | `Workbook` | — (required) | Sheets, columns, row counts, and the `activeSheet` id. |
| `presentation` | `"spreadsheet" \| "data-grid"` | `"spreadsheet"` | Positional A/B/C headers or semantic `Column.header` labels. Addressing and data rows are unchanged. |
| `data` | `ColumnarData` | `undefined` | Eager, in-memory, column-major values. Pass this **or** `datasource`. |
| `datasource` | `DataSource` | `undefined` | Lazy, paged async source; rows fetched per visible window. |
| `datasourceStorage` | `DataSourceStorageOptions` | `{ mode: "dense" }` | Use `{ mode: "paged", chunkRows?, cacheBytes? }` for allocation-lazy datasource storage. |
| `renderer` | `"canvas" \| "worker"` | `"canvas"` | `"worker"` paints off-thread via OffscreenCanvas, falling back to canvas. See [Worker rendering](/docs/guides/worker-rendering/). |
| `workerUrl` | `string \| URL` | `undefined` | Browser-fetchable module URL, e.g. `"/sheetwrite/worker.js"` after copying the package `dist/`; Vite can import `@sheetwrite/core/worker?worker&url`. See [Worker rendering](/docs/guides/worker-rendering/). |
| `theme` | `Partial<Theme>` | `undefined` | Overrides merged over `DEFAULT_THEME` and any `--sheetwrite-*` CSS vars. See [Styling](/docs/guides/styling/). |
| `readOnly` | `boolean` | `false` | When `true`, all mutating interactions (edit, clear, fill, paste, restyle) are disabled and the host gets `aria-readonly="true"`. |
| `protectionResolver` | `ProtectionResolver` | `undefined` | Host callback for protected local mutations; no resolver means deny. Client-side UX policy only, never server authorization. |
| `mutationPolicy` | `"atomic" \| "partial"` | `"atomic"` | Reject the whole local transaction on a denied protected operation, or apply allowed operations and report denied ones. |
| `renderers` | `Record<string, CellRenderer>` | `{}` | Custom cell renderers registered up front; reference one by name via `Column.renderer`. Also see `defineCellRenderer`. |
| `editors` | `Record<string, CellEditor>` | `{}` | Host-owned cell editors registered up front; reference one by name via `Column.editor`. |
| `overscan` | `number` | `6` | Rows rendered above and below the viewport to absorb fast scrolls. |
| `minColumns` | `number` | workbook width | Minimum rendered/store column count, including empty spreadsheet padding columns. |
| `config` | `GridConfig` | `undefined` | Presence opts into the built-in toolbar (see below). Omit for no toolbar. |

Framework adapters classify every `GridOptions` field centrally. `workbook`,
`data`, `datasource`, `datasourceStorage`, `presentation`, `editors`,
`protectionResolver`, `mutationPolicy`, and `transactionResourceLimits` create
an `input-reset`; `renderer`, `workerUrl`, and `renderers` create a
`renderer-reset`. `theme`, `readOnly`, `config`, `overscan`, and `minColumns`
update the existing grid live. Readiness includes the resulting generation and
reset reason.

Framework adapters also accept `wasmSource`. Initialization is process-wide and
first-source-wins: concurrent calls using the same source share one attempt, while
a different source rejects until that attempt settles. If the winning attempt
succeeds, every still-mounted adapter becomes ready even when its prop changed
during the attempt. Changing `wasmSource` after readiness warns and keeps the live
grid, selection, edits, generation, and ready-event count unchanged. A true
initialization failure remains observable through `onInitializationError` and a
later source can retry it.

## Spreadsheet and data-grid presentation

`presentation: "spreadsheet"` is the backward-compatible default. It paints and
announces positional column headers (`A`, `B`, `C`, …). Use
`presentation: "data-grid"` when the columns describe row-object fields:

```ts prelude="core" partial="requires surrounding host state" title="Semantic data-grid headers"
const workbook: Workbook = {
  activeSheet: "people",
  sheets: [{
    id: "people",
    name: "People",
    rowCount: people.length,
    columns: [
      { key: "name", header: "Customer name", width: 220, type: "text" },
      { key: "status", header: "Account status", width: 160, type: "text" },
    ],
  }],
};

const grid = createGrid(host, {
  workbook,
  data,
  presentation: "data-grid",
});
```

The semantic header occupies the same header band as `A/B/C`; it does **not**
consume row 0. Cell addresses, formulas, selections, row numbers, clipboard
payloads, CSV/XLSX schema labels, mutation events, and datasource ranges keep
their existing zero-based data coordinates. Table exports use `Column.header`
in both presentation modes. The data-first `Sheetwrite` components select
`"data-grid"` automatically because every `SimpleColumn` requires a `title`.

Presentation is construction-bound. Changing it through a framework adapter
replaces the grid with `reason: "input-reset"` rather than renaming columns or
moving data in place.

## Host-supplied editors

Set `Column.editor` to a key in `GridOptions.editors`. A custom editor takes
precedence over the built-in validation-list editor. If the key is absent,
Sheetwrite falls back to validation editing or its stock text/date editor.

```ts prelude="core" partial="requires surrounding host state" title="Synchronous select editor"
const statusEditor: CellEditor = {
  mount(host, context) {
    const select = document.createElement("select");
    select.setAttribute("aria-label", context.label);
    for (const value of ["Prospect", "Active", "Paused"]) {
      select.add(new Option(value, value));
    }
    select.value = context.text;
    host.appendChild(select);
    select.focus();

    return {
      update(next) {
        select.setAttribute("aria-label", next.label);
        select.value = next.text;
      },
      reposition(rect) {
        select.style.width = `${rect.width}px`;
        select.style.height = `${rect.height}px`;
      },
      commit() {
        return select.value;
      },
      cancel() {},
      destroy() {
        select.remove();
      },
    };
  },
};

const grid = createGrid(host, {
  workbook,
  data,
  presentation: "data-grid",
  editors: { status: statusEditor },
});
```

The returned value is parsed with the column's normal type and committed through
the same document transaction as stock editing. That preserves protection,
validation, mutation policy, undo/redo, change events, and edit-commit events.
An asynchronous commit remains bound to the data row captured at `mount`, even
when sorting or `clearView()` moves that row before the promise settles. If a
filter removes the row from the view, Sheetwrite cancels and aborts the pending
edit instead of retargeting another row. Returning a rejected promise,
`undefined`, or a non-string value from untyped JavaScript cancels without a
mutation. Enter commits and moves down, Tab/Shift+Tab commit and move
horizontally, and Escape cancels. Focus returns to the grid after commit or
cancel.

For remote choices, use the editor-owned `AbortSignal`; never let a late request
write into a destroyed editor:

```ts prelude="core" partial="requires surrounding host state" title="Abortable async autocomplete"
const assigneeAutocomplete: CellEditor = {
  mount(host, context) {
    const input = document.createElement("input");
    const list = document.createElement("datalist");
    list.id = `assignees-${context.address.row}-${context.address.col}`;
    input.setAttribute("list", list.id);
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-label", context.label);
    input.value = context.initialInput ?? context.text;
    host.append(input, list);
    input.focus();

    void fetch(`/api/people?q=${encodeURIComponent(input.value)}`, {
      signal: context.signal,
    })
      .then((response) => response.json() as Promise<Array<{ id: string; name: string }>>)
      .then((people) => {
        if (context.signal.aborted) return;
        list.replaceChildren(
          ...people.map((person) => {
            const option = document.createElement("option");
            option.value = person.name;
            option.dataset.id = person.id;
            return option;
          }),
        );
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
      });

    return {
      update(next) {
        input.setAttribute("aria-label", next.label);
      },
      reposition(rect) {
        input.style.width = `${rect.width}px`;
      },
      async commit() {
        await Promise.resolve();
        return input.value;
      },
      cancel() {},
      destroy() {
        input.remove();
        list.remove();
      },
    };
  },
};
```

One retained wrapper and one `CellEditorInstance` exist per active edit:

| Hook / value | Guarantee |
| --- | --- |
| `mount(host, context)` | Runs once. The host is positioned over the active cell. |
| `context.address` / `viewAddress` | Canonical data-row and current displayed-row snapshots. They are readonly and mutating a JavaScript object received by the editor cannot retarget the edit. |
| `context.value` / `text` / `initialInput` | Resolved scalar, formatted text, and optional typed character. |
| `context.label` | Accessible name derived from semantic/positional header plus row number. |
| `context.signal` | Aborted before the editor's `cancel()` or `destroy()` hook on cancel, commit, reset, or unmount. |
| `context.commit()` / `cancel()` | Optional editor-driven completion using the canonical path. A non-string commit from untyped JavaScript cancels safely. |
| `update(context)` | External value, theme, zoom, view permutation, or geometry-sensitive state changed without replacing ownership. |
| `reposition(rect)` | The active cell moved or resized. |
| `commit()` | May return input synchronously or asynchronously; duplicate completion is ignored. |
| `cancel()` | Notification before a host-requested cancellation; the signal is already aborted. |
| `destroy()` | Runs exactly once; late async work must observe the aborted signal. A thrown hook error is reported without interrupting Sheetwrite's DOM, listener, or store cleanup. |

`editors` is construction-bound so React/Vue/Svelte resets safely abort and
destroy an active editor before publishing the new grid generation. All adapters
accept the same registry:

```tsx prelude="react" partial="requires React component state" title="React"
<SheetwriteGrid
  ref={gridRef}
  workbook={workbook}
  data={data}
  presentation="data-grid"
  editors={{ status: statusEditor, assignee: assigneeAutocomplete }}
  onCommandStateChange={({ states }) => setCommandStates(states)}
/>
```

```vue prelude="vue" partial="requires Vue component state" title="Vue"
<SheetwriteGrid
  ref="gridComponent"
  :workbook="workbook"
  :data="data"
  presentation="data-grid"
  :editors="{ status: statusEditor, assignee: assigneeAutocomplete }"
  @command-state-change="({ states }) => commandStates = states"
/>
```

```svelte prelude="svelte" partial="requires Svelte component state" title="Svelte"
<SheetwriteGrid
  bind:grid
  {workbook}
  {data}
  presentation="data-grid"
  editors={{ status: statusEditor, assignee: assigneeAutocomplete }}
  onCommandStateChange={(event: GridEvents["command-state-change"]) => commandStates = event.states}
/>
```

### Datasource pages

The cancellable request API owns one visible-window generation. Pages can carry
authoritative formula source and style rather than only resolved scalars:

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
import type { DataSource } from "@sheetwrite/core";

interface ApiRow {
  label: string;
  quantity: number;
  price: number;
}

const datasource: DataSource = {
  async getRows({ sheet, start, end, signal, revision }) {
    const response = await fetch(
      `/sheets/${encodeURIComponent(sheet)}?start=${start}&end=${end}`,
      { signal },
    );
    if (!response.ok) throw new Error(`Datasource request failed: ${response.status}`);
    const records = (await response.json()) as ApiRow[];
    return {
      start,
      revision: response.headers.get("etag") ?? revision,
      rows: records.map((record, index) => ({
        label: record.label,
        quantity: record.quantity,
        price: record.price,
        total: {
          value: {
            kind: "formula",
            src: `=B${start + index + 1}*C${start + index + 1}`,
          },
          style: { numberFormat: "$#,##0.00", bold: true },
        },
      })),
    };
  },
};
```

`rows` may contain scalars, `CellValue` objects, or
`{ value: CellValue, style?: CellStyle }` wrappers. Hydrated formulas,
references, and styles do not emit user change events. Short pages mark only the
returned rows loaded; malformed ranges emit `datasource-error` and remain
retryable. Resetting or destroying the grid aborts outstanding requests, and a
late page never overwrites a cell edited after that request began.

Dense storage is the default. `{ mode: "paged" }` allocates
power-of-two row chunks only for loaded or locally edited areas; `cacheBytes`
bounds clean cached chunks, while dirty chunks remain pinned until
acknowledgement. Full-sheet queries and exports report incomplete data until all
required pages are loaded. `Store.queryCapability(sheet)` and
`getCellLoadState(addr)` expose that state.


### Serializable documents

Use `WorkbookSnapshot` plus `validateWorkbookSnapshot()` at persistence
boundaries. `schemaVersion: 1` rejects unsupported future schemas with
structured errors. `DocumentOp` is the exhaustive reducer operation union,
including metadata and sheet lifecycle operations.
Session-only grid options such as `renderer`, `readOnly`, local zoom, selection,
scroll, search, and temporary highlights never belong in a snapshot.

`createGridFromSnapshot(host, snapshot, options)` validates and hydrates every
sheet before mounting. Hydration emits no change event or undo entry.
`grid.exportSnapshot()` uses bulk sheet reads and returns deterministic sparse
blocks. `grid.applyRemoteOperations(operations)` emits a change with
`source: "remote"` while remaining outside local undo history and
`SyncCoordinator`'s outgoing queue. `SyncCoordinator` queues each non-empty local
transaction as an immutable mutation record. Its `serverVersion` option is
required and should come from the loaded snapshot.
`sendNext()` and `retry(id)` are host-controlled; retries retain the original
ID. `subscribe(source)` accepts a transport-neutral callback source and validates
strict version order. Use `MemoryPersistenceAdapter` as an executable,
server-sequenced reference—not as durable storage. Adapter methods accept
`AbortSignal`; transport failures use `PersistenceError`, while version
conflicts are typed commit responses that retain local work.

A `CellRenderer` paints or retains a DOM node for each cell in the rendered
window. When `dom` is present, it owns the cell content (the canvas still paints
the cell background, border, headers, and grid lines):

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
interface CellRenderer {
  canvas?(ctx: CanvasRenderingContext2D, c: CellPaintContext): void;
  dom?(c: CellPaintContext): HTMLElement;
  update?(element: HTMLElement, c: CellPaintContext): void;
  destroy?(element: HTMLElement): void;
}
```

`dom` creates an element when a cell enters the bounded rendered window.
`update` receives that same element after values, styles, theme, zoom, size, or
scroll geometry change. `destroy` runs immediately before the element leaves
the window, is replaced by a newly registered renderer, or its grid is reset or
destroyed. Implement `update` to preserve focus and element-local state. A
legacy renderer with only `dom` is recreated when its value, style, theme, or
size changes, but not for a pure scroll.

DOM cells are clipped to the viewport and frozen pane that owns them. A merged
range produces one node for its anchor, not one node per covered cell. Plain
renderer output stays hidden from assistive technology because the compact ARIA
mirror already exposes its cell value. To make a renderer explicitly
interactive, return a native control (or add a non-negative `tabindex`), give it
an accessible name, and set `element.style.pointerEvents = "auto"`. Keyboard
events from that control stay with the control instead of moving the grid.

With `renderer: "worker"`, `canvas` hooks cannot cross the Worker boundary.
`dom`, `update`, and `destroy` still run on the main thread in the retained
overlay.

## GridConfig (toolbar)

Set `config` to show the built-in toolbar. Each flag toggles one control; all
flags **default to `true`** when `config` is present. The one special case is
`toolbar: false`, which suppresses the toolbar entirely.

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
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

The export flag always enables CSV. Its XLSX button requires an explicit
optional installation and `import "@sheetwrite/xlsx/register"` before use; the
framework packages do not install an XLSX backend.
Direct `grid.exportXlsx(...)` calls reject on failure; built-in toolbar and
context-menu actions report the same failure through one `export-error` event.

Every control acts on the current selection — see [Interaction](/docs/guides/interaction/).

### Host-owned command state

Host chrome can use `grid.actions` without duplicating selection/history logic.
Query one command with `grid.getCommandState(name)` or subscribe to the complete
snapshot through `command-state-change` (`onCommandStateChange` in React/Svelte,
`@command-state-change` in Vue):

```ts prelude="core" partial="requires host toolbar elements" title="Accessible host toolbar"
const update = (bold: GridCommandState, undo: GridCommandState) => {
  undoButton.disabled = undo.disabled;
  boldButton.disabled = bold.disabled;
  boldButton.setAttribute(
    "aria-pressed",
    bold.activity === "mixed" ? "mixed" : String(bold.activity === "active"),
  );
};

update(grid.getCommandState("bold"), grid.getCommandState("undo"));
const stop = grid.on("command-state-change", ({ states }) => {
  update(states.bold, states.undo);
});

boldButton.addEventListener("click", () => grid.actions.toggleBold());
undoButton.addEventListener("click", () => grid.actions.undo());

// Run during host teardown.
stop();
```

`disabled` accounts for read-only mode, empty selections, and undo/redo history.
Formatting commands report `activity: "inactive" | "active" | "mixed"` across
the current selection. The built-in toolbar uses the same contract, including
native `disabled` and `aria-pressed="mixed"`. Aggregation is bounded; very large
selections conservatively report `mixed` rather than forcing an unbounded cell
walk.

### Feature flags

Three `GridConfig` fields enable behavior that lives outside the toolbar row:

| Field | Type | Default | Effect |
| --- | --- | --- | --- |
| `find` | `boolean` | `true` | Built-in **Ctrl+F** search box, next/previous controls, and live match count. |
| `contextMenu` | `boolean \| ContextMenuItems` | `true` | Built-in right-click menu, disabled menu, static readonly rows, or a context-aware row factory. |
| `icons` | `Partial<Record<ToolbarActionName, ToolbarIcon>>` | `undefined` | Built-in toolbar icon overrides. Strings render as text; a DOM `Node` or `() => Node` supports SVG/HTML without `innerHTML`. |

### Context-menu items

The default menu contains copy, cut, paste, clear contents, row
insert/delete/hide/show/auto-fit, column insert/delete/hide/show/auto-fit,
clear column filter, merge, and unmerge actions, with separators between
groups. `exportCsv` and `exportXlsx` are also valid built-in actions in a
custom list.

`ContextMenuItems` is either a `readonly ContextMenuItem[]` or a factory
evaluated for each `ContextMenuContext`. An item may set a stable `id`,
built-in `action`, visible `label`, `shortcut` hint, and static or
context-aware `visible`/`disabled` policy. The lean context carries only
`cell`, `clientX`, and `clientY`. `onClick(grid, cell)` overrides `action`;
hidden separators are normalized.

```ts prelude="core" partial="requires an initialized Grid host" title="Context-aware bundled menu"
const config = {
  contextMenu: (context) => [
    { id: "copy", action: "copy", label: "Copy value", shortcut: "Ctrl+C" },
    { action: "separator" },
    {
      id: "inspect",
      label: "Inspect cell",
      visible: context.cell !== null,
      disabled: ({ cell }) => cell === null,
      onClick(grid, cell) {
        if (cell !== null) console.log(grid.store.getCell(cell));
      },
    },
    { action: "exportCsv", label: "Download CSV" },
  ],
} satisfies GridConfig;
```

For fully host-owned UI, set `contextMenu: false`, listen for the DOM
`contextmenu` event on the host, call
`grid.getCellAtPoint(event.clientX, event.clientY)`, update selection, and
invoke `grid.actions` from the host menu. Sheetwrite does not prescribe the
host's event lifecycle:

```ts prelude="core" partial="requires host menu state" title="Host-owned context menu"
host.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  const cell = grid.getCellAtPoint(event.clientX, event.clientY);
  if (cell !== null) grid.setSelection({ kind: "cell", addr: cell });
  host.dispatchEvent(
    new CustomEvent("sheetwrite:context-menu", {
      detail: { cell, x: event.clientX, y: event.clientY, actions: grid.actions },
    }),
  );
});
```

See [Interaction → Context menu](/docs/guides/interaction/#context-menu),
[Styling](/docs/guides/styling/#widget-and-context-menu-styling), and the
generated [`ContextMenuContext`](/docs/api/core/context-menu-context/),
[`ContextMenuItems`](/docs/api/core/context-menu-items/),
[`ContextMenuItem`](/docs/api/core/context-menu-item/), and
[`Grid.getCellAtPoint`](/docs/api/core/grid/#getcellatpoint) contracts.

Undo/redo and find are keyboard-driven and work without the toolbar: **Ctrl+Z**
undoes the last edit, **Ctrl+Shift+Z** redoes it, and **Ctrl+F** opens the find
widget (unless `find: false`).

## Grid instance

`createGrid` returns an imperative handle:

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
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
  sortByMulti(keys: readonly SortKey[]): void;
  filterBy(col: number, needle: string): void;
  setColumnFilter(col: number, filter: ColumnFilter | null): void;
  getColumnFilters(): ReadonlyMap<number, ColumnFilter>;
  distinctValues(col: number, limit?: number): CellScalar[];
  hideRows(rows: readonly number[]): void;
  showRows(rows?: readonly number[]): void;
  hiddenRows(): readonly number[];
  hideColumns(cols?: readonly number[]): void;
  showColumns(cols?: readonly number[]): void;
  hiddenColumns(): readonly number[];
  groupRows(start: number, end: number): void;
  ungroupRows(start: number, end: number): void;
  setGroupCollapsed(start: number, collapsed: boolean): void;
  rowGroups(): readonly RowGroup[];
  clearView(): void;
  undo(): void;
  redo(): void;
  exportCsv(filename: string): void;
  exportXlsx(filename: string): Promise<void>;
  search(query: string, opts?: SearchOptions): SearchResult;
  findNext(): SearchResult;
  findPrev(): SearchResult;
  clearSearch(): void;
  replaceCurrent(replacement: string): SearchResult;
  replaceAll(replacement: string): ReplaceResult;
  insertRows(at: number, count?: number): void;
  removeRows(at: number, count?: number): void;
  insertColumns(at: number, count?: number): void;
  removeColumns(at: number, count?: number): void;
  highlightCells(ranges: readonly HighlightRange[] | null, color?: string): void;
  styleRange(range: Range, style: Partial<CellStyle> | null): void;
  setValidationRule(rule: DataValidationRule): ApplyTransactionResult;
  removeValidationRule(id: string): ApplyTransactionResult;
  setProtectedRange(range: ProtectedRange): ApplyTransactionResult;
  removeProtectedRange(id: string): ApplyTransactionResult;
  setProtectionResolver(resolver?: ProtectionResolver, mode?: MutationPolicyMode): void;
  setNote(addr: CellAddress, text: string | null): ApplyTransactionResult;
  getNote(addr: CellAddress): string | null;
  beginEdit(row: number, col: number, initial?: string, selectAll?: boolean): void;
  dataEdge(row: number, col: number, dRow: number, dCol: number): number | null;
  setRowHeight(row: number, height: number): void;
  setColumnWidth(col: number, width: number): void;
  autoFitRows(range?: Range): void;
  autoFitColumns(cols?: readonly number[]): void;
  setFrozen(rows: number, cols?: number): void;
  setZoom(zoom: number): void;
  getZoom(): number;
  on<E extends keyof GridEvents>(evt: E, fn: (e: GridEvents[E]) => void): () => void;
  refresh(): void;
  destroy(): void;
}
```

| Method | Purpose |
| --- | --- |
| `store` | The underlying [`Store`](/docs/concepts/runtime-ownership/#the-store-contract) — apply transactions, read cells, subscribe. |
| `actions` | Imperative action surface (`toggleBold()`, `merge()`, `undo()`, `exportCsv()`, …) the toolbar and context menu bind to — use it to wire custom controls. |
| `setActiveSheet(id)` | Switch the visible sheet. |
| `scrollToCell(addr)` | Scroll a cell into view. |
| `getSelection()` / `setSelection(sel)` | Read or set the current [`Selection`](/docs/guides/interaction/#selection-model) (`null` clears it). |
| `setTheme(partial)` | Merge a partial theme and repaint. |
| `defineCellRenderer(name, r)` | Register a custom renderer after construction. |
| `aggregate(col, op)` | Column aggregate; see [Data operations](/docs/guides/data-operations/#aggregate). |
| `sortBy` / `sortByMulti` | Non-mutating display sorts; see [Data operations](/docs/guides/data-operations/#display-views). |
| `filterBy` / `setColumnFilter` / `getColumnFilters` | Column filters that compose with sort, hidden rows, and row groups. |
| `distinctValues(col, limit?)` | First-seen distinct values for building filter menus. |
| `hideRows` / `showRows` / `hiddenRows` | Explicit row visibility separate from sort/filter state. |
| `hideColumns` / `showColumns` / `hiddenColumns` | Bulk-safe persisted column visibility; omitted arguments target the focused column for hide and every column for show. |
| `groupRows` / `ungroupRows` / `setGroupCollapsed` / `rowGroups` | Inclusive data-row groups with collapse state. |
| `clearView()` | Clears sort/filter state; hidden rows and row groups remain. |
| `setFrozen(rows, cols?)` | Pin leading view rows/columns while the body scrolls. |
| `setZoom(z)` / `getZoom()` | Scale grid content between `0.5` and `2` without mutating workbook base sizes. |
| `undo()` / `redo()` | Undo or redo the last recorded cell edit (also bound to Ctrl+Z / Ctrl+Shift+Z). |
| `exportCsv` / `exportXlsx` | Download the active data; see [Data operations](/docs/guides/data-operations/#export). |
| `search(query, opts?)` | Find matching cells; highlights them, emits `search`, returns a [`SearchResult`](#search). |
| `findNext()` / `findPrev()` | Step the active match forward / backward and scroll it into view. |
| `clearSearch()` | Drop the current search and clear its highlights. |
| `replaceCurrent()` / `replaceAll()` | Replace literal text/number matches through undoable transactions. |
| `insertRows` / `removeRows` / `insertColumns` / `removeColumns` | Structural edits through undoable patches. |
| `highlightCells(ranges, color?)` | Highlight arbitrary ranges (`null` clears); `color` overrides the theme highlight. |
| `styleRange(range, style)` | Merge or clear store-backed cell styles across a range. |
| `setValidationRule` / `removeValidationRule` | Add, replace, or remove a serializable range validation rule. List and checkbox rules get accessible editors. |
| `setProtectedRange` / `removeProtectedRange` / `setProtectionResolver` | Define protected-range metadata and host-owned local permission policy. This is not server authorization. |
| `setNote` / `getNote` | Set, clear, or read a serializable plain-text cell note. |
| `beginEdit(row, col, initial?, selectAll?)` | Open the inline editor at a view cell. |
| `dataEdge(row, col, dRow, dCol)` | Ctrl+Arrow-style data-run jump target; vertical movement is view-aware under sort/filter. |
| `setRowHeight(row, h)` / `setColumnWidth(col, w)` | Geometry APIs; row height is view-indexed and persists against the underlying data row. |
| `autoFitRows(range?)` / `autoFitColumns(cols?)` | Explicit, undoable geometry fitting from bulk reads; auto-fit never runs during paint. |
| `on(evt, fn)` | Subscribe to an event; returns an unsubscribe function. |
| `refresh()` | Force a re-render (e.g. after mutating the workbook directly). |
| `destroy()` | Tear down listeners, DOM, and ARIA attributes. |

## Search

`grid.search(query, opts?)` scans cells, highlights every match, scrolls the first
match into view, and emits a [`search`](#events) event. `findNext()` / `findPrev()`
move the active match; `clearSearch()` clears the highlights. The built-in **Ctrl+F**
find widget (gated by `config.find`, on by default) drives this same API.

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
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

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
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
| `change` | `{ transaction; changes; dirty; commitReason; source: "local" \| "remote"; epoch? }` |
| `selection` | `{ selection: Selection \| null }` |
| `scroll` | `{ scrollTop: number; firstRow: number; lastRow: number }` |
| `edit-begin` | `{ addr: CellAddress }` |
| `edit-commit` | `{ addr: CellAddress; value: CellValue }` |
| `search` | `SearchResult` — `{ query: string; matches: CellAddress[]; active: number }` |

```ts prelude="collaboration" partial="requires surrounding host state" title="Partial example"
const sync = new SyncCoordinator(grid, adapter, {
  documentId: "products",
  serverVersion: loadedSnapshot.version ?? 0,
});
const off = sync.on((event) => {
  if (event.type === "conflict") showConflict(event.response);
  if (event.type === "reload-required") requestFreshSnapshot();
});

saveButton.onclick = () => void sync.sendNext();
// later
off();
sync.destroy();
```
