---
title: "Grid | @sheetwrite/vue"
description: "Imperative grid handle for document commands, events, rendering, and teardown."
---
<!-- api-export:@sheetwrite/vue|.|Grid -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/vue/">@sheetwrite/vue</a><span class="api-status" data-kind="interface">interface</span></div>

Imperative grid handle for document commands, events, rendering, and teardown.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/vue</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/dist/types/grid.d.ts#L375</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>88</span>

<div class="api-member-list">

<details class="api-member" id="grid-store" data-pagefind-weight="1">
<summary><code>store</code></summary>

```ts generated
readonly store: Store;
```

</details>

<details class="api-member" id="grid-actions" data-pagefind-weight="1">
<summary><code>actions</code> <span class="api-member-summary">Imperative action surface for binding custom toolbars/menus.</span></summary>

```ts generated
readonly actions: GridActions;
```

</details>

<details class="api-member" id="grid-get-runtime-resource-snapshot" data-pagefind-weight="1">
<summary><code>getRuntimeResourceSnapshot</code> <span class="api-member-summary">Versioned coarse runtime ownership snapshot, including datasource state.</span></summary>

```ts generated
getRuntimeResourceSnapshot(operation: RuntimeResourceOperation, phase: RuntimeResourcePhase, runtime?: RuntimeMemoryObservation): RuntimeResourceSnapshot;
```

</details>

<details class="api-member" id="grid-get-command-state" data-pagefind-weight="1">
<summary><code>getCommandState</code> <span class="api-member-summary">Query undo/redo availability and formatting active/mixed/disabled state.</span></summary>

```ts generated
getCommandState(command: GridCommandName): GridCommandState;
```

</details>

<details class="api-member" id="grid-set-active-sheet" data-pagefind-weight="1">
<summary><code>setActiveSheet</code></summary>

```ts generated
setActiveSheet(id: SheetId): void;
```

</details>

<details class="api-member" id="grid-scroll-to-cell" data-pagefind-weight="1">
<summary><code>scrollToCell</code></summary>

```ts generated
scrollToCell(addr: CellAddress): void;
```

</details>

<details class="api-member" id="grid-get-cell-at-point" data-pagefind-weight="1">
<summary><code>getCellAtPoint</code> <span class="api-member-summary">Resolve browser viewport coordinates to an active-sheet cell for host-owned menus and interactions.</span></summary>

```ts generated
getCellAtPoint(clientX: number, clientY: number): CellAddress | null;
```

<p class="api-member-doc">Resolve browser viewport coordinates to an active-sheet cell for host-owned
menus and interactions. Returns null outside the cell body.</p>
</details>

<details class="api-member" id="grid-get-active-sheet" data-pagefind-weight="1">
<summary><code>getActiveSheet</code> <span class="api-member-summary">Id of the currently visible sheet.</span></summary>

```ts generated
getActiveSheet(): SheetId;
```

</details>

<details class="api-member" id="grid-get-cell-input" data-pagefind-weight="1">
<summary><code>getCellInput</code> <span class="api-member-summary">Editable snapshot of the cell at a view position on the active sheet, or null when out of bounds.</span></summary>

```ts generated
getCellInput(row: number, col: number): CellInputSnapshot | null;
```

<p class="api-member-doc">Editable snapshot of the cell at a view position on the active sheet, or
null when out of bounds. See <a href="/docs/api/core/cell-input-snapshot/"><code>CellInputSnapshot</code></a>.</p>
</details>

<details class="api-member" id="grid-get-selection" data-pagefind-weight="1">
<summary><code>getSelection</code></summary>

```ts generated
getSelection(): Selection | null;
```

</details>

<details class="api-member" id="grid-set-selection" data-pagefind-weight="1">
<summary><code>setSelection</code></summary>

```ts generated
setSelection(sel: Selection | null): void;
```

</details>

<details class="api-member" id="grid-set-theme" data-pagefind-weight="1">
<summary><code>setTheme</code> <span class="api-member-summary">Imperative patch: merge theme into the accumulated base theme.</span></summary>

