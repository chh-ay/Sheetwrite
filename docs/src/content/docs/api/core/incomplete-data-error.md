---
title: "IncompleteDataError | @sheetwrite/core"
description: "Error thrown when an operation requires datasource cells that are not loaded."
---
<!-- api-export:@sheetwrite/core|.|IncompleteDataError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Error thrown when an operation requires datasource cells that are not loaded.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/store/data-engine.ts#L143</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

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

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class IncompleteDataError extends Error {
  constructor(
    sheet: SheetId,
    capability: Extract<
      QueryCapability,
      {
        status: "incomplete";
      }
    >,
  );
  capability: {
    status: "incomplete";
    loadedCells: number;
    totalCells: number;
  };
}
```

</details>
