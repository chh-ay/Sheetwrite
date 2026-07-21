---
title: "SnapshotCell | @sheetwrite/core"
description: "Serializable cell value and optional style inside a snapshot block."
---
<!-- api-export:@sheetwrite/core|.|SnapshotCell -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Serializable cell value and optional style inside a snapshot block.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L253</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="snapshot-cell-row-offset" data-pagefind-weight="1">
<summary><code>rowOffset</code></summary>

```ts generated
rowOffset: number;
```

</details>

<details class="api-member" id="snapshot-cell-col-offset" data-pagefind-weight="1">
<summary><code>colOffset</code></summary>

```ts generated
colOffset: number;
```

</details>

<details class="api-member" id="snapshot-cell-value" data-pagefind-weight="1">
<summary><code>value</code></summary>

```ts generated
value: CellValue;
```

</details>

<details class="api-member" id="snapshot-cell-style" data-pagefind-weight="1">
<summary><code>style</code></summary>

```ts generated
style?: CellStyle;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SnapshotCell {
  rowOffset: number;
  colOffset: number;
  value: CellValue;
  style?: CellStyle;
}
```

</details>
