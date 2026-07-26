---
title: "WorkerAcknowledgement | @sheetwrite/core/worker"
description: "Lifecycle and frame acknowledgements posted back to the sender."
---
<!-- api-export:@sheetwrite/core|./worker|WorkerAcknowledgement -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-worker/">@sheetwrite/core/worker</a><span class="api-status" data-kind="type">type</span></div>

Lifecycle and frame acknowledgements posted back to the sender.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/worker</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/worker.ts#L249</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{ type: "ready" }
```

</div>
<div class="api-variant">

```ts generated
{ type: "fatal"; reason: string }
```

</div>
<div class="api-variant">

```ts generated
{ type: "painted" }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type WorkerAcknowledgement =
  | {
      type: "ready";
    }
  | {
      type: "fatal";
      reason: string;
    }
  | {
      type: "painted";
    };
```

</details>
