---
title: "createWorkerMessageHandler | @sheetwrite/core/worker"
description: "Build the worker-side protocol handler."
tableOfContents: false
---
<!-- api-export:@sheetwrite/core|./worker|createWorkerMessageHandler -->
[← @sheetwrite/core/worker](/docs/api/core-worker/)

<span class="api-status">function</span>

Build the worker-side protocol handler. Keeping the mutable render state
inside the returned closure lets tests exercise the real message contract
without booting a browser Worker.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core/worker</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/worker.ts#L253</code></dd></div>
</dl>

## Signature

```ts generated
function createWorkerMessageHandler(postAcknowledgement: (message: WorkerAcknowledgement) => void): (message: unknown) => void;
```
