---
title: "Store | @sheetwrite/core"
description: "Columnar workbook storage, query, transaction, and subscription contract."
---
<!-- api-export:@sheetwrite/core|.|Store -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Columnar workbook storage, query, transaction, and subscription contract.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/store.ts#L120</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>17</span>

<div class="api-member-list">

<details class="api-member" id="store-get-workbook" data-pagefind-weight="1">
<summary><code>getWorkbook</code></summary>

```ts generated
getWorkbook(): Workbook;
```

</details>

<details class="api-member" id="store-get-cell" data-pagefind-weight="1">
<summary><code>getCell</code> <span class="api-member-summary">Single-cell read for interactions, API reads, and tests.</span></summary>

```ts generated
getCell(addr: CellAddress): ResolvedCell;
```

<p class="api-member-doc">Single-cell read for interactions, API reads, and tests.
NOT for the render hot path — renderers use `getVisibleWindow`.</p>
</details>

<details class="api-member" id="store-get-formula" data-pagefind-weight="1">
<summary><code>getFormula</code> <span class="api-member-summary">Formula source at addr, or null when the cell is not a formula.</span></summary>

```ts generated
getFormula(addr: CellAddress): string | null;
```

</details>

<details class="api-member" id="store-get-ref-target" data-pagefind-weight="1">
<summary><code>getRefTarget</code> <span class="api-member-summary">Plain-reference target at addr, or null when the cell is not a ref.</span></summary>

```ts generated
getRefTarget(addr: CellAddress): CellAddress | null;
```

</details>

<details class="api-member" id="store-recalculate-volatile" data-pagefind-weight="1">
<summary><code>recalculateVolatile</code> <span class="api-member-summary">Recompute volatile formulas (TODAY/NOW) from one captured instant.</span></summary>

```ts generated
recalculateVolatile(now?: Date): void;
```

<p class="api-member-doc">Recompute volatile formulas (`TODAY`/`NOW`) from one captured instant.
The supplied Date is interpreted as an absolute UTC instant.</p>
</details>

<details class="api-member" id="store-get-visible-window" data-pagefind-weight="1">
<summary><code>getVisibleWindow</code> <span class="api-member-summary">Bulk read of a visible window; the only read a renderer should use per frame.</span></summary>

```ts generated
getVisibleWindow( sheet: SheetId, rows: { start: number; end: number }, cols: readonly number[], ): VisibleWindowView;
```

</details>

<details class="api-member" id="store-get-data-window" data-pagefind-weight="1">
<summary><code>getDataWindow</code> <span class="api-member-summary">Optional packed canonical data-row window used by file export.</span></summary>

```ts generated
getDataWindow?( sheet: SheetId, rows: { start: number; end: number }, cols: readonly number[], ): VisibleWindowView;
```

<p class="api-member-doc">Optional packed canonical data-row window used by file export. Unlike
`getVisibleWindow`, sort/filter state never remaps `rows`.</p>
</details>

<details class="api-member" id="store-get-clipboard-window" data-pagefind-weight="1">
<summary><code>getClipboardWindow</code> <span class="api-member-summary">Optional packed clipboard read.</span></summary>

```ts generated
getClipboardWindow?( sheet: SheetId, viewRows: { start: number; end: number }, cols: readonly number[], ): ClipboardWindowView;
```

<p class="api-member-doc">Optional packed clipboard read. Custom stores may omit it; the controller
preserves the per-cell Store fallback contract.</p>
</details>

<details class="api-member" id="store-ensure-columns" data-pagefind-weight="1">
<summary><code>ensureColumns</code> <span class="api-member-summary">Ensure a sheet can address at least columns.length columns without producing user changes or dirty patches.</span></summary>

```ts generated
ensureColumns(sheet: SheetId, columns: readonly Column[]): void;
```

<p class="api-member-doc">Ensure a sheet can address at least `columns.length` columns without
producing user changes or dirty patches. Used for presentation padding.</p>
</details>

<details class="api-member" id="store-apply-transaction" data-pagefind-weight="1">
<summary><code>applyTransaction</code> <span class="api-member-summary">Apply a low-level storage transaction.</span></summary>

