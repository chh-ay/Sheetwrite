---
title: "Grid | @sheetwrite/vue"
description: "Imperative grid handle for document commands, events, rendering, and teardown."
tableOfContents: false
---
<!-- api-export:@sheetwrite/vue|.|Grid -->
[← @sheetwrite/vue](/docs/api/vue/)

<span class="api-status">interface</span>

Imperative grid handle for document commands, events, rendering, and teardown.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/vue</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/dist/types/grid.d.ts#L265</code></dd></div>
</dl>

## Members <span class="api-count">81</span>

<div class="api-member-list">

<details class="api-member" id="grid-store" data-pagefind-weight="1">
<summary><code>store</code></summary>
<pre><code>readonly store: Store;</code></pre>
</details>

<details class="api-member" id="grid-actions" data-pagefind-weight="1">
<summary><code>actions</code></summary>
<pre><code>readonly actions: GridActions;</code></pre>
</details>

<details class="api-member" id="grid-set-active-sheet" data-pagefind-weight="1">
<summary><code>setActiveSheet</code></summary>
<pre><code>setActiveSheet(id: SheetId): void;</code></pre>
</details>

<details class="api-member" id="grid-scroll-to-cell" data-pagefind-weight="1">
<summary><code>scrollToCell</code></summary>
<pre><code>scrollToCell(addr: CellAddress): void;</code></pre>
</details>

<details class="api-member" id="grid-get-cell-at-point" data-pagefind-weight="1">
<summary><code>getCellAtPoint</code></summary>
<pre><code>getCellAtPoint(clientX: number, clientY: number): CellAddress | null;</code></pre>
</details>

<details class="api-member" id="grid-get-active-sheet" data-pagefind-weight="1">
<summary><code>getActiveSheet</code></summary>
<pre><code>getActiveSheet(): SheetId;</code></pre>
</details>

<details class="api-member" id="grid-get-cell-input" data-pagefind-weight="1">
<summary><code>getCellInput</code></summary>
<pre><code>getCellInput(row: number, col: number): CellInputSnapshot | null;</code></pre>
</details>

<details class="api-member" id="grid-get-selection" data-pagefind-weight="1">
<summary><code>getSelection</code></summary>
<pre><code>getSelection(): Selection | null;</code></pre>
</details>

<details class="api-member" id="grid-set-selection" data-pagefind-weight="1">
<summary><code>setSelection</code></summary>
<pre><code>setSelection(sel: Selection | null): void;</code></pre>
</details>

<details class="api-member" id="grid-set-theme" data-pagefind-weight="1">
<summary><code>setTheme</code></summary>
<pre><code>setTheme(theme: Partial&lt;Theme&gt;): void;</code></pre>
</details>

<details class="api-member" id="grid-replace-theme" data-pagefind-weight="1">
<summary><code>replaceTheme</code></summary>
<pre><code>replaceTheme(theme: Partial&lt;Theme&gt; | undefined): void;</code></pre>
</details>

<details class="api-member" id="grid-get-effective-theme" data-pagefind-weight="1">
<summary><code>getEffectiveTheme</code></summary>
<pre><code>getEffectiveTheme(): Theme;</code></pre>
</details>

<details class="api-member" id="grid-set-read-only" data-pagefind-weight="1">
<summary><code>setReadOnly</code></summary>
<pre><code>setReadOnly(readOnly: boolean): void;</code></pre>
</details>

<details class="api-member" id="grid-set-config" data-pagefind-weight="1">
<summary><code>setConfig</code></summary>
<pre><code>setConfig(config: GridConfig | undefined): void;</code></pre>
</details>

<details class="api-member" id="grid-apply-transaction" data-pagefind-weight="1">
<summary><code>applyTransaction</code></summary>
<pre><code>applyTransaction(transaction: GridTransaction): ApplyTransactionResult;</code></pre>
</details>

<details class="api-member" id="grid-export-snapshot" data-pagefind-weight="1">
<summary><code>exportSnapshot</code></summary>
<pre><code>exportSnapshot(): WorkbookSnapshot;</code></pre>
</details>

