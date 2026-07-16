---
title: "CellNote | @sheetwrite/core"
description: "Serializable plain-text note anchored to a cell."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|CellNote -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Serializable plain-text note anchored to a cell.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L127</code></dd></div>
</dl>

## Members <span class="api-count">2</span>

<div class="api-member-list">

<details class="api-member" id="cell-note-addr" data-pagefind-weight="1">
<summary><code>addr</code></summary>

```ts generated
addr: CellAddress;
```

</details>

<details class="api-member" id="cell-note-text" data-pagefind-weight="1">
<summary><code>text</code></summary>

```ts generated
text: string;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CellNote {
    addr: CellAddress;
    text: string;
}
```

</details>
