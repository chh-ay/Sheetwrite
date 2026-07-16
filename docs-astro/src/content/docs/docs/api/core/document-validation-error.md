---
title: "DocumentValidationError | @sheetwrite/core"
description: "Path-qualified validation failure for a document operation."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|DocumentValidationError -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Path-qualified validation failure for a document operation.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/document-protocol.ts#L8</code></dd></div>
</dl>

## Members <span class="api-count">3</span>

<div class="api-member-list">

<details class="api-member" id="document-validation-error-path" data-pagefind-weight="1">
<summary><code>path</code></summary>
<pre><code>path: string;</code></pre>
</details>

<details class="api-member" id="document-validation-error-code" data-pagefind-weight="1">
<summary><code>code</code></summary>
<pre><code>code: | &quot;unsupported-schema&quot; | &quot;invalid-value&quot; | &quot;duplicate-id&quot; | &quot;missing-reference&quot; | &quot;out-of-bounds&quot; | &quot;overlapping-merge&quot; | &quot;non-serializable&quot;;</code></pre>
</details>

<details class="api-member" id="document-validation-error-message" data-pagefind-weight="1">
<summary><code>message</code></summary>
<pre><code>message: string;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface DocumentValidationError {
    path: string;
    code: "unsupported-schema" | "invalid-value" | "duplicate-id" | "missing-reference" | "out-of-bounds" | "overlapping-merge" | "non-serializable";
    message: string;
}
```

</details>
