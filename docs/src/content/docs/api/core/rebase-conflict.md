---
title: "RebaseConflict | @sheetwrite/core"
description: "Reason and affected operations for an unsafe document rebase."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|.|RebaseConflict -->
[← @sheetwrite/core](/docs/api/core/)

<span class="api-status">interface</span>

Reason and affected operations for an unsafe document rebase.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/rebase.ts#L15</code></dd></div>
</dl>

## Members <span class="api-count">4</span>

<div class="api-member-list">

<details class="api-member" id="rebase-conflict-code" data-pagefind-weight="1">
<summary><code>code</code></summary>
<pre><code>code: RebaseConflictCode;</code></pre>
</details>

<details class="api-member" id="rebase-conflict-local-operation-index" data-pagefind-weight="1">
<summary><code>localOperationIndex</code></summary>
<pre><code>localOperationIndex: number;</code></pre>
</details>

<details class="api-member" id="rebase-conflict-remote-operation-index" data-pagefind-weight="1">
<summary><code>remoteOperationIndex</code></summary>
<pre><code>remoteOperationIndex: number;</code></pre>
</details>

<details class="api-member" id="rebase-conflict-message" data-pagefind-weight="1">
<summary><code>message</code></summary>
<pre><code>message: string;</code></pre>
</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated title="TypeScript declaration"
export interface RebaseConflict {
    code: RebaseConflictCode;
    localOperationIndex: number;
    remoteOperationIndex: number;
    message: string;
}
```

</details>