<details class="api-member" id="grid-apply-remote-operations" data-pagefind-weight="1">
<summary><code>applyRemoteOperations</code></summary>
<pre><code>applyRemoteOperations(operations: readonly DocumentOp[], options?: RemoteOperationOptions): ApplyTransactionResult;</code></pre>
</details>

<details class="api-member" id="grid-define-cell-renderer" data-pagefind-weight="1">
<summary><code>defineCellRenderer</code></summary>
<pre><code>defineCellRenderer(name: string, renderer: CellRenderer): void;</code></pre>
</details>

<details class="api-member" id="grid-aggregate" data-pagefind-weight="1">
<summary><code>aggregate</code></summary>
<pre><code>aggregate(col: number, op: AggregateOp): number;</code></pre>
</details>

<details class="api-member" id="grid-sort-by" data-pagefind-weight="1">
<summary><code>sortBy</code></summary>
<pre><code>sortBy(col: number, ascending?: boolean): void;</code></pre>
</details>

<details class="api-member" id="grid-sort-by-multi" data-pagefind-weight="1">
<summary><code>sortByMulti</code></summary>
<pre><code>sortByMulti(keys: readonly SortKey[]): void;</code></pre>
</details>

<details class="api-member" id="grid-filter-by" data-pagefind-weight="1">
<summary><code>filterBy</code></summary>
<pre><code>filterBy(col: number, needle: string): void;</code></pre>
</details>

<details class="api-member" id="grid-set-column-filter" data-pagefind-weight="1">
<summary><code>setColumnFilter</code></summary>
<pre><code>setColumnFilter(col: number, filter: ColumnFilter | null): void;</code></pre>
</details>

<details class="api-member" id="grid-set-sort" data-pagefind-weight="1">
<summary><code>setSort</code></summary>
<pre><code>setSort(keys: readonly SortKey[]): ApplyTransactionResult;</code></pre>
</details>

<details class="api-member" id="grid-get-column-filters" data-pagefind-weight="1">
<summary><code>getColumnFilters</code></summary>
<pre><code>getColumnFilters(): ReadonlyMap&lt;number, ColumnFilter&gt;;</code></pre>
</details>

<details class="api-member" id="grid-distinct-values" data-pagefind-weight="1">
<summary><code>distinctValues</code></summary>
<pre><code>distinctValues(col: number, limit?: number): CellScalar[];</code></pre>
</details>

<details class="api-member" id="grid-hide-rows" data-pagefind-weight="1">
<summary><code>hideRows</code></summary>
<pre><code>hideRows(rows: readonly number[]): void;</code></pre>
</details>

<details class="api-member" id="grid-show-rows" data-pagefind-weight="1">
<summary><code>showRows</code></summary>
<pre><code>showRows(rows?: readonly number[]): void;</code></pre>
</details>

<details class="api-member" id="grid-hidden-rows" data-pagefind-weight="1">
<summary><code>hiddenRows</code></summary>
<pre><code>hiddenRows(): readonly number[];</code></pre>
</details>

<details class="api-member" id="grid-hide-columns" data-pagefind-weight="1">
<summary><code>hideColumns</code></summary>
<pre><code>hideColumns(cols?: readonly number[]): void;</code></pre>
</details>

<details class="api-member" id="grid-show-columns" data-pagefind-weight="1">
<summary><code>showColumns</code></summary>
<pre><code>showColumns(cols?: readonly number[]): void;</code></pre>
</details>

<details class="api-member" id="grid-hidden-columns" data-pagefind-weight="1">
<summary><code>hiddenColumns</code></summary>
<pre><code>hiddenColumns(): readonly number[];</code></pre>
</details>

<details class="api-member" id="grid-group-rows" data-pagefind-weight="1">
<summary><code>groupRows</code></summary>
<pre><code>groupRows(start: number, end: number): void;</code></pre>
</details>

<details class="api-member" id="grid-ungroup-rows" data-pagefind-weight="1">
<summary><code>ungroupRows</code></summary>
<pre><code>ungroupRows(start: number, end: number): void;</code></pre>
</details>

