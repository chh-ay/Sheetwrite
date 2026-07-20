---
title: "PendingCommitLoadOptions | @sheetwrite/core"
description: "Mandatory bounds for one durable pending-commit restore."
---
<!-- api-export:@sheetwrite/core|.|PendingCommitLoadOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Mandatory bounds for one durable pending-commit restore.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L23</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="pending-commit-load-options-signal" data-pagefind-weight="1">
<summary><code>signal</code></summary>

```ts generated
signal?: AbortSignal;
```

</details>

<details class="api-member" id="pending-commit-load-options-max-records" data-pagefind-weight="1">
<summary><code>maxRecords</code> <span class="api-member-summary">Maximum records returned for one document queue.</span></summary>

```ts generated
maxRecords: number;
```

</details>

<details class="api-member" id="pending-commit-load-options-max-operations" data-pagefind-weight="1">
<summary><code>maxOperations</code> <span class="api-member-summary">Maximum aggregate operation count returned for one document queue.</span></summary>

```ts generated
maxOperations: number;
```

</details>

<details class="api-member" id="pending-commit-load-options-max-bytes" data-pagefind-weight="1">
<summary><code>maxBytes</code> <span class="api-member-summary">Maximum aggregate UTF-8 bytes of the JSON-encoded operation arrays.</span></summary>

```ts generated
maxBytes: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PendingCommitLoadOptions {
  signal?: AbortSignal;
  maxRecords: number;
  maxOperations: number;
  maxBytes: number;
}
```

</details>