```ts generated
setTheme(theme: Partial<Theme>): void;
```

</details>

<details class="api-member" id="grid-replace-theme" data-pagefind-weight="1">
<summary><code>replaceTheme</code> <span class="api-member-summary">Option-level replacement: re-run construction-time resolution (DEFAULTTHEME &lt; CSS custom properties &lt; theme) with the new partial.</span></summary>

```ts generated
replaceTheme(theme: Partial<Theme> | undefined): void;
```

<p class="api-member-doc">Option-level replacement: re-run construction-time resolution
(`DEFAULT_THEME &lt; CSS custom properties &lt; theme`) with the new partial.
`undefined` restores the CSS-variable/default resolution. Adapters call
this for their declarative `theme` prop; imperative patching stays on
<a href="/docs/api/vue/grid/#grid-set-theme"><code>setTheme</code></a>.</p>
</details>

<details class="api-member" id="grid-get-effective-theme" data-pagefind-weight="1">
<summary><code>getEffectiveTheme</code> <span class="api-member-summary">The effective (post-zoom) theme the renderer is currently painting with.</span></summary>

```ts generated
getEffectiveTheme(): Theme;
```

</details>

<details class="api-member" id="grid-set-read-only" data-pagefind-weight="1">
<summary><code>setReadOnly</code> <span class="api-member-summary">Update editability without replacing the Grid or clearing session state.</span></summary>

```ts generated
setReadOnly(readOnly: boolean): void;
```

</details>

<details class="api-member" id="grid-set-config" data-pagefind-weight="1">
<summary><code>setConfig</code> <span class="api-member-summary">Reconfigure built-in chrome and keyboard handling without replacing the Grid or clearing selection/history.</span></summary>

```ts generated
setConfig(config: GridConfig | undefined): void;
```

<p class="api-member-doc">Reconfigure built-in chrome and keyboard handling without replacing the
Grid or clearing selection/history. Construction-bound GridOptions are not
accepted here.</p>
</details>

<details class="api-member" id="grid-apply-transaction" data-pagefind-weight="1">
<summary><code>applyTransaction</code> <span class="api-member-summary">Apply arbitrary patches as one undoable Grid commit.</span></summary>

```ts generated
applyTransaction(transaction: GridTransaction): ApplyTransactionResult;
```

<p class="api-member-doc">Apply arbitrary patches as one undoable Grid commit. No-op when read-only.
Use `Store.applyTransaction` only for low-level writes that intentionally
bypass Grid history and policy.</p>
</details>

<details class="api-member" id="grid-export-snapshot" data-pagefind-weight="1">
<summary><code>exportSnapshot</code> <span class="api-member-summary">Deterministically export the complete authoritative workbook document.</span></summary>

```ts generated
exportSnapshot(): WorkbookSnapshot;
```

</details>

<details class="api-member" id="grid-apply-remote-operations" data-pagefind-weight="1">
<summary><code>applyRemoteOperations</code> <span class="api-member-summary">Apply host-supplied operations without undo history or outgoing dirty state.</span></summary>

```ts generated
applyRemoteOperations(operations: readonly DocumentOp[], options?: RemoteOperationOptions): ApplyTransactionResult;
```

<p class="api-member-doc">Apply host-supplied operations without undo history or outgoing dirty state.
The resulting change event has `source: &quot;remote&quot;`.</p>
</details>

<details class="api-member" id="grid-define-cell-renderer" data-pagefind-weight="1">
<summary><code>defineCellRenderer</code></summary>

```ts generated
defineCellRenderer(name: string, renderer: CellRenderer): void;
```

</details>

<details class="api-member" id="grid-aggregate" data-pagefind-weight="1">
<summary><code>aggregate</code> <span class="api-member-summary">Column aggregate over the active sheet's data.</span></summary>

```ts generated
aggregate(col: number, op: AggregateOp): number;
```

</details>

