---
title: "RebaseConflict | @sheetwrite/core"
description: "Reason and affected operations for an unsafe document rebase."
---
<!-- api-export:@sheetwrite/core|.|RebaseConflict -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Reason and affected operations for an unsafe document rebase.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/rebase.ts#L16</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

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

<details class="api-declaration" data-pagefind-ignore>
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
