---
title: "DocumentValidationResult | @sheetwrite/core"
description: "Success or structured errors returned by document validation."
---
<!-- api-export:@sheetwrite/core|.|DocumentValidationResult -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Success or structured errors returned by document validation.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/document-protocol.ts#L22</code></dd></div>
</dl>

## Variants <span class="api-count">2</span>

<div class="api-variant-list">
<div class="api-variant"><code>{ ok: true; value: WorkbookSnapshot }</code></div>
<div class="api-variant"><code>{ ok: false; errors: DocumentValidationError[] }</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export type DocumentValidationResult = {
    ok: true;
    value: WorkbookSnapshot;
} | {
    ok: false;
    errors: DocumentValidationError[];
};
```

</details>
