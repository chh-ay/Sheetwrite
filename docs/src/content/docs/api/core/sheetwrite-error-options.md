---
title: "SheetwriteErrorOptions | @sheetwrite/core"
description: "Optional cause, diagnostic context, and boundary-known retryability."
---
<!-- api-export:@sheetwrite/core|.|SheetwriteErrorOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Optional cause, diagnostic context, and boundary-known retryability.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/errors.ts#L105</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="sheetwrite-error-options-context" data-pagefind-weight="1">
<summary><code>context</code></summary>

```ts generated
context?: SheetwriteErrorContext;
```

</details>

<details class="api-member" id="sheetwrite-error-options-retryable" data-pagefind-weight="1">
<summary><code>retryable</code> <span class="api-member-summary">Present only when Sheetwrite can determine retryability from the boundary itself.</span></summary>

```ts generated
retryable?: boolean;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SheetwriteErrorOptions extends ErrorOptions {
  context?: SheetwriteErrorContext;
  retryable?: boolean;
}
```

</details>