```ts generated
applyTransaction( tx: Transaction, options?: TransactionApplicationOptions, ): ApplyTransactionResult;
```

<p class="api-member-doc">Apply a low-level storage transaction.

This bypasses Grid read-only checks and Grid undo/redo history. Use
`Grid.applyTransaction` for normal host-driven edits.
Queued and flushed at a barrier — never reentrant.</p>
</details>

<details class="api-member" id="store-set-protection-resolver" data-pagefind-weight="1">
<summary><code>setProtectionResolver</code> <span class="api-member-summary">Configure host-owned protected-range permissions.</span></summary>

```ts generated
setProtectionResolver?(resolver: ProtectionResolver | undefined, mode?: MutationPolicyMode): void;
```

<p class="api-member-doc">Configure host-owned protected-range permissions. The resolver is synchronous
so every local mutation ingress shares one atomic commit barrier.</p>
</details>

<details class="api-member" id="store-on" data-pagefind-weight="1">
<summary><code>on</code></summary>

```ts generated
on(evt: "change", fn: (event: ChangeEvent) => void): () => void;
```

</details>

<details class="api-member" id="store-query-capability" data-pagefind-weight="1">
<summary><code>queryCapability</code> <span class="api-member-summary">Explicit partial-data state for paged datasource stores.</span></summary>

```ts generated
queryCapability?(sheet: SheetId): QueryCapability;
```

</details>

<details class="api-member" id="store-get-cell-load-state" data-pagefind-weight="1">
<summary><code>getCellLoadState</code> <span class="api-member-summary">Loaded/empty/local state; dense stores always return a loaded state.</span></summary>

```ts generated
getCellLoadState?(addr: CellAddress): CellLoadState;
```

</details>

<details class="api-member" id="store-acknowledge-operations" data-pagefind-weight="1">
<summary><code>acknowledgeOperations</code> <span class="api-member-summary">Release sparse paged edits after server acknowledgement.</span></summary>

```ts generated
acknowledgeOperations?(operations: readonly DocumentOp[], storageRevision?: bigint): void;
```

</details>

<details class="api-member" id="store-export-snapshot" data-pagefind-weight="1">
<summary><code>exportSnapshot</code> <span class="api-member-summary">Deterministic, JSON-safe authoritative runtime document.</span></summary>

```ts generated
exportSnapshot?(): WorkbookSnapshot;
```

</details>

<details class="api-member" id="store-view-row-count" data-pagefind-weight="1">
<summary><code>viewRowCount</code> <span class="api-member-summary">Displayed row count after any active sort/filter view.</span></summary>

```ts generated
viewRowCount(sheet: SheetId): number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface Store {
  getWorkbook(): Workbook;
  getCell(addr: CellAddress): ResolvedCell;
  getFormula(addr: CellAddress): string | null;
  getRefTarget(addr: CellAddress): CellAddress | null;
  recalculateVolatile(now?: Date): void;
  getVisibleWindow(
    sheet: SheetId,
    rows: {
      start: number;
      end: number;
    },
    cols: readonly number[],
  ): VisibleWindowView;
  getDataWindow?(
    sheet: SheetId,
    rows: {
      start: number;
      end: number;
    },
    cols: readonly number[],
  ): VisibleWindowView;
  getClipboardWindow?(
    sheet: SheetId,
    viewRows: {
      start: number;
      end: number;
    },
    cols: readonly number[],
  ): ClipboardWindowView;
  ensureColumns(sheet: SheetId, columns: readonly Column[]): void;
  applyTransaction(
    tx: Transaction,
    options?: TransactionApplicationOptions,
  ): ApplyTransactionResult;
  setProtectionResolver?(
    resolver: ProtectionResolver | undefined,
    mode?: MutationPolicyMode,
  ): void;
  on(evt: "change", fn: (event: ChangeEvent) => void): () => void;
  queryCapability?(sheet: SheetId): QueryCapability;
  getCellLoadState?(addr: CellAddress): CellLoadState;
  acknowledgeOperations?(
    operations: readonly DocumentOp[],
    storageRevision?: bigint,
  ): void;
  exportSnapshot?(): WorkbookSnapshot;
  viewRowCount(sheet: SheetId): number;
}
```

</details>
