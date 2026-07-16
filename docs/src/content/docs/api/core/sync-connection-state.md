---
title: "SyncConnectionState | @sheetwrite/core"
description: "Host-controlled online state reported by synchronization."
---
<!-- api-export:@sheetwrite/core|.|SyncConnectionState -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Host-controlled online state reported by synchronization.

<dl class="api-metadata">
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L20</code></dd></div>
</dl>

## Variants <span class="api-count">5</span>

<div class="api-variant-list">
<div class="api-variant"><code>&quot;offline&quot;</code></div>
<div class="api-variant"><code>&quot;connecting&quot;</code></div>
<div class="api-variant"><code>&quot;online&quot;</code></div>
<div class="api-variant"><code>&quot;error&quot;</code></div>
<div class="api-variant"><code>&quot;destroyed&quot;</code></div>
</div>

## Declaration

<details class="api-declaration">
<summary>View full TypeScript declaration</summary>

```ts generated
export type SyncConnectionState = "offline" | "connecting" | "online" | "error" | "destroyed";
```

</details>
