---
title: "SnapshotResourceLimits | @sheetwrite/core"
description: "Resource ceilings applied before snapshot normalization or store allocation."
---
<!-- api-export:@sheetwrite/core|.|SnapshotResourceLimits -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Resource ceilings applied before snapshot normalization or store allocation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/document-protocol.ts#L117</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="snapshot-resource-limits-max-sheets" data-pagefind-weight="1">
<summary><code>maxSheets</code></summary>

```ts generated
maxSheets: number;
```

</details>

<details class="api-member" id="snapshot-resource-limits-max-rows-per-sheet" data-pagefind-weight="1">
<summary><code>maxRowsPerSheet</code></summary>

```ts generated
maxRowsPerSheet: number;
```

</details>

<details class="api-member" id="snapshot-resource-limits-max-columns-per-sheet" data-pagefind-weight="1">
<summary><code>maxColumnsPerSheet</code></summary>

```ts generated
maxColumnsPerSheet: number;
```

</details>

<details class="api-member" id="snapshot-resource-limits-max-metadata-entries" data-pagefind-weight="1">
<summary><code>maxMetadataEntries</code></summary>

```ts generated
maxMetadataEntries: number;
```

</details>

<details class="api-member" id="snapshot-resource-limits-max-serialized-bytes" data-pagefind-weight="1">
<summary><code>maxSerializedBytes</code></summary>

```ts generated
maxSerializedBytes: number;
```

</details>

<details class="api-member" id="snapshot-resource-limits-max-logical-cells-per-sheet" data-pagefind-weight="1">
<summary><code>maxLogicalCellsPerSheet</code></summary>

```ts generated
maxLogicalCellsPerSheet: number;
```

</details>

<details class="api-member" id="snapshot-resource-limits-max-dense-cells" data-pagefind-weight="1">
<summary><code>maxDenseCells</code></summary>

```ts generated
maxDenseCells: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SnapshotResourceLimits {
  maxSheets: number;
  maxRowsPerSheet: number;
  maxColumnsPerSheet: number;
  maxMetadataEntries: number;
  maxSerializedBytes: number;
  maxLogicalCellsPerSheet: number;
  maxDenseCells: number;
}
```

</details>
