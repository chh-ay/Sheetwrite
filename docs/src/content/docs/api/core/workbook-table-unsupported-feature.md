---
title: "WorkbookTableUnsupportedFeature | @sheetwrite/core"
description: "OOXML table features deliberately retained as explicit loss metadata rather than silently flattened into an ordinary range."
---
<!-- api-export:@sheetwrite/core|.|WorkbookTableUnsupportedFeature -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

OOXML table features deliberately retained as explicit loss metadata rather
than silently flattened into an ordinary range.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/table.ts#L28</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type WorkbookTableUnsupportedFeature =
  | "auto-filter"
  | "sort-state"
  | "calculated-columns"
  | "totals-functions"
  | "query-table"
  | "external-data"
  | "extensions";
```

</div>
