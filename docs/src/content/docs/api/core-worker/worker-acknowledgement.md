---
title: "WorkerAcknowledgement | @sheetwrite/core/worker"
description: "Acknowledgement posted back to the sender after a frame actually painted."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|./worker|WorkerAcknowledgement -->
[← @sheetwrite/core/worker](/docs/api/core-worker/)

<span class="api-status">type</span>

Acknowledgement posted back to the sender after a frame actually painted.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/worker</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/worker.ts#L246</code></dd></div>
</dl>

## Members <span class="api-count">1</span>

<div class="api-member-list">

<details class="api-member" id="worker-acknowledgement-type" data-pagefind-weight="1">
<summary><code>type</code></summary>

```ts generated
type: "painted"
```

</details>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export type WorkerAcknowledgement = {
    type: "painted";
};
```

</details>
