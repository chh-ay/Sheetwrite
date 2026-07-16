---
title: "IncompleteDataError | @sheetwrite/core"
description: "Error thrown when an operation requires datasource cells that are not loaded."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|IncompleteDataError -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">class</span>

Error thrown when an operation requires datasource cells that are not loaded.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/store/data-engine.ts#L106</code></dd></div>
</dl>

## Members <span class="api-count">2</span>

<div class="api-member-list">

<details class="api-member" id="incomplete-data-error-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(sheet: SheetId, capability: Extract<QueryCapability, { status: "incomplete"; }>);
```

</details>

<details class="api-member" id="incomplete-data-error-capability" data-pagefind-weight="1">
<summary><code>capability</code></summary>

```ts generated
capability: { status: "incomplete"; loadedCells: number; totalCells: number; }
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
class IncompleteDataError extends Error {
    constructor(sheet: SheetId, capability: Extract<QueryCapability, {
        status: "incomplete";
    }>);
    capability: {
        status: "incomplete";
        loadedCells: number;
        totalCells: number;
    };
}
```

</details>
