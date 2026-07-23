---
title: "RemoteOperationSource | @sheetwrite/core"
description: "Host subscription contract for ordered versioned operations."
---
<!-- api-export:@sheetwrite/core|.|RemoteOperationSource -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Host subscription contract for ordered versioned operations. Sources that
can pause intake should await the listener promise to preserve backpressure.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L132</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>1</span>

<div class="api-member-list">

<details class="api-member" id="remote-operation-source-subscribe" data-pagefind-weight="1">
<summary><code>subscribe</code></summary>

```ts generated
subscribe( listener: (operation: VersionedOperation) => void | Promise<void>, signal?: AbortSignal, ): undefined | (() => void);
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface RemoteOperationSource {
  subscribe(
    listener: (operation: VersionedOperation) => void | Promise<void>,
    signal?: AbortSignal,
  ): undefined | (() => void);
}
```

</details>