<details class="api-member" id="grid-set-group-collapsed" data-pagefind-weight="1">
<summary><code>setGroupCollapsed</code></summary>
<pre><code>setGroupCollapsed(start: number, collapsed: boolean): void;</code></pre>
</details>

<details class="api-member" id="grid-row-groups" data-pagefind-weight="1">
<summary><code>rowGroups</code></summary>
<pre><code>rowGroups(): readonly RowGroup[];</code></pre>
</details>

<details class="api-member" id="grid-clear-view" data-pagefind-weight="1">
<summary><code>clearView</code></summary>
<pre><code>clearView(): void;</code></pre>
</details>

<details class="api-member" id="grid-undo" data-pagefind-weight="1">
<summary><code>undo</code></summary>
<pre><code>undo(): void;</code></pre>
</details>

<details class="api-member" id="grid-redo" data-pagefind-weight="1">
<summary><code>redo</code></summary>
<pre><code>redo(): void;</code></pre>
</details>

<details class="api-member" id="grid-export-csv" data-pagefind-weight="1">
<summary><code>exportCsv</code></summary>
<pre><code>exportCsv(filename: string): void;</code></pre>
</details>

<details class="api-member" id="grid-export-xlsx" data-pagefind-weight="1">
<summary><code>exportXlsx</code></summary>
<pre><code>exportXlsx(filename: string): Promise&lt;void&gt;;</code></pre>
</details>

<details class="api-member" id="grid-search" data-pagefind-weight="1">
<summary><code>search</code></summary>
<pre><code>search(query: string, opts?: SearchOptions): SearchResult;</code></pre>
</details>

<details class="api-member" id="grid-find-next" data-pagefind-weight="1">
<summary><code>findNext</code></summary>
<pre><code>findNext(): SearchResult;</code></pre>
</details>

<details class="api-member" id="grid-find-prev" data-pagefind-weight="1">
<summary><code>findPrev</code></summary>
<pre><code>findPrev(): SearchResult;</code></pre>
</details>

<details class="api-member" id="grid-clear-search" data-pagefind-weight="1">
<summary><code>clearSearch</code></summary>
<pre><code>clearSearch(): void;</code></pre>
</details>

<details class="api-member" id="grid-replace-current" data-pagefind-weight="1">
<summary><code>replaceCurrent</code></summary>
<pre><code>replaceCurrent(replacement: string): SearchResult;</code></pre>
</details>

<details class="api-member" id="grid-replace-all" data-pagefind-weight="1">
<summary><code>replaceAll</code></summary>
<pre><code>replaceAll(replacement: string): ReplaceResult;</code></pre>
</details>

<details class="api-member" id="grid-insert-rows" data-pagefind-weight="1">
<summary><code>insertRows</code></summary>
<pre><code>insertRows(at: number, count?: number): void;</code></pre>
</details>

<details class="api-member" id="grid-remove-rows" data-pagefind-weight="1">
<summary><code>removeRows</code></summary>
<pre><code>removeRows(at: number, count?: number): void;</code></pre>
</details>

<details class="api-member" id="grid-insert-columns" data-pagefind-weight="1">
<summary><code>insertColumns</code></summary>
<pre><code>insertColumns(at: number, count?: number): void;</code></pre>
</details>

<details class="api-member" id="grid-remove-columns" data-pagefind-weight="1">
<summary><code>removeColumns</code></summary>
<pre><code>removeColumns(at: number, count?: number): void;</code></pre>
</details>

<details class="api-member" id="grid-add-sheet" data-pagefind-weight="1">
<summary><code>addSheet</code></summary>
<pre><code>addSheet(input: AddSheetInput): SheetId;</code></pre>
</details>

<details class="api-member" id="grid-remove-sheet" data-pagefind-weight="1">
<summary><code>removeSheet</code></summary>
<pre><code>removeSheet(id: SheetId): void;</code></pre>
</details>

<details class="api-member" id="grid-rename-sheet" data-pagefind-weight="1">
<summary><code>renameSheet</code></summary>
<pre><code>renameSheet(id: SheetId, name: string): void;</code></pre>
</details>