<details class="api-member" id="grid-sort-by" data-pagefind-weight="1">
<summary><code>sortBy</code> <span class="api-member-summary">Sort the displayed rows by a column (does not mutate stored data).</span></summary>

```ts generated
sortBy(col: number, ascending?: boolean): void;
```

</details>

<details class="api-member" id="grid-sort-by-multi" data-pagefind-weight="1">
<summary><code>sortByMulti</code> <span class="api-member-summary">Multi-key sort of the displayed rows (first key primary; stable).</span></summary>

```ts generated
sortByMulti(keys: readonly SortKey[]): void;
```

</details>

<details class="api-member" id="grid-filter-by" data-pagefind-weight="1">
<summary><code>filterBy</code> <span class="api-member-summary">Filter the displayed rows to those whose column text contains needle.</span></summary>

```ts generated
filterBy(col: number, needle: string): void;
```

</details>

<details class="api-member" id="grid-set-column-filter" data-pagefind-weight="1">
<summary><code>setColumnFilter</code> <span class="api-member-summary">Set or clear (null) one column's filter.</span></summary>

```ts generated
setColumnFilter(col: number, filter: ColumnFilter | null): void;
```

<p class="api-member-doc">Set or clear (null) one column's filter. All column filters AND together
and compose with the active sort and hidden rows.</p>
</details>

<details class="api-member" id="grid-set-sort" data-pagefind-weight="1">
<summary><code>setSort</code> <span class="api-member-summary">Persisted multi-key sort of the active sheet.</span></summary>

