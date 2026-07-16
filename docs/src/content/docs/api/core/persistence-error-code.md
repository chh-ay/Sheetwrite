---
title: "PersistenceErrorCode | @sheetwrite/core"
description: "Stable category for a persistence failure."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|PersistenceErrorCode -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">type</span>

Stable category for a persistence failure.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/persistence.ts#L17</code></dd></div>
</dl>

## Variants <span class="api-count">4</span>

<div class="api-variant-list">
<div class="api-variant"><code>&quot;aborted&quot;</code></div>
<div class="api-variant"><code>&quot;invalid-snapshot&quot;</code></div>
<div class="api-variant"><code>&quot;not-found&quot;</code></div>
<div class="api-variant"><code>&quot;commit-rejected&quot;</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export type PersistenceErrorCode = "aborted" | "invalid-snapshot" | "not-found" | "commit-rejected";
```

</details>
