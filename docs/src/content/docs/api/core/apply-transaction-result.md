---
title: "ApplyTransactionResult | @sheetwrite/core"
description: "Outcome of applying a document transaction, including conflict, rejection, and no-op states."
---
<!-- api-export:@sheetwrite/core|.|ApplyTransactionResult -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Outcome of applying a document transaction, including conflict, rejection, and no-op states.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L35</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{
  status: "applied";
  epoch: number;
  transaction: Transaction;
  warnings?: MutationIssue[];
  rejections?: MutationIssue[];
}
```

</div>
<div class="api-variant">

```ts generated
{
  status: "conflict";
  expectedEpoch: number;
  actualEpoch: number;
}
```

</div>
<div class="api-variant">

```ts generated
{
  status: "rejected";
  epoch: number;
  issues: MutationIssue[];
}
```

</div>
<div class="api-variant">

```ts generated
{
  status: "noop";
  epoch: number;
  reason: "empty" | "out-of-bounds" | "incomplete-data" | "read-only";
}
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type ApplyTransactionResult =
  | {
      status: "applied";
      epoch: number;
      transaction: Transaction;
      warnings?: MutationIssue[];
      rejections?: MutationIssue[];
    }
  | {
      status: "conflict";
      expectedEpoch: number;
      actualEpoch: number;
    }
  | {
      status: "rejected";
      epoch: number;
      issues: MutationIssue[];
    }
  | {
      status: "noop";
      epoch: number;
      reason: "empty" | "out-of-bounds" | "incomplete-data" | "read-only";
    };
```

</details>
