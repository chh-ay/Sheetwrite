---
title: "RebaseConflictCode | @sheetwrite/core"
description: "Stable conservative-rebase conflict category."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|RebaseConflictCode -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">type</span>

Stable conservative-rebase conflict category.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/rebase.ts#L6</code></dd></div>
</dl>

## Variants <span class="api-count">6</span>

<div class="api-variant-list">
<div class="api-variant"><code>&quot;overlapping-edit&quot;</code></div>
<div class="api-variant"><code>&quot;sheet-removed&quot;</code></div>
<div class="api-variant"><code>&quot;sheet-lifecycle&quot;</code></div>
<div class="api-variant"><code>&quot;formula-structural&quot;</code></div>
<div class="api-variant"><code>&quot;structural-overlap&quot;</code></div>
<div class="api-variant"><code>&quot;unsupported-structural&quot;</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export type RebaseConflictCode = "overlapping-edit" | "sheet-removed" | "sheet-lifecycle" | "formula-structural" | "structural-overlap" | "unsupported-structural";
```

</details>
