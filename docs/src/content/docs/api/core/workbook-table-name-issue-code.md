---
title: "WorkbookTableNameIssueCode | @sheetwrite/core"
description: "Stable reason code returned when a workbook table name is rejected."
---
<!-- api-export:@sheetwrite/core|.|WorkbookTableNameIssueCode -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Stable reason code returned when a workbook table name is rejected.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/workbook-table.ts#L32</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type WorkbookTableNameIssueCode =
  | "empty"
  | "too-long"
  | "invalid-characters"
  | "cell-reference"
  | "duplicate";
```

</div>