```ts generated
setSort(keys: readonly SortKey[]): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-get-column-filters" data-pagefind-weight="1">
<summary><code>getColumnFilters</code> <span class="api-member-summary">Active column filters on the active sheet, keyed by column index.</span></summary>

```ts generated
getColumnFilters(): ReadonlyMap<number, ColumnFilter>;
```

</details>

<details class="api-member" id="grid-distinct-values" data-pagefind-weight="1">
<summary><code>distinctValues</code> <span class="api-member-summary">Distinct resolved values of a column in first-seen order.</span></summary>

```ts generated
distinctValues(col: number, limit?: number): CellScalar[];
```

<p class="api-member-doc">Distinct resolved values of a column in first-seen order. Defaults to
1,000 values for bounded filter menus; pass 0 to request an uncapped scan.</p>
</details>

<details class="api-member" id="grid-hide-rows" data-pagefind-weight="1">
<summary><code>hideRows</code> <span class="api-member-summary">Hide the given data rows (composes with filters/sort).</span></summary>

```ts generated
hideRows(rows: readonly number[]): void;
```

</details>

<details class="api-member" id="grid-show-rows" data-pagefind-weight="1">
<summary><code>showRows</code> <span class="api-member-summary">Show the given data rows again, or every hidden row when omitted.</span></summary>

```ts generated
showRows(rows?: readonly number[]): void;
```

</details>

<details class="api-member" id="grid-hidden-rows" data-pagefind-weight="1">
<summary><code>hiddenRows</code> <span class="api-member-summary">Currently hidden data rows on the active sheet.</span></summary>

```ts generated
hiddenRows(): readonly number[];
```

</details>

<details class="api-member" id="grid-hide-columns" data-pagefind-weight="1">
<summary><code>hideColumns</code> <span class="api-member-summary">Hide columns through one bulk-safe metadata transaction.</span></summary>

```ts generated
hideColumns(cols?: readonly number[]): void;
```

</details>

<details class="api-member" id="grid-show-columns" data-pagefind-weight="1">
<summary><code>showColumns</code> <span class="api-member-summary">Show columns through one bulk-safe metadata transaction.</span></summary>

```ts generated
showColumns(cols?: readonly number[]): void;
```

</details>

<details class="api-member" id="grid-hidden-columns" data-pagefind-weight="1">
<summary><code>hiddenColumns</code> <span class="api-member-summary">Currently hidden columns on the active sheet.</span></summary>

```ts generated
hiddenColumns(): readonly number[];
```

</details>

<details class="api-member" id="grid-group-rows" data-pagefind-weight="1">
<summary><code>groupRows</code> <span class="api-member-summary">Define a collapsible row group over a data-row range (end-inclusive).</span></summary>

```ts generated
groupRows(start: number, end: number): void;
```

</details>

<details class="api-member" id="grid-ungroup-rows" data-pagefind-weight="1">
<summary><code>ungroupRows</code> <span class="api-member-summary">Remove a row group (rows become visible if the group was collapsed).</span></summary>

```ts generated
ungroupRows(start: number, end: number): void;
```

</details>

<details class="api-member" id="grid-set-group-collapsed" data-pagefind-weight="1">
<summary><code>setGroupCollapsed</code> <span class="api-member-summary">Collapse/expand a row group; collapsing hides its rows.</span></summary>

```ts generated
setGroupCollapsed(start: number, collapsed: boolean): void;
```

</details>

<details class="api-member" id="grid-row-groups" data-pagefind-weight="1">
<summary><code>rowGroups</code> <span class="api-member-summary">Row groups on the active sheet.</span></summary>

```ts generated
rowGroups(): readonly RowGroup[];
```

</details>

<details class="api-member" id="grid-clear-view" data-pagefind-weight="1">
<summary><code>clearView</code> <span class="api-member-summary">Clear any active sort/filter view.</span></summary>

```ts generated
clearView(): void;
```

</details>

<details class="api-member" id="grid-undo" data-pagefind-weight="1">
<summary><code>undo</code> <span class="api-member-summary">Undo the last recorded cell edit.</span></summary>

```ts generated
undo(): void;
```

</details>

<details class="api-member" id="grid-redo" data-pagefind-weight="1">
<summary><code>redo</code> <span class="api-member-summary">Redo the last undone cell edit.</span></summary>

```ts generated
redo(): void;
```

</details>

<details class="api-member" id="grid-export-csv" data-pagefind-weight="1">
<summary><code>exportCsv</code></summary>

```ts generated
exportCsv(filename: string): void;
```

</details>

<details class="api-member" id="grid-export-xlsx" data-pagefind-weight="1">
<summary><code>exportXlsx</code></summary>

```ts generated
exportXlsx(filename: string): Promise<void>;
```

</details>

<details class="api-member" id="grid-search" data-pagefind-weight="1">
<summary><code>search</code> <span class="api-member-summary">Find cells matching query; highlights matches, emits search, returns the result.</span></summary>

```ts generated
search(query: string, opts?: SearchOptions): SearchResult;
```

</details>

<details class="api-member" id="grid-find-next" data-pagefind-weight="1">
<summary><code>findNext</code> <span class="api-member-summary">Move the active match to the next match and scroll it into view.</span></summary>

```ts generated
findNext(): SearchResult;
```

</details>

<details class="api-member" id="grid-find-prev" data-pagefind-weight="1">
<summary><code>findPrev</code> <span class="api-member-summary">Move the active match to the previous match and scroll it into view.</span></summary>

```ts generated
findPrev(): SearchResult;
```

</details>

<details class="api-member" id="grid-clear-search" data-pagefind-weight="1">
<summary><code>clearSearch</code> <span class="api-member-summary">Clear the current search and its highlights.</span></summary>

```ts generated
clearSearch(): void;
```

</details>

<details class="api-member" id="grid-replace-current" data-pagefind-weight="1">
<summary><code>replaceCurrent</code> <span class="api-member-summary">Replace the active match with replacement, then advance to the next match (re-scanning against the new data).</span></summary>

```ts generated
replaceCurrent(replacement: string): SearchResult;
```

<p class="api-member-doc">Replace the active match with `replacement`, then advance to the next match
(re-scanning against the new data). Only literal text/number cells are
eligible; formula and ref cells are skipped (formula source is never
rewritten). Honors the active <a href="/docs/api/core/search-options/"><code>SearchOptions</code></a> (matchCase; `wholeCell`
swaps the entire cell). The write flows through the grid's commit path as
one undoable step. No-op when read-only or when there is no active match.</p>
</details>

<details class="api-member" id="grid-replace-all" data-pagefind-weight="1">
<summary><code>replaceAll</code> <span class="api-member-summary">Replace every current match in a single undoable transaction (one undo() restores them all), then re-scan.</span></summary>

```ts generated
replaceAll(replacement: string): ReplaceResult;
```

<p class="api-member-doc">Replace every current match in a single undoable transaction (one
`undo()` restores them all), then re-scan. Formula/ref cells are skipped
and not counted. No-op when read-only.</p>
</details>

<details class="api-member" id="grid-insert-rows" data-pagefind-weight="1">
<summary><code>insertRows</code></summary>

```ts generated
insertRows(at: number, count?: number): void;
```

</details>

<details class="api-member" id="grid-remove-rows" data-pagefind-weight="1">
<summary><code>removeRows</code></summary>

```ts generated
removeRows(at: number, count?: number): void;
```

</details>

<details class="api-member" id="grid-insert-columns" data-pagefind-weight="1">
<summary><code>insertColumns</code></summary>

```ts generated
insertColumns(at: number, count?: number): void;
```

</details>

<details class="api-member" id="grid-remove-columns" data-pagefind-weight="1">
<summary><code>removeColumns</code></summary>

```ts generated
removeColumns(at: number, count?: number): void;
```

</details>

<details class="api-member" id="grid-add-sheet" data-pagefind-weight="1">
<summary><code>addSheet</code> <span class="api-member-summary">Add a sheet with a stable ID and return its actionable transaction outcome.</span></summary>

```ts generated
addSheet(input: AddSheetInput): SheetLifecycleResult;
```

</details>

<details class="api-member" id="grid-remove-sheet" data-pagefind-weight="1">
<summary><code>removeSheet</code> <span class="api-member-summary">Remove a sheet while preserving at least one visible worksheet.</span></summary>

```ts generated
removeSheet(id: SheetId): SheetLifecycleResult;
```

</details>

<details class="api-member" id="grid-rename-sheet" data-pagefind-weight="1">
<summary><code>renameSheet</code></summary>

```ts generated
renameSheet(id: SheetId, name: string): SheetLifecycleResult;
```

</details>

<details class="api-member" id="grid-move-sheet" data-pagefind-weight="1">
<summary><code>moveSheet</code></summary>

```ts generated
moveSheet(id: SheetId, toIndex: number): SheetLifecycleResult;
```

</details>

<details class="api-member" id="grid-set-sheet-visibility" data-pagefind-weight="1">
<summary><code>setSheetVisibility</code> <span class="api-member-summary">Set host-visible worksheet state; stock UI never offers veryHidden.</span></summary>

```ts generated
setSheetVisibility(id: SheetId, visibility: SheetVisibility): SheetLifecycleResult;
```

</details>

<details class="api-member" id="grid-set-conditional-formats" data-pagefind-weight="1">
<summary><code>setConditionalFormats</code></summary>

```ts generated
setConditionalFormats(rules: readonly ConditionalFormatRule[]): void;
```

</details>

<details class="api-member" id="grid-set-hyperlink" data-pagefind-weight="1">
<summary><code>setHyperlink</code></summary>

```ts generated
setHyperlink(hyperlink: CellHyperlink): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-remove-hyperlink" data-pagefind-weight="1">
<summary><code>removeHyperlink</code></summary>

