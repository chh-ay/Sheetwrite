---
title: "RemoteOperationOptions | @sheetwrite/core"
description: "Classification metadata for host-supplied remote operations."
---
<!-- api-export:@sheetwrite/core|.|RemoteOperationOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Classification metadata for host-supplied remote operations.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L69</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="remote-operation-options-commit-reason" data-pagefind-weight="1">
<summary><code>commitReason</code></summary>

```ts generated
commitReason?: CommitReason;
```

</details>

<details class="api-member" id="remote-operation-options-local-replay" data-pagefind-weight="1">
<summary><code>localReplay</code> <span class="api-member-summary">Reapply a durable local mutation as dirty pending state rather than authoritative remote data.</span></summary>

```ts generated
localReplay?: boolean;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface RemoteOperationOptions {
  commitReason?: CommitReason;
  localReplay?: boolean;
}
```

</details>
