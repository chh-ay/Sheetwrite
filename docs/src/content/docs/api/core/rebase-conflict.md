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

```ts generated
code: RebaseConflictCode;
```

</details>

<details class="api-member" id="rebase-conflict-local-operation-index" data-pagefind-weight="1">
<summary><code>localOperationIndex</code></summary>

```ts generated
localOperationIndex: number;
```

</details>

<details class="api-member" id="rebase-conflict-remote-operation-index" data-pagefind-weight="1">
<summary><code>remoteOperationIndex</code></summary>

```ts generated
remoteOperationIndex: number;
```

</details>

<details class="api-member" id="rebase-conflict-message" data-pagefind-weight="1">
<summary><code>message</code></summary>

```ts generated
message: string;
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export interface RebaseConflict {
    code: RebaseConflictCode;
    localOperationIndex: number;
    remoteOperationIndex: number;
    message: string;
}
```

</details>