```ts generated
removeHyperlink(id: string): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-get-hyperlink" data-pagefind-weight="1">
<summary><code>getHyperlink</code></summary>

```ts generated
getHyperlink(addr: CellAddress): CellHyperlink | null;
```

</details>

<details class="api-member" id="grid-activate-hyperlink" data-pagefind-weight="1">
<summary><code>activateHyperlink</code> <span class="api-member-summary">Validate and emit a host-owned activation event.</span></summary>

```ts generated
activateHyperlink(addr: CellAddress): boolean;
```

<p class="api-member-doc">Validate and emit a host-owned activation event. External targets are never
opened by Sheetwrite; internal navigation occurs only under the explicit policy.</p>
</details>

<details class="api-member" id="grid-set-validation-rule" data-pagefind-weight="1">
<summary><code>setValidationRule</code></summary>

```ts generated
setValidationRule(rule: DataValidationRule): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-remove-validation-rule" data-pagefind-weight="1">
<summary><code>removeValidationRule</code></summary>

```ts generated
removeValidationRule(id: string): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-set-protected-range" data-pagefind-weight="1">
<summary><code>setProtectedRange</code></summary>

```ts generated
setProtectedRange(protectedRange: ProtectedRange): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-remove-protected-range" data-pagefind-weight="1">
<summary><code>removeProtectedRange</code></summary>

