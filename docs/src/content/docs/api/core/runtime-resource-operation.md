---
title: "RuntimeResourceOperation | @sheetwrite/core"
description: "User-visible operation whose retained and transient resource costs are measured."
---
<!-- api-export:@sheetwrite/core|.|RuntimeResourceOperation -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

User-visible operation whose retained and transient resource costs are measured.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/resource-accounting.ts#L34</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type RuntimeResourceOperation =
  | "startup"
  | "scroll"
  | "ingest"
  | "edit"
  | "dirty-clear"
  | "formula-recompute"
  | "auto-fit"
  | "export"
  | "snapshot"
  | "persistence"
  | "teardown";
```

</div>
