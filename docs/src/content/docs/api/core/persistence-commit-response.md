---
title: "PersistenceCommitResponse | @sheetwrite/core"
description: "Applied, duplicate, or conflict acknowledgement from persistence."
---
<!-- api-export:@sheetwrite/core|.|PersistenceCommitResponse -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Applied, duplicate, or conflict acknowledgement from persistence.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L93</code></dd></div>
</dl>

## Variants <span class="api-count">3</span>

<div class="api-variant-list">
<div class="api-variant"><code>{ status: &quot;applied&quot;; version: number; clientMutationId: string; canonicalOperations?: readonly DocumentOp[]; }</code></div>
<div class="api-variant"><code>{ status: &quot;duplicate&quot;; version: number; clientMutationId: string }</code></div>
<div class="api-variant"><code>{ status: &quot;conflict&quot;; currentVersion: number; operationsSinceBase?: readonly VersionedOperation[]; snapshot?: WorkbookSnapshot; }</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export type PersistenceCommitResponse = {
    status: "applied";
    version: number;
    clientMutationId: string;
    canonicalOperations?: readonly DocumentOp[];
} | {
    status: "duplicate";
    version: number;
    clientMutationId: string;
} | {
    status: "conflict";
    currentVersion: number;
    operationsSinceBase?: readonly VersionedOperation[];
    snapshot?: WorkbookSnapshot;
};
```

</details>