```ts generated
removeProtectedRange(id: string): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-set-protection-resolver" data-pagefind-weight="1">
<summary><code>setProtectionResolver</code></summary>

```ts generated
setProtectionResolver(resolver: ProtectionResolver | undefined, mode?: MutationPolicyMode): void;
```

</details>

<details class="api-member" id="grid-set-note" data-pagefind-weight="1">
<summary><code>setNote</code></summary>

```ts generated
setNote(addr: CellAddress, text: string | null): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-get-note" data-pagefind-weight="1">
<summary><code>getNote</code></summary>

```ts generated
getNote(addr: CellAddress): string | null;
```

</details>

<details class="api-member" id="grid-set-overscan" data-pagefind-weight="1">
<summary><code>setOverscan</code> <span class="api-member-summary">Live-update the render window overscan (row/column positions painted past each edge); undefined restores the default of 6.</span></summary>

```ts generated
setOverscan(overscan?: number): void;
```

</details>

<details class="api-member" id="grid-set-min-columns" data-pagefind-weight="1">
<summary><code>setMinColumns</code> <span class="api-member-summary">Live-update the minimum rendered column count.</span></summary>

```ts generated
setMinColumns(minColumns?: number): void;
```

<p class="api-member-doc">Live-update the minimum rendered column count. Increasing the minimum
silently extends presentation padding; `undefined` restores the default.</p>
</details>

<details class="api-member" id="grid-highlight-cells" data-pagefind-weight="1">
<summary><code>highlightCells</code> <span class="api-member-summary">Highlight arbitrary cell ranges (null clears).</span></summary>

```ts generated
highlightCells(ranges: readonly HighlightRange[] | null, color?: string): void;
```

<p class="api-member-doc">Highlight arbitrary cell ranges (null clears). Per-range `color` wins over the call color.</p>
</details>

<details class="api-member" id="grid-set-presence-overlays" data-pagefind-weight="1">
<summary><code>setPresenceOverlays</code> <span class="api-member-summary">Replace ephemeral remote-presence overlays; null clears every collaborator.</span></summary>

```ts generated
setPresenceOverlays(overlays: readonly PresenceOverlay[] | null): void;
```

</details>

<details class="api-member" id="grid-style-range" data-pagefind-weight="1">
<summary><code>styleRange</code> <span class="api-member-summary">Merge style into every cell of range (null clears cell styles) as one undoable transaction.</span></summary>

```ts generated
styleRange(range: Range, style: Partial<CellStyle> | null): void;
```

<p class="api-member-doc">Merge `style` into every cell of `range` (null clears cell styles) as one
undoable transaction. Styles land in the store and paint in the canvas —
unlike <a href="/docs/api/vue/grid/#grid-highlight-cells"><code>highlightCells</code></a>, which draws a translucent overlay above it.</p>
</details>

<details class="api-member" id="grid-begin-edit" data-pagefind-weight="1">
<summary><code>beginEdit</code> <span class="api-member-summary">Open the cell editor at a view cell, optionally seeding text / selecting all.</span></summary>

```ts generated
beginEdit(row: number, col: number, initial?: string, selectAll?: boolean): void;
```

</details>

