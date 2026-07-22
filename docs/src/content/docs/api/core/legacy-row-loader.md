---
title: "LegacyRowLoader | @sheetwrite/core"
description: "Loads one row-only page for the full-width compatibility adapter."
---
<!-- api-export:@sheetwrite/core|.|LegacyRowLoader -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Loads one row-only page for the full-width compatibility adapter.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/legacy-full-width-datasource.ts#L10</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type LegacyRowLoader = (
  request: DataSourceRequest,
) => Promise<LegacyRowPage> | LegacyRowPage;
```

</div>
