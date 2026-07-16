---
title: "IndexedDbPendingCommitStorageErrorCode | @sheetwrite/core/browser"
description: "Stable category for an IndexedDB pending-storage failure."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|./browser|IndexedDbPendingCommitStorageErrorCode -->
[← @sheetwrite/core/browser](/docs/api/core-browser/)

<span class="api-status">type</span>

Stable category for an IndexedDB pending-storage failure.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/browser</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/indexeddb.ts#L10</code></dd></div>
</dl>

## Variants <span class="api-count">6</span>

<div class="api-variant-list">
<div class="api-variant"><code>&quot;unavailable&quot;</code></div>
<div class="api-variant"><code>&quot;blocked&quot;</code></div>
<div class="api-variant"><code>&quot;aborted&quot;</code></div>
<div class="api-variant"><code>&quot;quota&quot;</code></div>
<div class="api-variant"><code>&quot;unsupported-schema&quot;</code></div>
<div class="api-variant"><code>&quot;transaction&quot;</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export type IndexedDbPendingCommitStorageErrorCode = "unavailable" | "blocked" | "aborted" | "quota" | "unsupported-schema" | "transaction";
```

</details>
