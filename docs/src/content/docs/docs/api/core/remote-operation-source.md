---
title: "RemoteOperationSource | @sheetwrite/core"
description: "Host subscription contract for ordered versioned operations."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|RemoteOperationSource -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Host subscription contract for ordered versioned operations.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L113</code></dd></div>
</dl>

## Members <span class="api-count">1</span>

<div class="api-member-list">

<details class="api-member" id="remote-operation-source-subscribe" data-pagefind-weight="1">
<summary><code>subscribe</code></summary>
<pre><code>subscribe( listener: (operation: VersionedOperation) =&gt; void, signal?: AbortSignal, ): undefined | (() =&gt; void);</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface RemoteOperationSource {
    subscribe(listener: (operation: VersionedOperation) => void, signal?: AbortSignal): undefined | (() => void);
}
```

</details>