<details class="api-member" id="grid-move-sheet" data-pagefind-weight="1">
<summary><code>moveSheet</code></summary>
<pre><code>moveSheet(id: SheetId, toIndex: number): void;</code></pre>
</details>

<details class="api-member" id="grid-set-conditional-formats" data-pagefind-weight="1">
<summary><code>setConditionalFormats</code></summary>
<pre><code>setConditionalFormats(rules: readonly ConditionalFormatRule[]): void;</code></pre>
</details>

<details class="api-member" id="grid-set-validation-rule" data-pagefind-weight="1">
<summary><code>setValidationRule</code></summary>
<pre><code>setValidationRule(rule: DataValidationRule): ApplyTransactionResult;</code></pre>
</details>

<details class="api-member" id="grid-remove-validation-rule" data-pagefind-weight="1">
<summary><code>removeValidationRule</code></summary>
<pre><code>removeValidationRule(id: string): ApplyTransactionResult;</code></pre>
</details>

<details class="api-member" id="grid-set-protected-range" data-pagefind-weight="1">
<summary><code>setProtectedRange</code></summary>
<pre><code>setProtectedRange(protectedRange: ProtectedRange): ApplyTransactionResult;</code></pre>
</details>

<details class="api-member" id="grid-remove-protected-range" data-pagefind-weight="1">
<summary><code>removeProtectedRange</code></summary>
<pre><code>removeProtectedRange(id: string): ApplyTransactionResult;</code></pre>
</details>

<details class="api-member" id="grid-set-protection-resolver" data-pagefind-weight="1">
<summary><code>setProtectionResolver</code></summary>
<pre><code>setProtectionResolver(resolver: ProtectionResolver | undefined, mode?: MutationPolicyMode): void;</code></pre>
</details>

<details class="api-member" id="grid-set-note" data-pagefind-weight="1">
<summary><code>setNote</code></summary>
<pre><code>setNote(addr: CellAddress, text: string | null): ApplyTransactionResult;</code></pre>
</details>

<details class="api-member" id="grid-get-note" data-pagefind-weight="1">
<summary><code>getNote</code></summary>
<pre><code>getNote(addr: CellAddress): string | null;</code></pre>
</details>

<details class="api-member" id="grid-set-overscan" data-pagefind-weight="1">
<summary><code>setOverscan</code></summary>
<pre><code>setOverscan(overscan?: number): void;</code></pre>
</details>

<details class="api-member" id="grid-set-min-columns" data-pagefind-weight="1">
<summary><code>setMinColumns</code></summary>
<pre><code>setMinColumns(minColumns?: number): void;</code></pre>
</details>

<details class="api-member" id="grid-highlight-cells" data-pagefind-weight="1">
<summary><code>highlightCells</code></summary>
<pre><code>highlightCells(ranges: readonly HighlightRange[] | null, color?: string): void;</code></pre>
</details>

<details class="api-member" id="grid-set-presence-overlays" data-pagefind-weight="1">
<summary><code>setPresenceOverlays</code></summary>
<pre><code>setPresenceOverlays(overlays: readonly PresenceOverlay[] | null): void;</code></pre>
</details>

<details class="api-member" id="grid-style-range" data-pagefind-weight="1">
<summary><code>styleRange</code></summary>
<pre><code>styleRange(range: Range, style: Partial&lt;CellStyle&gt; | null): void;</code></pre>
</details>

<details class="api-member" id="grid-begin-edit" data-pagefind-weight="1">
<summary><code>beginEdit</code></summary>
<pre><code>beginEdit(row: number, col: number, initial?: string, selectAll?: boolean): void;</code></pre>
</details>

<details class="api-member" id="grid-data-edge" data-pagefind-weight="1">
<summary><code>dataEdge</code></summary>
<pre><code>dataEdge(row: number, col: number, dRow: number, dCol: number): number | null;</code></pre>
</details>

<details class="api-member" id="grid-set-row-height" data-pagefind-weight="1">
<summary><code>setRowHeight</code></summary>
<pre><code>setRowHeight(row: number, height: number): void;</code></pre>
</details>