<details class="api-member" id="grid-data-edge" data-pagefind-weight="1">
<summary><code>dataEdge</code> <span class="api-member-summary">Ctrl+Arrow-style jump target: the data-run edge from (row, col) on the moved axis (row for vertical moves, col for horizontal), or null when the store is not columnar.</span></summary>

```ts generated
dataEdge(row: number, col: number, dRow: number, dCol: number): number | null;
```

<p class="api-member-doc">Ctrl+Arrow-style jump target: the data-run edge from (row, col) on the
moved axis (row for vertical moves, col for horizontal), or null when the
store is not columnar. Under an active sort/filter view, `row` is a view
position and vertical moves return view positions. For hosts building
their own keymaps (`config.keyboard`).</p>
</details>

<details class="api-member" id="grid-set-row-height" data-pagefind-weight="1">
<summary><code>setRowHeight</code> <span class="api-member-summary">Set one row's persistent display height through document history.</span></summary>

```ts generated
setRowHeight(row: number, height: number): void;
```

</details>

<details class="api-member" id="grid-set-column-width" data-pagefind-weight="1">
<summary><code>setColumnWidth</code> <span class="api-member-summary">Set one column's width via an undoable setColumn patch.</span></summary>

```ts generated
setColumnWidth(col: number, width: number): void;
```

</details>

<details class="api-member" id="grid-auto-fit-rows" data-pagefind-weight="1">
<summary><code>autoFitRows</code> <span class="api-member-summary">Explicitly resize rows to fit wrapped content; never runs during paint.</span></summary>

```ts generated
autoFitRows(range?: Range): void;
```

</details>

<details class="api-member" id="grid-auto-fit-columns" data-pagefind-weight="1">
<summary><code>autoFitColumns</code> <span class="api-member-summary">Explicitly resize columns from a bulk worksheet read.</span></summary>

```ts generated
autoFitColumns(cols?: readonly number[]): void;
```

</details>

<details class="api-member" id="grid-set-frozen" data-pagefind-weight="1">
<summary><code>setFrozen</code> <span class="api-member-summary">Pin the first rows view rows and cols columns; they stay visible while the body scrolls (0 = unfreeze that axis).</span></summary>

```ts generated
setFrozen(rows: number, cols?: number): void;
```

<p class="api-member-doc">Pin the first `rows` view rows and `cols` columns; they stay visible while
the body scrolls (0 = unfreeze that axis). Persisted on the active sheet.</p>
</details>

<details class="api-member" id="grid-set-zoom" data-pagefind-weight="1">
<summary><code>setZoom</code> <span class="api-member-summary">Content zoom factor (0.5–2): scales row/column geometry and fonts.</span></summary>

```ts generated
setZoom(zoom: number): void;
```

</details>

<details class="api-member" id="grid-get-zoom" data-pagefind-weight="1">
<summary><code>getZoom</code></summary>

```ts generated
getZoom(): number;
```

</details>

<details class="api-member" id="grid-renderer-kind" data-pagefind-weight="1">
<summary><code>rendererKind</code> <span class="api-member-summary">Which renderer is actually active: &quot;worker&quot; when the OffscreenCanvas worker constructed successfully, &quot;canvas&quot; otherwise (including after a renderer-fallback).</span></summary>

```ts generated
rendererKind(): "canvas" | "worker";
```

</details>

<details class="api-member" id="grid-on" data-pagefind-weight="1">
<summary><code>on</code></summary>

```ts generated
on<E extends keyof GridEvents>(evt: E, fn: (e: GridEvents[E]) => void): () => void;
```

</details>

<details class="api-member" id="grid-refresh" data-pagefind-weight="1">
<summary><code>refresh</code></summary>

```ts generated
refresh(): void;
```

</details>

<details class="api-member" id="grid-destroy" data-pagefind-weight="1">
<summary><code>destroy</code></summary>

