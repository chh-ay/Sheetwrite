---
title: "Store | @sheetwrite/core"
description: "Columnar workbook storage, query, transaction, and subscription contract."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|Store -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Columnar workbook storage, query, transaction, and subscription contract.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/store.ts#L81</code></dd></div>
</dl>

## Members <span class="api-count">15</span>

<div class="api-member-list">

<details class="api-member" id="store-get-workbook" data-pagefind-weight="1">
<summary><code>getWorkbook</code></summary>
<pre><code>getWorkbook(): Workbook;</code></pre>
</details>

<details class="api-member" id="store-get-cell" data-pagefind-weight="1">
<summary><code>getCell</code></summary>
<pre><code>getCell(addr: CellAddress): ResolvedCell;</code></pre>
</details>

<details class="api-member" id="store-get-formula" data-pagefind-weight="1">
<summary><code>getFormula</code></summary>
<pre><code>getFormula(addr: CellAddress): string | null;</code></pre>
</details>

<details class="api-member" id="store-get-ref-target" data-pagefind-weight="1">
<summary><code>getRefTarget</code></summary>
<pre><code>getRefTarget(addr: CellAddress): CellAddress | null;</code></pre>
</details>

<details class="api-member" id="store-recalculate-volatile" data-pagefind-weight="1">
<summary><code>recalculateVolatile</code></summary>
<pre><code>recalculateVolatile(now?: Date): void;</code></pre>
</details>

<details class="api-member" id="store-get-visible-window" data-pagefind-weight="1">
<summary><code>getVisibleWindow</code></summary>
<pre><code>getVisibleWindow( sheet: SheetId, rows: { start: number; end: number }, cols: readonly number[], ): VisibleWindowView;</code></pre>
</details>

<details class="api-member" id="store-ensure-columns" data-pagefind-weight="1">
<summary><code>ensureColumns</code></summary>
<pre><code>ensureColumns(sheet: SheetId, columns: readonly Column[]): void;</code></pre>
</details>

<details class="api-member" id="store-apply-transaction" data-pagefind-weight="1">
<summary><code>applyTransaction</code></summary>
<pre><code>applyTransaction( tx: Transaction, options?: TransactionApplicationOptions, ): ApplyTransactionResult;</code></pre>
</details>

<details class="api-member" id="store-set-protection-resolver" data-pagefind-weight="1">
<summary><code>setProtectionResolver</code></summary>
<pre><code>setProtectionResolver?(resolver: ProtectionResolver | undefined, mode?: MutationPolicyMode): void;</code></pre>
</details>

<details class="api-member" id="store-on" data-pagefind-weight="1">
<summary><code>on</code></summary>
<pre><code>on(evt: &quot;change&quot;, fn: (event: ChangeEvent) =&gt; void): () =&gt; void;</code></pre>
</details>

<details class="api-member" id="store-query-capability" data-pagefind-weight="1">
<summary><code>queryCapability</code></summary>
<pre><code>queryCapability?(sheet: SheetId): QueryCapability;</code></pre>
</details>

<details class="api-member" id="store-get-cell-load-state" data-pagefind-weight="1">
<summary><code>getCellLoadState</code></summary>
<pre><code>getCellLoadState?(addr: CellAddress): CellLoadState;</code></pre>
</details>

<details class="api-member" id="store-acknowledge-operations" data-pagefind-weight="1">
<summary><code>acknowledgeOperations</code></summary>
<pre><code>acknowledgeOperations?(operations: readonly DocumentOp[]): void;</code></pre>
</details>

<details class="api-member" id="store-export-snapshot" data-pagefind-weight="1">
<summary><code>exportSnapshot</code></summary>
<pre><code>exportSnapshot?(): WorkbookSnapshot;</code></pre>
</details>

<details class="api-member" id="store-view-row-count" data-pagefind-weight="1">
<summary><code>viewRowCount</code></summary>
<pre><code>viewRowCount(sheet: SheetId): number;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface Store {
    getWorkbook(): Workbook;
    getCell(addr: CellAddress): ResolvedCell;
    getFormula(addr: CellAddress): string | null;
    getRefTarget(addr: CellAddress): CellAddress | null;
    recalculateVolatile(now?: Date): void;
    getVisibleWindow(sheet: SheetId, rows: {
        start: number;
        end: number;
    }, cols: readonly number[]): VisibleWindowView;
    ensureColumns(sheet: SheetId, columns: readonly Column[]): void;
    applyTransaction(tx: Transaction, options?: TransactionApplicationOptions): ApplyTransactionResult;
    setProtectionResolver?(resolver: ProtectionResolver | undefined, mode?: MutationPolicyMode): void;
    on(evt: "change", fn: (event: ChangeEvent) => void): () => void;
    queryCapability?(sheet: SheetId): QueryCapability;
    getCellLoadState?(addr: CellAddress): CellLoadState;
    acknowledgeOperations?(operations: readonly DocumentOp[]): void;
    exportSnapshot?(): WorkbookSnapshot;
    viewRowCount(sheet: SheetId): number;
}
```

</details>