<details class="api-member" id="grid-set-column-width" data-pagefind-weight="1">
<summary><code>setColumnWidth</code></summary>
<pre><code>setColumnWidth(col: number, width: number): void;</code></pre>
</details>

<details class="api-member" id="grid-auto-fit-rows" data-pagefind-weight="1">
<summary><code>autoFitRows</code></summary>
<pre><code>autoFitRows(range?: Range): void;</code></pre>
</details>

<details class="api-member" id="grid-auto-fit-columns" data-pagefind-weight="1">
<summary><code>autoFitColumns</code></summary>
<pre><code>autoFitColumns(cols?: readonly number[]): void;</code></pre>
</details>

<details class="api-member" id="grid-set-frozen" data-pagefind-weight="1">
<summary><code>setFrozen</code></summary>
<pre><code>setFrozen(rows: number, cols?: number): void;</code></pre>
</details>

<details class="api-member" id="grid-set-zoom" data-pagefind-weight="1">
<summary><code>setZoom</code></summary>
<pre><code>setZoom(zoom: number): void;</code></pre>
</details>

<details class="api-member" id="grid-get-zoom" data-pagefind-weight="1">
<summary><code>getZoom</code></summary>
<pre><code>getZoom(): number;</code></pre>
</details>

<details class="api-member" id="grid-renderer-kind" data-pagefind-weight="1">
<summary><code>rendererKind</code></summary>
<pre><code>rendererKind(): &quot;canvas&quot; | &quot;worker&quot;;</code></pre>
</details>

<details class="api-member" id="grid-on" data-pagefind-weight="1">
<summary><code>on</code></summary>
<pre><code>on&lt;E extends keyof GridEvents&gt;(evt: E, fn: (e: GridEvents[E]) =&gt; void): () =&gt; void;</code></pre>
</details>

<details class="api-member" id="grid-refresh" data-pagefind-weight="1">
<summary><code>refresh</code></summary>
<pre><code>refresh(): void;</code></pre>
</details>

<details class="api-member" id="grid-destroy" data-pagefind-weight="1">
<summary><code>destroy</code></summary>
<pre><code>destroy(): void;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface Grid {
    readonly store: Store;
    readonly actions: GridActions;
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
    applyRemoteOperations(operations: readonly DocumentOp[], options?: RemoteOperationOptions): ApplyTransactionResult;
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
    addSheet(input: AddSheetInput): SheetId;
    removeSheet(id: SheetId): void;
    renameSheet(id: SheetId, name: string): void;
    moveSheet(id: SheetId, toIndex: number): void;
    setConditionalFormats(rules: readonly ConditionalFormatRule[]): void;
    setValidationRule(rule: DataValidationRule): ApplyTransactionResult;
    removeValidationRule(id: string): ApplyTransactionResult;
    setProtectedRange(protectedRange: ProtectedRange): ApplyTransactionResult;
    removeProtectedRange(id: string): ApplyTransactionResult;
    setProtectionResolver(resolver: ProtectionResolver | undefined, mode?: MutationPolicyMode): void;
    setNote(addr: CellAddress, text: string | null): ApplyTransactionResult;
    getNote(addr: CellAddress): string | null;
    setOverscan(overscan?: number): void;
    setMinColumns(minColumns?: number): void;
    highlightCells(ranges: readonly HighlightRange[] | null, color?: string): void;
    setPresenceOverlays(overlays: readonly PresenceOverlay[] | null): void;
    styleRange(range: Range, style: Partial<CellStyle> | null): void;
    beginEdit(row: number, col: number, initial?: string, selectAll?: boolean): void;
    dataEdge(row: number, col: number, dRow: number, dCol: number): number | null;
    setRowHeight(row: number, height: number): void;
    setColumnWidth(col: number, width: number): void;
    autoFitRows(range?: Range): void;
    autoFitColumns(cols?: readonly number[]): void;
    setFrozen(rows: number, cols?: number): void;
    setZoom(zoom: number): void;
    getZoom(): number;
    rendererKind(): "canvas" | "worker";
    on<E extends keyof GridEvents>(evt: E, fn: (e: GridEvents[E]) => void): () => void;
    refresh(): void;
    destroy(): void;
}
```

</details>
