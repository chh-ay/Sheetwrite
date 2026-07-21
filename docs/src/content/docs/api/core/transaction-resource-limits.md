---
title: "TransactionResourceLimits | @sheetwrite/core"
description: "Public ceilings shared by transaction producers, persistence, transport, and replay."
---
<!-- api-export:@sheetwrite/core|.|TransactionResourceLimits -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Public ceilings shared by transaction producers, persistence, transport,
and replay. Limits measure the submitted operation array itself, not the
logical cell area covered by compact operations.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L13</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="transaction-resource-limits-max-operations" data-pagefind-weight="1">
<summary><code>maxOperations</code> <span class="api-member-summary">DocumentOp objects in one atomic transaction; defaults to 10,000.</span></summary>

```ts generated
maxOperations: number;
```

</details>

<details class="api-member" id="transaction-resource-limits-max-encoded-bytes" data-pagefind-weight="1">
<summary><code>maxEncodedBytes</code> <span class="api-member-summary">UTF-8 bytes in the JSON-encoded DocumentOp array; defaults to 8 MiB.</span></summary>

```ts generated
maxEncodedBytes: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface TransactionResourceLimits {
  maxOperations: number;
  maxEncodedBytes: number;
}
```

</details>