```ts generated
destroy(): void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface Grid {
  readonly store: Store;
  readonly actions: GridActions;
  getRuntimeResourceSnapshot(
    operation: RuntimeResourceOperation,
    phase: RuntimeResourcePhase,
    runtime?: RuntimeMemoryObservation,
  ): RuntimeResourceSnapshot;
  getCommandState(command: GridCommandName): GridCommandState;
  setActiveSheet(id: SheetId): void;
  scrollToCell(addr: CellAddress): void;
  getCellAtPoint(clientX: number, clientY: number): CellAddress | null;
  getActiveSheet(): SheetId;
  getCellInput(row: number, col: number): CellInputSnapshot | null;
  getSelection(): Selection | null;
  setSelection(sel: Selection | null): void;
  setTheme(theme: Partial<Theme>): void;
  replaceTheme(theme: Partial<Theme> | undefined): void;
  getEffectiveTheme(): Theme;
  setReadOnly(readOnly: boolean): void;
  setConfig(config: GridConfig | undefined): void;
  applyTransaction(transaction: GridTransaction): ApplyTransactionResult;
  exportSnapshot(): WorkbookSnapshot;
  applyRemoteOperations(
    operations: readonly DocumentOp[],
    options?: RemoteOperationOptions,
  ): ApplyTransactionResult;
  defineCellRenderer(name: string, renderer: CellRenderer): void;
  aggregate(col: number, op: AggregateOp): number;
  sortBy(col: number, ascending?: boolean): void;
  sortByMulti(keys: readonly SortKey[]): void;
  filterBy(col: number, needle: string): void;
  setColumnFilter(col: number, filter: ColumnFilter | null): void;
  setSort(keys: readonly SortKey[]): ApplyTransactionResult;
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
  addSheet(input: AddSheetInput): SheetLifecycleResult;
  removeSheet(id: SheetId): SheetLifecycleResult;
  renameSheet(id: SheetId, name: string): SheetLifecycleResult;
  moveSheet(id: SheetId, toIndex: number): SheetLifecycleResult;
  setSheetVisibility(
    id: SheetId,
    visibility: SheetVisibility,
  ): SheetLifecycleResult;
  setConditionalFormats(rules: readonly ConditionalFormatRule[]): void;
  setHyperlink(hyperlink: CellHyperlink): ApplyTransactionResult;
  removeHyperlink(id: string): ApplyTransactionResult;
  getHyperlink(addr: CellAddress): CellHyperlink | null;
  activateHyperlink(addr: CellAddress): boolean;
  setValidationRule(rule: DataValidationRule): ApplyTransactionResult;
  removeValidationRule(id: string): ApplyTransactionResult;
  setProtectedRange(protectedRange: ProtectedRange): ApplyTransactionResult;
  removeProtectedRange(id: string): ApplyTransactionResult;
  setProtectionResolver(
    resolver: ProtectionResolver | undefined,
    mode?: MutationPolicyMode,
  ): void;
  setNote(addr: CellAddress, text: string | null): ApplyTransactionResult;
  getNote(addr: CellAddress): string | null;
  setOverscan(overscan?: number): void;
  setMinColumns(minColumns?: number): void;
  highlightCells(
    ranges: readonly HighlightRange[] | null,
    color?: string,
  ): void;
  setPresenceOverlays(overlays: readonly PresenceOverlay[] | null): void;
  styleRange(range: Range, style: Partial<CellStyle> | null): void;
  beginEdit(
    row: number,
    col: number,
    initial?: string,
    selectAll?: boolean,
  ): void;
  dataEdge(
    row: number,
    col: number,
    dRow: number,
    dCol: number,
  ): number | null;
  setRowHeight(row: number, height: number): void;
  setColumnWidth(col: number, width: number): void;
  autoFitRows(range?: Range): void;
  autoFitColumns(cols?: readonly number[]): void;
  setFrozen(rows: number, cols?: number): void;
  setZoom(zoom: number): void;
  getZoom(): number;
  rendererKind(): "canvas" | "worker";
  on<E extends keyof GridEvents>(
    evt: E,
    fn: (e: GridEvents[E]) => void,
  ): () => void;
  refresh(): void;
  destroy(): void;
}
```

</details>
